import { vValidator } from "@hono/valibot-validator";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import * as v from "valibot";

import { fetchContributions, GitHubError } from "./github";
import { seal, unseal } from "./session";

type Bindings = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
};
type Env = { Bindings: Bindings };

const SESSION_COOKIE = "session";
const STATE_COOKIE = "oauth_state";
const RETURN_TO_COOKIE = "oauth_return_to";
// ponytail: no refresh flow, users sign in again when the 8h GitHub App token expires.
const SESSION_MAX_AGE = 8 * 60 * 60;
const OAUTH_MAX_AGE = 10 * 60;

const contributionsQuery = v.object({
  username: v.pipe(v.string(), v.regex(/^[a-z\d][a-z\d-]{0,38}$/i)),
  year: v.pipe(
    v.string(),
    v.regex(/^\d{4}$/),
    v.transform(Number),
    v.minValue(2008),
    v.check((year) => year <= new Date().getUTCFullYear()),
  ),
});

const loginQuery = v.object({
  // Same-origin paths only: no protocol-relative URLs, backslashes or whitespace
  // (browsers strip tabs and newlines, which would turn "/\t/x" into "//x").
  returnTo: v.optional(v.pipe(v.string(), v.regex(/^\/(?!\/)[^\s\\]*$/)), "/"),
});

const callbackQuery = v.object({
  code: v.optional(v.string()),
  state: v.optional(v.string()),
});

function cookieOptions(c: Context<Env>, maxAge: number) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge,
  } as const;
}

const app = new Hono<Env>()
  .get("/api/contributions", vValidator("query", contributionsQuery), async (c) => {
    const session = getCookie(c, SESSION_COOKIE);
    const token = session && (await unseal(session, c.env.SESSION_SECRET));
    if (!token) return c.json({ error: "unauthorized" } as const, 401);

    const { username, year } = c.req.valid("query");
    try {
      return c.json(await fetchContributions(token, username, year));
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      if (error.status === 401) {
        deleteCookie(c, SESSION_COOKIE, { path: "/" });
        return c.json({ error: "unauthorized" } as const, 401);
      }
      return c.json({ error: "github_error" } as const, error.status);
    }
  })
  .get("/api/auth/login", vValidator("query", loginQuery), (c) => {
    const state = crypto.randomUUID();
    const options = cookieOptions(c, OAUTH_MAX_AGE);
    setCookie(c, STATE_COOKIE, state, options);
    setCookie(c, RETURN_TO_COOKIE, c.req.valid("query").returnTo, options);

    const params = new URLSearchParams({
      client_id: c.env.GITHUB_CLIENT_ID,
      redirect_uri: new URL("/api/auth/callback", c.req.url).href,
      state,
    });
    return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
  })
  .get("/api/auth/callback", vValidator("query", callbackQuery), async (c) => {
    const { code, state } = c.req.valid("query");
    const expectedState = getCookie(c, STATE_COOKIE);
    const returnTo = getCookie(c, RETURN_TO_COOKIE) ?? "/";
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    deleteCookie(c, RETURN_TO_COOKIE, { path: "/" });
    // Also covers the user cancelling on GitHub, which redirects without a code.
    if (!code || !expectedState || state !== expectedState) {
      return c.redirect("/");
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const { access_token: token } = await response
      .json()
      .then((body) => body as { access_token?: string })
      .catch(() => ({ access_token: undefined }));
    if (!token) return c.json({ error: "login_failed" } as const, 502);

    setCookie(
      c,
      SESSION_COOKIE,
      await seal(token, c.env.SESSION_SECRET),
      cookieOptions(c, SESSION_MAX_AGE),
    );
    return c.redirect(returnTo);
  });

export type AppType = typeof app;
export default app;
