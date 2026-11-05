import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchContributions, GitHubError } from "./github";

afterEach(() => vi.unstubAllGlobals());

type TestDay = { date: string; weekday: number; contributionCount: number };
const day = (date: string): TestDay => ({
  date,
  weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
  contributionCount: 1,
});
const graph = (days: TestDay[]) =>
  Response.json({
    data: {
      user: {
        name: "octocat",
        contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: days }] } },
      },
    },
  });

describe("GitHub contribution requests", () => {
  test("requests exact month boundaries including leap day", async () => {
    const ranges: { from: string; to: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const variables = JSON.parse(init.body as string).variables;
        ranges.push(variables);
        return graph([]);
      }),
    );
    await fetchContributions("token", "octocat", 2024);
    expect(ranges).toContainEqual(
      expect.objectContaining({ from: "2024-02-01T00:00:00Z", to: "2024-02-29T23:59:59Z" }),
    );
    expect(ranges).toContainEqual(
      expect.objectContaining({ from: "2024-12-01T00:00:00Z", to: "2024-12-31T23:59:59Z" }),
    );
  });

  test("deduplicates contributions returned by adjacent chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { from, to } = JSON.parse(init.body as string).variables;
        const start = from.slice(0, 10);
        const end = to.slice(0, 10);
        const matching = ["2024-01-01", "2024-01-02"].filter(
          (date) => date >= start && date <= end,
        );
        return graph([
          ...matching.map(day),
          ...(start === "2024-01-01" ? [day("2024-01-01")] : []),
        ]);
      }),
    );
    const result = await fetchContributions("token", "octocat", 2024);
    const days = result.user.contributionsCollection.contributionCalendar.weeks.flatMap(
      (week) => week.contributionDays,
    );
    expect(days.filter((entry) => entry.date === "2024-01-01")).toHaveLength(1);
    expect(days).toHaveLength(2);
  });

  test.each([403, 429])("maps HTTP %i to rate-limit failure", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status })),
    );
    await expect(fetchContributions("token", "octocat", 2024)).rejects.toMatchObject({
      status: 429,
    });
  });

  test("maps RATE_LIMITED GraphQL errors to 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ errors: [{ type: "RATE_LIMITED" }] })),
    );
    await expect(fetchContributions("token", "octocat", 2024)).rejects.toBeInstanceOf(GitHubError);
    await expect(fetchContributions("token", "octocat", 2024)).rejects.toMatchObject({
      status: 429,
    });
  });

  test("fails a single-day request with 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { from, to } = JSON.parse(init.body as string).variables;
        const target = "2024-01-15T00:00:00Z";
        return from <= target && to >= target
          ? Response.json({ data: { user: { name: "octocat" } } })
          : graph([]);
      }),
    );
    await expect(fetchContributions("token", "octocat", 2024)).rejects.toMatchObject({
      status: 502,
    });
  });
});
