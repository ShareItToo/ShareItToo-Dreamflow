# WP260-E — Connect cohort and secure payment landings

## Result

Source commit `b516e37d9ff214296d995bdaa31a3fe2f351d97a` plus the
recovery-provenance correction in the WP260-F closure commit are pushed on
`codex/master-workflow-20260808`; the worktree is clean and local/origin are
equal. The package is source- and regression-complete. No Stripe CLI action,
provider request, production change, Store/Play change or device action was
performed.

## Connect webhook boundary

Every signed Accounts-v2/Connect event is now bound to a persisted local
`stripe_connect_accounts.provider_account_id` before any thin-event provider
retrieval and before `applyProviderEvent` can mutate local state. New/account
configuration events require the mapped principal to be in the union of the
private `PAYMENT_PILOT_USER_IDS` or non-production
`SIT_STAGING_ALLOWED_USER_IDS` cohort. A previously authorized mapping remains
valid provenance for a signed financial recovery event after active-cohort
removal; unknown mappings still fail closed before any provider read or local
event write. No decision is inferred from a current user session.

## Return/open landing boundary

The Connect return page is neutral for every query string; `state=complete`
cannot render success. Payment open links read only a coarse server-side state
(`confirmed`, `pending`, `failed`, `unavailable`, or `unknown`) from the latest
durable booking/payment row. `result=success`, `result=cancelled`, and any
checkout session query value are ignored as evidence. The page contains no
amount, email, provider identifier or access credential and sends the user
back to the authenticated app for the final authorization check. GET and HEAD
are explicitly allowlisted as anonymous staging navigation paths; mutations
remain protected.

## Verification

- Focused payment/domain, webhook, landing, Stripe-gate and staging suites:
  **71/71 passed** (including mapped recovery after cohort removal).
- Real PostgreSQL 16 integration runner (foundation, FK, WP260-D attempt,
  identity and MFA): **passed and cleaned**.
- App route readback in PostgreSQL integration: payment landing returned the
  server-confirmed state and existing payment deep-link assertions passed.
- `node --check` for changed backend modules and `git diff --check`: passed.
- GitHub push: local/origin divergence **0/0** after commit.

## Remaining hold

Stripe sandbox execution remains a separate owner/provider gate. This package
does not authorize Stripe CLI, live/test provider traffic, Connect onboarding,
Play, production, DNS, Firebase or device actions. The next independent
technical package is the Identity provider/verification validator.
