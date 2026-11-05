// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchContributions, getConvertedContributions, getLoginUrl } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("contribution API client", () => {
  test("preserves missing days in partial first and last weeks", () => {
    const result = getConvertedContributions([
      { contributionDays: [{ weekday: 2, contributionCount: 4 }] },
      { contributionDays: [{ weekday: 5, contributionCount: 7 }] },
    ]);
    expect(result[2]).toEqual([4, -1]);
    expect(result[5]).toEqual([-1, 7]);
    expect(result[0]).toEqual([-1, -1]);
  });

  test("returns contribution weeks on success", async () => {
    const weeks = [{ contributionDays: [{ weekday: 0, contributionCount: 2 }] }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ user: { contributionsCollection: { contributionCalendar: { weeks } } } }),
      ),
    );
    expect(await fetchContributions("octocat", "2025")).toEqual(weeks);
  });

  test("distinguishes unauthorized from other HTTP and transport failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    expect(await fetchContributions("octocat", "2025")).toBe(401);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 502 })),
    );
    expect(await fetchContributions("octocat", "2025")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await fetchContributions("octocat", "2025")).toBeNull();
  });

  test("encodes returnTo in the login URL", () => {
    const url = new URL(getLoginUrl("/?name=a&year=2025"));
    expect(url.pathname).toBe("/api/auth/login");
    expect(url.searchParams.get("returnTo")).toBe("/?name=a&year=2025");
  });
});
