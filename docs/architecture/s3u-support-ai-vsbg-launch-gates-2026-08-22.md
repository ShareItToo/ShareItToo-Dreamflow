# S3U external-AI and consumer-dispute launch gates - architecture

Status: locally and CI-verified non-live package on 22.08.2026 at exact
implementation commit `4366a1b84d795d6c68a686284d9ae0ee74107b49` and
successful GitHub Actions run `32556439261`. No production, Store, payment,
external-message or public-release path is enabled.

## Source basis

- Drive Support Packet `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-132`
  through `SUP-136`.
- Current V5.2 legal and Support source-of-truth records in the SIT Drive
  folder. Missing business, provider or professional legal facts remain false.
- Official VSBG sections 36 and 37:
  `https://www.gesetze-im-internet.de/vsbg/__36.html` and
  `https://www.gesetze-im-internet.de/vsbg/__37.html`.
- Regulation (EU) 2024/3228, which repealed the former ODR regulation and
  discontinued the EU ODR platform:
  `https://eur-lex.europa.eu/eli/reg/2024/3228/oj`.

These sources define technical guardrails only. They are not a professional
legal opinion or approval of SIT's eventual wording, participation status or
chosen conciliation body.

## SUP-132 and SUP-133: external AI remains absent

The previous dormant OpenAI client has been replaced by deterministic local
compatibility stubs. The preserved method signatures return only local
fallbacks and contain no endpoint, provider model, prompt, HTTP transport,
response parsing, secret, request logging or remote activation switch.

Four explicit constants keep AI helpers, external AI network use, direct AI
chat and direct-chat transparency false. `isAvailable` is permanently false in
the candidate. A repository validator rejects provider markers, endpoints,
models, HTTP calls, debug logging or a re-enabled flag in the Flutter and
Backend runtime sources.

`SUP-132` is therefore met conservatively by not offering direct AI chat at
all. No transparency label is claimed for a feature that does not exist. Any
future direct AI interaction requires a separate data-flow, transparency,
privacy, consent, provider, security and release package; it cannot be enabled
through the current candidate. `SUP-133` is enforced by build and release
gates rather than by a dormant network client.

## SUP-134 and SUP-135: VSBG configuration and T-053

App and Backend share six explicit configuration fields: approval,
configuration version, conciliation-body name, address, HTTPS website and one
bounded participation status. The configuration is incomplete unless every
field is valid and the exact approved status is present. Placeholder/TBD,
insecure or credentialed URLs and former EU ODR hosts fail closed.

The general app imprint and the Backend public imprint use this gate. An
explicit `PUBLIC_COMPLIANCE_APPROVED=true` startup request is rejected unless
the VSBG configuration is also complete. The public compliance overview
reports the consumer-dispute component separately as `draft` or `approved`.
Thus an unresolved `SUP-135` fact cannot silently become release-ready.

Template T-053 is the only RED support template admitted to a specialized
path. It requires:

- exact case type `legal_authority` and subtype
  `consumer_dispute_information`;
- a complete approved server configuration without an old ODR URL;
- Administrator-only creation;
- server-bound body name, address, website and participation wording;
- immutable rendered-content hash and configuration/policy versions;
- review by a different Administrator; and
- an explicit in-app publication step in simulation/internal-testing mode.

The client cannot provide or override the regulated fields. All other RED
templates remain rejected by both review and publication. T-053 records only
an authenticated in-app message; it has no email, push, provider or live-send
adapter.

## SUP-136: former ODR links

The validator recursively scans app and German legal assets plus the support
template catalog for former EU ODR URLs. The release preflight repeats the
check. A former ODR host in source or configuration fails the gate. The T-053
catalog copy states only that the former platform is no longer operating and
does not link to it.

## Build and release boundary

The Android candidate builder forwards the six compile-time fields but their
defaults remain empty/false. Backend environment examples and Compose profiles
expose the same closed defaults without adding values. The technical regression
runs syntax, focused tests and the default closed validator. Store-required
preflight additionally runs `--require-approved`, so unresolved configuration
blocks Store/public release.

No migration is required. PostgreSQL remains at migration `048`. Payment,
refund, contract, booking, handover/return, damage, `needsReview`, production,
Cloud/VPS/DNS, signing and Store behavior are unchanged.

## Local verification

- Focused Backend, public-page and validator checks passed; the dedicated
  validator has six protected cases.
- The complete Backend suite passed 482 tests against isolated PostgreSQL
  16.15 with every migration through `048`.
- Privacy/Retention protection suites passed all 58 tests; both manifests
  remain draft and fail closed. Legal readiness and both affected P0B hold
  validators remain green without changing their NO-GO/HOLD truth.
- Flutter analyzer remains at the accepted 220-issue baseline with no forbidden
  correctness code.
- The complete Flutter suite passed 361 tests with one documented skip when
  run deterministically at concurrency one. The separate Google-only profile
  passed.
- Web debug build and loopback smoke passed. Android debug APK built with the
  already-installed local OpenJDK 17.
- Default parallel Flutter execution was locally nondeterministic in unrelated
  animated widget tests; the regression script now defaults to concurrency one
  and allows only an explicit positive-integer override.
- GitHub regression `32556439261` is green for exact implementation head
  `4366a1b84d795d6c68a686284d9ae0ee74107b49` and PR merge snapshot
  `4b8ba3ca718dfbea8c9a658a0ccff31eb764c3e3`. Backend passed all 482 tests
  without skips on PostgreSQL 16.14, dependency/history audit, Compose and the
  commit-labelled API image build. Flutter passed the accepted 220-issue
  analyzer baseline, all 361 tests with one documented skip, the separate
  Google-only test, Web smoke/build and Android debug APK. Signed-candidate
  construction and API-image publication remained skipped; Draft PR #7 stayed
  open and unmerged.

## Residual gates

Professional legal review must still confirm SIT's operator identity, section
36 applicability and exact general wording, the competent conciliation body,
the section 37 post-dispute process, participation status and the final public
pages. Named owners, real support operation, delivery channels and production
configuration remain absent. Direct AI remains excluded rather than approved.

No production, VPS, Cloud, DNS, payment, payout, Store, signed-candidate,
public-pilot, external-message, notification, PR merge or live-data action is
part of S3U.
