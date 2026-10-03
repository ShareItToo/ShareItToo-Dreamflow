# Apple Web W1 — dormant public configuration evidence contract

Base: `f3cf4302af534fe15e0224fd253126d70ddf96af` on
`codex/master-workflow-20260808`. Source-only successor to
`docs/operations/SIT_APPLE_FACEBOOK_STAGING_WEB_GAP_MAP_2026-10-03.md`.

## Boundary

`lib/services/web_apple_auth_config.dart` is independent, has no production
consumer and receives no environment values. Every public input defaults to
empty; Apple, activation-validation and backend gates default to false.
It returns only a data object describing validated Firebase public options.
It initializes no SDK and enables no UI, login, registration or runtime lane.
Google/Facebook approvals, flags and native Apple approval grant nothing here.

Actual Firebase/Apple console configuration, provider state, Services ID,
team/key bindings, audience access and Apple Web code exchange remain
**NOT VERIFIED**. No real configuration, accepted evidence or secrets ship.
A passing synthetic fixture proves the local contract only.

## Public config binding

The public digest is lowercase SHA256 of UTF-8 compact JSON with keys in this
exact order and no final newline: `projectId`, `messagingSenderId`, `appId`,
`apiKey`, `authDomain`, `backendProjectId`, `authorizedOrigin`.
The independently reviewed `approvedDigest` must equal this digest.

Project ID must have Firebase's existing repository shape (6–30 lowercase
letters/digits/hyphens, first character a letter, final character alphanumeric);
sender is 6–20 digits; app ID binds that sender and `web` with 16–64 lowercase
hex characters; API key uses the existing public Firebase key shape.
Backend project must equal the web project; only its standard
`<projectId>.firebaseapp.com` auth domain is accepted in W1. A custom domain
needs a reviewed successor. Exact origin is `https://staging.shareittoo.com`
and exact API is `https://staging.shareittoo.com/api/v1`; aliases, suffixes,
explicit ports, query strings and trailing slashes fail closed.

## Readiness schema version 1

Exactly the following 28 keys are required. Unknown, missing or null values
reject. JSON must round-trip through Dart's compact `jsonEncode(jsonDecode(raw))`
without changing any bytes; duplicate keys, formatting ambiguity and trailing
newlines therefore reject. Object key order is preserved and need not match
the table order. Maximum input length is 8192 Dart string code units.
`approvedReadinessDigest` separately binds SHA256 of these exact UTF-8 bytes.

| Key(s) | Required value or relationship |
| --- | --- |
| `schemaVersion`, `provider`, `platform` | Integer `1`, `apple`, `web` |
| `origin`, `apiBaseUrl` | Exact staging origin and API above |
| `backendFirebaseProjectId` | Bound backend/public Firebase project |
| `webAppConfigSha256` | Exact public-config digest |
| `callbackUrl` | Exact `https://<bound-auth-domain>/__/auth/handler` |
| `firebaseProviderEnabled`, `firebaseAppleOAuthConfigured` | Boolean true from independent Firebase readback |
| `appleServicesIdSha256`, `firebaseAppleServicesIdSha256` | Same lowercase SHA256 of exact Services ID UTF-8 bytes |
| `appleTeamIdSha256`, `firebaseAppleTeamIdSha256` | Same lowercase SHA256 of exact Team ID UTF-8 bytes |
| `appleKeyIdSha256`, `firebaseAppleKeyIdSha256` | Same lowercase SHA256 of exact Key ID UTF-8 bytes, never key material |
| `applePrimaryAppSignInEnabled`, `appleServicesIdBoundToPrimaryApp` | Boolean true from Apple capability/relationship readback |
| `appleSigningKeyEnabled` | Boolean true from Apple key capability/readback; no private key |
| `appleRedirectDomainSha256` | SHA256 of bound `authDomain` UTF-8 bytes |
| `appleRedirectDomainVerified`, `appleReturnUrlVerified` | Boolean true from exact domain and callback readback |
| `scope` | `private_pilot` |
| `audience`, `audienceVerified` | `existing_allowlisted_accounts_only`, boolean true |
| `providerReadbackSha256` | SHA256 of the exact sanitized retained readback bytes reviewed externally |
| `observedAtUtc`, `validUntilUtc` | Canonical UTC seconds `YYYY-MM-DDTHH:mm:ssZ` |

The observation must be no later than the injected clock; expiry must be
strictly later than observation and the clock must be strictly before expiry.
The interval may be at most **24 hours**, an explicit conservative W1 local
evidence policy, not an Apple/Firebase documented provider requirement.
The producer must supply both timestamps; no validity default is invented.
Impossible dates, offsets, fractional seconds, future observations, stale or
overlong intervals reject. Any later runtime consumer must recheck freshness
at use time, not cache a successful selection indefinitely.

Digests provide byte consistency, not a signature or proof that an operator
observed the provider. Hashing invented values is not approval. Evidence must
be acquired/reviewed independently, and its public-safe sanitized snapshot
must bind exactly what its digest describes. Never digest a hidden full
snapshot while presenting the digest as verification of a different redaction.
ID hashes are correlation values, not guarantees of anonymization. Do not
include raw account identifiers, email, members, private keys, OAuth tokens,
authorization codes or credentials. The exact-key/type contract excludes
additional payload fields but does not replace review of evidence provenance.

The audience assertion is prerequisite evidence only: it does not implement
or replace server allowlisting and grants no new-registration permission.
Existing backend staging registration restrictions remain authoritative.

## Focused verification and successor

Run from repository root:

```sh
flutter test --no-pub test/web_apple_auth_config_test.dart
flutter analyze --no-pub lib/services/web_apple_auth_config.dart test/web_apple_auth_config_test.dart
node --test test/tool/web_apple_config_boundary.test.mjs
node backend/ops/scan_git_secrets.mjs --working-tree-only
git diff --check
```

VM tests exercise a complete positive synthetic fixture and default-off,
missing-field/type, foreign-binding, hash, callback, provider, audience,
freshness and ambiguous-JSON rejection. Node checks ensure no production
consumer exists and the staging profile stays off. They are not browser,
provider, build, deployment or release evidence.

Local W1 result: VM **106/106**, Node **3/3**, no skips or failures; focused
analyzer reported no issues. Working-tree secret scan and diff whitespace
checks passed. Only the standalone contract, its two tests and this document
belong to W1; no existing runtime or manifest file is changed by this package.

NEXT: a separately bounded Apple W2 acquisition/revocation design contract
must establish a backend-compatible authorization-code/refresh-material path,
nonce/principal/cancellation/cleanup ownership and deletion/revocation proof.
Firebase Web acquisition success alone does not prove that a code consumed
by Firebase can be exchanged again by SIT. Do not integrate W1 into startup,
runtime, UI or build flags until that gap and the separate approval/readback
gates are resolved. Existing Firebase-app compatibility and memory persistence
will require focused integration tests when that later package is authorized.

ShareItToo pilot guardrails remain unchanged; no payment, delivery, photo,
handover, vehicle, insurance or deposit behavior is touched.
