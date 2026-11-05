<p align="center"><img align="center" src="./favicon.svg" width=100 height=100>
<h1 align="center">GitHub City</h1></p>

<p align="center">
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/honzaap/GitHubCity?style=flat-square">
  <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/honzaap/GitHubCity?color=2411ed&style=flat-square">
  <img alt="GitHub" src="https://img.shields.io/github/license/honzaap/GitHubCity?style=flat-square">
</p>

### What would Your city look like?

<p><a href="https://honzaap.github.io/GithubCity/">Create</a> a 3D city from your GitHub contributions 🏙</p>

### About

<p>GitHub City uses ThreeJS to generate a 3D city from your GitHub contribution graph.</p>
<p>Using hardware acceleration is highly recommended!</p>

## Installation

```sh
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```

## GitHub App setup

1. Create an app at https://github.com/settings/apps/new.
2. Set any name and the Homepage URL.
3. Set Callback URL to `http://localhost:5173/api/auth/callback` and add the production URL `https://<worker-domain>/api/auth/callback`.
4. Keep **Expire user authorization tokens** enabled. Tokens expire after 8 hours; users must sign in again because refresh is not implemented.
5. Leave Setup URL empty and turn **Active** off under Webhook.
6. No permissions are needed; the app reads public contribution data only.
7. Choose **Any account** under installable accounts if other users should sign in.
8. Create the app, copy its Client ID, and generate a client secret.
9. Copy `.dev.vars.example` to `.dev.vars`. Set the three secrets; generate `SESSION_SECRET` with `openssl rand -base64 32`.

## Deploy to Cloudflare

Configure the production callback URL above, then use:

```sh
pnpm wrangler login
pnpm wrangler secret put GITHUB_CLIENT_ID
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put SESSION_SECRET
pnpm build && pnpm wrangler deploy
```

Visitors must sign in because GitHub's GraphQL API does not allow anonymous access.
