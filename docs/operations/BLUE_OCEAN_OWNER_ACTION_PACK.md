# Blue Ocean Stage-A owner action pack

Version: `N12-OWNER-ACTIONS-2026-08-24.1`

Status: **PREPARED — NOTHING EXECUTED — ALL OWNER/EXTERNAL GATES CLOSED**

This is the compact action surface for the future Stage-A Blue Ocean pilot.
It neither authorizes nor performs account, provider, billing, Console, device,
contract, participant, payment or activation work. No third party was contacted.

The professional review state remains exactly:

```text
PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER
UNREVIEWED_RISK_ACCEPTED
```

This is accepted planning risk, not professional legal approval or a claim of
compliance.

## FREE / NO ACCOUNT ACTION

### F1 — Prepare private operator facts

- Owner: record `SIT_OPERATOR_LEGAL_NAME`, `SIT_OPERATOR_POSTAL_ADDRESS` and
  `SIT_OPERATOR_CONTACT_EMAIL` in the approved private local configuration,
  never in Git, Drive documents, chat, screenshots or logs.
- Check: run `node tool/check_stage_a_operator_config.mjs`; it reports only
  field names/state and never their values.
- Cost: EUR 0 new external spend expected.
- Boundary: complete facts do not activate a pilot or approve legal text.

### F2 — Review the prepared packets

- Owner: read the N9 Wave-0 runbook, N10 Internal Testing handoff, tester
  instructions, feedback template and final N13 dossier when available.
- Codex: keep all references, hashes and HOLD states current.
- Cost: EUR 0 external spend; owner time only.
- Boundary: reading or acknowledging a packet is not an activation token.

## OWNER LOGIN REQUIRED

### L1 — Google Play Internal Testing, later

- Owner login: Google Play Console with passkey/2FA entered only by the owner.
- Later sequence: verify `com.shareittoo.app`, use Internal testing only, upload
  only the exact signed/hash-bound AAB, inspect all warnings, save/recheck, then
  activate only under the separate release gate.
- Tester Google emails: add the three adult accounts manually only after the
  exact Internal release is approved; never store emails or opt-in links in
  Git, Drive specs, chat or sanitized evidence.
- Tokens: `GOOGLE_PLAY_INTERNAL_UPLOAD_GO` or
  `GOOGLE_PLAY_INTERNAL_HOLD`. Upload approval still does not authorize
  activation; that later step requires `GOOGLE_PLAY_INTERNAL_RELEASE_GO`.
- Current state: no AAB upload, tester change or Console mutation performed.

### L2 — Firebase/Google Cloud owner checks, later

- Owner login: review project ownership, plan/billing state, Auth, FCM,
  Crashlytics, retention/deletion and Android key restrictions in a bounded
  owner session without exposing secrets.
- Initial Wave-0 truth remains Analytics OFF, marketing analytics OFF,
  Crashlytics collection OFF and FCM OFF.
- Any agreement, billing, API-key or configuration change is a new explicit
  gate. Login alone authorizes nothing.

### L3 — OpenAI API project/key/billing, later and optional

- Owner login: only after the EUR 5 budget decision, create or select a bounded
  API project, set the owner-controlled billing/spend limit, create a backend-
  only key and place it in the approved secret store without showing it to
  Codex, Git, Drive, Flutter, chat, fixtures or logs.
- Codex: verify only boolean/value-free configuration state and execute one
  separately approved bounded provider test later; no automatic retry loop.
- Current state: no project, key, billing or provider call was created by this
  goal. The manual/mock fallback remains valid.

## PHYSICAL DEVICE REQUIRED

### D1 — Exact Internal candidate on Pixel 7 Pro

- Owner/device: unlock the phone personally, connect to an available approved
  Wi-Fi network and install/update only from the private Google Play Internal
  Testing path.
- Codex: verify Play installer, package, exact future version/build and
  data-preserving update before any human flow. Never enter the device code.
- Run: notice/consent, 3–5 safe listings per opaque slot, edit/preview,
  test-only project/request/handover-return, G5 preservation, accessibility,
  offline/reconnect and privacy/export/erasure checks.
- Stop: wrong build, public exposure, personal-data leak, unexpected provider
  or money flow, wrong-role access, data loss or unsafe physical condition.
- Cost: no new mobile-data requirement; use approved Wi-Fi. No purchase is
  authorized.

## EXTERNAL CONTRACT REQUIRED

### C1 — Professional/legal/operator review

- Deferred now. A later independently selected qualified review and authentic
  operator/provider facts require an external engagement and a separate quoted
  cost approval.
- Until then the two exact risk markers at the top remain visible. No lawyer,
  reviewer or provider is invented, selected or contacted by N12.

### C2 — Provider, scanner and PSP contracts

- External AI: later terms, DPA/region/retention and security review before any
  real image transfer.
- Support scanner/upload: deferred and OFF; listing-photo processing does not
  authorize support evidence intake.
- Marketplace PSP/KYC: deferred and OFF; later selection requires contract,
  tax/accounting, privacy, sandbox E2E, refund/chargeback/payout and ledger
  evidence before any real-money decision.
- No quote request, account, contract, KYC or third-party contact is authorized
  by this pack.

## PAID / COST APPROVAL REQUIRED

### P1 — Optional EUR 5 AI listing pilot budget

- Exact maximum: EUR 5 total provider usage for the bounded Stage-A listing
  experiment; this is a hard cap, not a monthly subscription approval.
- Approve only with `AI_LISTING_PILOT_BUDGET_5_EUR_GO`.
- Keep disabled with `AI_LISTING_PROVIDER_HOLD`.
- Even the GO token does not authorize key disclosure, account creation,
  billing setup or a provider call without the separate owner-login steps and
  a final bounded execution gate.

### P2 — All other spend

- Legal review, scanner, PSP, Apple membership/hardware, paid Cloud/Firebase,
  staffing and external operations remain amount-unknown and unapproved.
- A concrete offer and exact maximum-EUR token are required before any order,
  contract, subscription, plan change or paid call.
- Existing Google Play registration is documented as already paid; N12 does
  not assume every future Console or operating cost is free.

## LATER ONLY

### T1 — Real roles and delegates

- Later privately assign real accountable roles, distinct delegates, RBAC/MFA
  and absence coverage. Founder/Owner temporarily holds Pilot Owner, Pilot
  Support Owner and Privacy Contact for Stage A.
- Codex is never a human accountable role. Independent-review workflows stay
  `NEEDS_INDEPENDENT_REVIEW` and `HOLD` without a real second reviewer.

### T2 — Deferred platform and services

- Apple/iOS/TestFlight: `DEFERRED_NOT_REQUIRED_FOR_STAGE_A`; no Apple login,
  agreement, membership, signing, App Store record or TestFlight action.
- Support scanner/upload: OFF until C2 and a separate activation package.
- PSP/KYC/real money: OFF until a successful Stage A plus later Stage-B gates.
- Firebase telemetry/FCM: initially OFF; activate only after exact consent,
  owner-control, candidate and rollback evidence.

### T3 — Authentic economics

- Later provide approved aggregate sources for Cloud, AI, provider, tax,
  accounting, staffing, Founder replacement time and other real costs.
- Configured zero and synthetic pilot output never count as authentic cost or
  profitability evidence. Current profitability remains undetermined.

### T4 — Heilbronn Wave-0 activation

- Preconditions: exact Internal candidate, operator facts, private three-adult
  roster/consent, privacy/export/erasure/retention, safe provider fallback or
  approved bounded provider, physical safety/support and final N13 dossier.
- Activate later only with `HEILBRONN_WAVE0_ACTIVATION_GO`.
- Keep inactive with `HEILBRONN_WAVE0_HOLD`.
- Activation never authorizes public registration, real money, Production,
  broader testers, Store publication, telemetry or PR merge.

## Recommended order when the owner returns

1. Keep `AI_LISTING_PROVIDER_HOLD` unless the optional EUR 5 experiment is
   wanted after reviewing N13.
2. Complete F1 privately; no value is pasted into chat.
3. At the final decision, choose the Internal upload HOLD/GO token.
4. Only after exact Store installation and all Wave-0 prerequisites choose the
   Heilbronn HOLD/activation token.

The exact six prepared top-level reply tokens are:

```text
AI_LISTING_PILOT_BUDGET_5_EUR_GO
AI_LISTING_PROVIDER_HOLD
GOOGLE_PLAY_INTERNAL_UPLOAD_GO
GOOGLE_PLAY_INTERNAL_HOLD
HEILBRONN_WAVE0_ACTIVATION_GO
HEILBRONN_WAVE0_HOLD
```
