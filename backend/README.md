# ShareItToo backend

Production API for ShareItToo. It provides:

- email/password authentication with salted scrypt hashes;
- short-lived access tokens and rotating refresh tokens;
- central profiles, listings, rental requests and message threads;
- authenticated image uploads with MIME inspection and an 8 MB limit;
- WebSocket change notifications for live client refreshes;
- one-time email verification and password-reset links;
- PostgreSQL persistence with ownership and participant checks.

The production stack is intentionally isolated from the existing OpenClaw and
Ollama containers. PostgreSQL is only reachable on the private Docker network.
The API is exposed through the existing Caddy instance at `/api`.

## Local checks

From the repository root on macOS, install or verify the repository-pinned
free Backend toolchain first:

```sh
bash scripts/bootstrap_macos_backend_toolchain.sh
bash scripts/bootstrap_macos_backend_toolchain.sh --check
```

The script installs Homebrew Node 22 when missing and activates exactly
`pnpm@11.16.0` through Corepack. It does not configure or contact any SIT
environment.

```sh
cd backend
pnpm install
pnpm test
pnpm run check
pnpm run security:secrets
pnpm run test:postgres:local
```

## Required production secrets

Copy `.env.example` to `.env` outside Git, then replace the database password
and JWT secret with independent cryptographically random values. Never commit
`.env`.

Production email is sent through Google Workspace SMTP relay. The relay must
allow both VPS egress addresses (`2.24.194.2` and
`2a02:4780:75:1ad1::1`), require TLS, and restrict senders to the ShareItToo
domain. Keep `MAIL_TRANSPORT=disabled` until a relay test succeeds, then change
it to `smtp`. If authenticated SMTP is used instead, set `SMTP_USER` and
`SMTP_PASSWORD` in the untracked production `.env` file. The SMTP client uses
the hostname from `APP_PUBLIC_URL` as its EHLO identity so relays do not receive
an internal container name.
