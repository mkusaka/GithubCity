/**
 *  Services for handling GitHub API
 */

import { hc } from "hono/client";
import type { AppType } from "../worker";

const client = hc<AppType>(window.location.origin);
export type ContributionWeek = {
  contributionDays: { weekday: number; contributionCount: number }[];
};

export async function fetchContributions(
  username: string,
  year: string,
): Promise<ContributionWeek[] | 401 | null> {
  try {
    const response = await client.api.contributions.$get({ query: { username, year } });
    if (response.status === 401) return 401;
    if (!response.ok) return null;
    const data = await response.json();
    return data.user.contributionsCollection.contributionCalendar.weeks as ContributionWeek[];
  } catch {
    return null;
  }
}

export function getLoginUrl(returnTo: string): string {
  return client.api.auth.login.$url({ query: { returnTo } }).href;
}

export function getConvertedContributions(contribs: ContributionWeek[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const row: number[] = [];
    for (let j = 0; j < contribs.length; j++) row.push(-1);
    result.push(row);
  }
  for (let i = 0; i < contribs.length; i++) {
    for (const day of contribs[i]!.contributionDays)
      result[day.weekday]![i] = day.contributionCount;
  }
  return result;
}
