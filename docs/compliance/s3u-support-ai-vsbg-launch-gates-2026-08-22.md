# S3U external-AI and VSBG gates - technical compliance record

Status: locally and CI-verified non-live package on 22.08.2026 at exact
implementation commit `4366a1b84d795d6c68a686284d9ae0ee74107b49` and
successful GitHub Actions run `32556439261`. This record is technical evidence,
not legal advice or professional approval.

## Scenario result

- `SUP-132`: direct AI chat is absent. No user is placed into a direct AI
  interaction, and no AI-transparency completion is claimed.
- `SUP-133`: external AI cannot be activated by a candidate flag or dormant
  client. Static regression rejects transport/provider reintroduction.
- `SUP-134`: T-053 has a dedicated Administrator-only, server-configured,
  independent-review, text-form in-app path for the exact post-dispute case.
- `SUP-135`: TBD, unapproved, incomplete or unsafe consumer-conciliation facts
  block public/Store readiness. No body, participation status or approval was
  invented.
- `SUP-136`: former EU ODR links are rejected in app/legal/support content and
  in configured websites.

## Fail-closed controls

- External AI constants are false and no endpoint, HTTP transport, provider
  model, prompt, response parser, secret or request log remains in runtime
  source.
- The candidate privacy inventory records external AI as disabled,
  endpoint-free and with zero data types.
- Consumer-dispute fields are closed by default and must match across Flutter,
  Backend, build and environment contracts.
- Only HTTPS, non-credentialed, non-ODR body websites are accepted.
- `PUBLIC_COMPLIANCE_APPROVED=true` cannot start with an incomplete VSBG
  configuration; the public imprint remains draft independently.
- Only T-053 may use the RED explicit-decision message workflow. Creation is
  Administrator-only, regulated values are server-bound, self-review is
  forbidden, the exact payload hash is approved and publication remains an
  internal in-app record with `externalMessageSent=false`.
- Store-required preflight demands complete approved configuration. The normal
  non-live regression instead verifies the intentionally closed default.

## Legal boundary

Sections 36 and 37 VSBG distinguish general website/terms information from
post-dispute information in text form. Regulation (EU) 2024/3228 discontinued
the former EU ODR platform. S3U uses those official sources only to enforce a
conservative technical boundary and remove stale ODR-link behavior.

Professional review must decide whether and how section 36 applies to the
actual operator facts, confirm the final public wording, competent body,
participation statement and section 37 workflow. The software cannot supply
those missing judgments. The presence of a technically complete test fixture
is not evidence that production facts have been approved.

## Verification

- Complete Backend/PostgreSQL 16.15 suite: 482 passed, zero failed, migrations
  through `048`.
- Complete Flutter suite: 361 passed and one documented skip; separate
  Google-only profile passed.
- Analyzer: accepted 220-issue baseline, no new forbidden correctness code.
- Privacy/Retention: 58 protection tests plus both draft validators passed.
- Legal and affected P0B hold validators passed without changing their open
  legal/provider/operations truth.
- Web debug build, loopback smoke and Android debug APK passed.
- Exact-head GitHub run `32556439261` passed 482 Backend tests without skips on
  PostgreSQL 16.14 and the complete Flutter technical regression for PR merge
  snapshot `4b8ba3ca718dfbea8c9a658a0ccff31eb764c3e3`. Dependency/history audit,
  Compose and commit-labelled API image build passed. Signed-candidate
  construction and API-image publication were skipped; Draft PR #7 remained
  open and unmerged.

Production configuration values, a public page approval, actual T-053 message,
external AI, external delivery, provider communication, payment, Store action,
signed artifact, deployment and PR merge were not performed.
