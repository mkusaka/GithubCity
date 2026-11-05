import { afterEach, expect, test, vi } from "vitest";

import app from "./index";
import { seal, unseal } from "./session";

const env = {
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "session-secret",
};

afterEach(() => vi.unstubAllGlobals());

async function getContributions(query = "username=octocat&year=2024") {
  const cookie = `session=${await seal("token", env.SESSION_SECRET)}`;
  return app.request(`/api/contributions?${query}`, { headers: { cookie } }, env);
}

// Answers like GitHub: ranges of more than `maxDays` fail with a query error.
function stubGitHub(maxDays: number) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { variables } = JSON.parse(init.body as string);
    const from = Date.parse(variables.from);
    const to = Date.parse(variables.to);
    if (to - from >= maxDays * 86_400_000) {
      return Response.json({ errors: [{ message: "Something went wrong" }] });
    }
    const contributionDays = [];
    for (let t = from; t <= to; t += 86_400_000) {
      contributionDays.push({
        date: new Date(t).toISOString().slice(0, 10),
        weekday: new Date(t).getUTCDay(),
        contributionCount: 1,
      });
    }
    return Response.json({
      data: {
        user: {
          name: "Octocat",
          contributionsCollection: {
            contributionCalendar: { weeks: [{ contributionDays }] },
          },
        },
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("splits failing ranges and returns the whole year in Sunday-based weeks", async () => {
  const fetchMock = stubGitHub(7);
  const response = await getContributions();
  expect(response.status).toBe(200);

  const { user } = await response.json();
  const { totalContributions, weeks } = user.contributionsCollection.contributionCalendar;
  const days = weeks.flatMap((week: { contributionDays: unknown[] }) => week.contributionDays);
  expect(user.name).toBe("Octocat");
  expect(totalContributions).toBe(366);
  expect(days).toHaveLength(366);
  expect(weeks).toHaveLength(53);
  expect(weeks[0].firstDay).toBe("2024-01-01");
  expect(weeks[1].contributionDays[0].weekday).toBe(0);
  expect(fetchMock.mock.calls.length).toBeGreaterThan(12);
});

test("does not split when the user is missing or the token is rejected", async () => {
  const notFound = vi.fn(async () =>
    Response.json({ data: { user: null }, errors: [{ type: "NOT_FOUND" }] }),
  );
  vi.stubGlobal("fetch", notFound);
  expect((await getContributions()).status).toBe(404);
  expect(notFound).toHaveBeenCalledTimes(12);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
  const response = await getContributions();
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toContain("session=;");
});

test("requires a valid session and validates the query", async () => {
  const anonymous = await app.request("/api/contributions?username=octocat&year=2024", {}, env);
  expect(anonymous.status).toBe(401);

  const forged = await app.request(
    "/api/contributions?username=octocat&year=2024",
    { headers: { cookie: "session=forged" } },
    env,
  );
  expect(forged.status).toBe(401);

  for (const query of [
    "username=a%20b&year=2024",
    "username=octocat&year=2007",
    "username=octocat&year=abc",
  ]) {
    expect((await getContributions(query)).status).toBe(400);
  }
});

test("login rejects open redirects", async () => {
  for (const returnTo of [
    "//evil.example",
    "/\t/evil.example",
    "/\\evil.example",
    "https://evil.example",
  ]) {
    const response = await app.request(
      `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
      {},
      env,
    );
    expect(response.status).toBe(400);
  }
});

test("login round trip stores the sealed token and returns to the original page", async () => {
  const login = await app.request(
    `/api/auth/login?returnTo=${encodeURIComponent("/?name=octocat&year=2024")}`,
    {},
    env,
  );
  expect(login.status).toBe(302);
  const state = new URL(login.headers.get("location") as string).searchParams.get("state");
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "gh-token" })),
  );
  const callback = await app.request(
    `/api/auth/callback?code=abc&state=${state}`,
    { headers: { cookie } },
    env,
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/?name=octocat&year=2024");
  const session = callback.headers
    .getSetCookie()
    .find((value) => value.startsWith("session="))
    ?.split(";")[0]
    ?.slice("session=".length);
  expect(session).not.toContain("gh-token");
  expect(await unseal(session as string, env.SESSION_SECRET)).toBe("gh-token");

  const badState = await app.request(
    "/api/auth/callback?code=abc&state=wrong",
    { headers: { cookie } },
    env,
  );
  expect(badState.headers.getSetCookie().some((v) => v.startsWith("session=e"))).toBe(false);
});

test("OAuth callback handles cancellation, invalid state, and failed token exchange", async () => {
  const cancelled = await app.request("/api/auth/callback?error=access_denied", {}, env);
  expect(cancelled.status).toBe(302);
  expect(cancelled.headers.get("location")).toBe("/");

  const login = await app.request("/api/auth/login?returnTo=%2Fcity", {}, env);
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const invalidState = await app.request(
    "/api/auth/callback?code=auth-code&state=wrong",
    { headers: { cookie: cookies } },
    env,
  );
  expect(invalidState.headers.get("location")).toBe("/");

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "invalid_grant" })),
  );
  const state = new URL(login.headers.get("location")!).searchParams.get("state");
  const failedExchange = await app.request(
    `/api/auth/callback?code=bad-code&state=${state}`,
    { headers: { cookie: cookies } },
    env,
  );
  expect(failedExchange.status).toBe(502);
});

test("OAuth cookie flags use HttpOnly and SameSite=Lax, with Secure only on HTTPS", async () => {
  const http = await app.request("/api/auth/login", {}, env);
  const httpCookies = http.headers.getSetCookie().join("\n");
  expect(httpCookies).toContain("HttpOnly");
  expect(httpCookies).toContain("SameSite=Lax");
  expect(httpCookies).not.toContain("Secure");

  const https = await app.request("https://example.test/api/auth/login", {}, env);
  expect(https.headers.getSetCookie().every((cookie) => cookie.includes("Secure"))).toBe(true);
});

test.each([403, 429])("returns 429 for GitHub HTTP %i rate limits", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status })),
  );
  expect((await getContributions()).status).toBe(429);
});

test("returns 429 for GitHub GraphQL RATE_LIMITED errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ errors: [{ type: "RATE_LIMITED" }] })),
  );
  expect((await getContributions()).status).toBe(429);
});

test("session cookie is HttpOnly, SameSite=Lax, and Secure for HTTPS callbacks", async () => {
  const login = await app.request("https://example.test/api/auth/login", {}, env);
  const state = new URL(login.headers.get("location")!).searchParams.get("state");
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "gh-token" })),
  );
  const callback = await app.request(
    `https://example.test/api/auth/callback?code=code&state=${state}`,
    { headers: { cookie: cookies } },
    env,
  );
  const session = callback.headers.getSetCookie().find((value) => value.startsWith("session="))!;
  expect(session).toContain("HttpOnly");
  expect(session).toContain("SameSite=Lax");
  expect(session).toContain("Secure");
});
