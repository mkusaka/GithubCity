const GRAPHQL_URL = "https://api.github.com/graphql";
const DAY_MS = 86_400_000;
const QUERY = `query ($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
        name
        contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
                weeks { contributionDays { date weekday contributionCount } }
            }
        }
    }
}`;

export type ContributionDay = {
  date: string;
  weekday: number;
  contributionCount: number;
};

type GraphQLResponse = {
  errors?: { type?: string }[];
  data?: {
    user: {
      name: string | null;
      contributionsCollection?: {
        contributionCalendar?: {
          weeks: { contributionDays: ContributionDay[] }[];
        };
      } | null;
    } | null;
  } | null;
};

type RangeResult = { name: string | null; days: ContributionDay[] };

export class GitHubError extends Error {
  constructor(readonly status: 401 | 404 | 429 | 502) {
    super(`GitHub request failed with status ${status}`);
  }
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// GitHub's GraphQL backend fails on ranges with too many contributions (a month
// with ~40k failed consistently while each of its weeks succeeded), so any range
// that fails is retried as two halves down to single days.
async function fetchRange(
  token: string,
  username: string,
  start: number,
  end: number,
): Promise<RangeResult> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "GithubCity",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        username,
        from: `${isoDate(start)}T00:00:00Z`,
        to: `${isoDate(end)}T23:59:59Z`,
      },
    }),
  });
  if (response.status === 401) throw new GitHubError(401);
  if (response.status === 403 || response.status === 429) {
    throw new GitHubError(429);
  }

  const json: GraphQLResponse | null = response.ok
    ? await response
        .json()
        .then((body) => body as GraphQLResponse)
        .catch(() => null)
    : null;
  if (json?.errors?.some((error: { type?: string }) => error.type === "RATE_LIMITED")) {
    throw new GitHubError(429);
  }
  if (json?.data?.user === null) throw new GitHubError(404);

  const calendar = json?.data?.user?.contributionsCollection?.contributionCalendar;
  if (calendar) {
    return {
      name: json?.data?.user?.name ?? null,
      days: calendar.weeks.flatMap((week) => week.contributionDays),
    };
  }

  if (start === end) throw new GitHubError(502);
  const middle = start + Math.floor((end - start) / DAY_MS / 2) * DAY_MS;
  const [first, second] = await Promise.all([
    fetchRange(token, username, start, middle),
    fetchRange(token, username, middle + DAY_MS, end),
  ]);
  return { name: first.name, days: [...first.days, ...second.days] };
}

// Rebuilds Sunday-based weeks, independent of how the year was split into requests.
function toWeeks(days: ContributionDay[]) {
  const sorted = [...new Map(days.map((day) => [day.date, day])).values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const weeks: { firstDay: string; contributionDays: ContributionDay[] }[] = [];
  for (const day of sorted) {
    const week = weeks.at(-1);
    if (week && day.weekday !== 0) week.contributionDays.push(day);
    else weeks.push({ firstDay: day.date, contributionDays: [day] });
  }
  return weeks;
}

// Same response shape as the original AWS Lambda API.
export async function fetchContributions(token: string, username: string, year: number) {
  // Twelve monthly requests leave room under the Workers subrequest limit for splits.
  const months = await Promise.all(
    Array.from({ length: 12 }, (_, month) =>
      fetchRange(token, username, Date.UTC(year, month, 1), Date.UTC(year, month + 1, 0)),
    ),
  );
  const days = months.flatMap((month) => month.days);
  return {
    user: {
      name: months[0]?.name ?? null,
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: days.reduce((total, day) => total + day.contributionCount, 0),
          weeks: toWeeks(days),
        },
      },
    },
  };
}
