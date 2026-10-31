# PF2 — External gate execution board

Status: **HOLD / NO-GO**

Assessed: 2026-08-27

Machine source: `docs/evidence/external-gates/external-gate-execution-board.json`

This board converts the eleven already known external gates into executable,
stage-specific lanes. It does not approve a pilot, a payment flow, a Store
submission or a public launch. “Technically prepared” means only that the
repository contains a fail-closed checklist, evidence schema or runbook. The
external result is still missing for every gate.

## Classification overview

| # | Gate | First blocking tier | Current state | Release token |
|---:|---|---|---|---|
| 1 | `legal_and_operator_approval` | BLOCKIERT STUFE A | prepared; professional and authentic operator evidence missing | `PILOT_STAGE_A_LEGAL_OPERATOR_EVIDENCE_ACCEPTED` |
| 2 | `operations_roles_and_absence` | BLOCKIERT STUFE A | prepared; assignments and human absence tests missing | `PILOT_STAGE_A_OPERATIONS_EVIDENCE_ACCEPTED` |
| 3 | `ios_apple_signing_and_device` | KANN FÜR STUFE A ZURÜCKGESTELLT WERDEN | Android evidence exists; iOS account, signing and device evidence missing | `IOS_PLATFORM_GATE_DECISION` |
| 4 | `firebase_owner_terms_and_controls` | BLOCKIERT STUFE A | last physical default-off proof is historical `2026082302`; current `2026082601` owner-console and device confirmation missing | `PILOT_STAGE_A_FIREBASE_OWNER_CONTROLS_CONFIRMED` |
| 5 | `support_evidence_scanner_and_upload_policy` | KANN FÜR STUFE A ZURÜCKGESTELLT WERDEN | intake disabled; scanner and policy decisions missing | `SUPPORT_EVIDENCE_SCANNER_POLICY_ACCEPTED` |
| 6 | `psp_contract_and_sandbox_e2e` | BLOCKIERT NUR STUFE B | prepared; provider, contract and eight authentic scenarios missing | `PILOT_STAGE_B_PSP_CONTRACT_SANDBOX_ACCEPTED` |
| 7 | `privacy_retention_and_legal_hold` | BLOCKIERT STUFE A | prepared; professional and owner decisions missing | `PILOT_STAGE_A_PRIVACY_RETENTION_EVIDENCE_ACCEPTED` |
| 8 | `store_submission_and_closed_testing` | BLOCKIERT STUFE A | exact `2026082601` is an inactive Internal draft; old `2026082302` Pixel evidence is historical only; release/update/current-device evidence missing | `PILOT_STAGE_A_ANDROID_DISTRIBUTION_EVIDENCE_ACCEPTED` |
| 9 | `economics_and_cost_inputs` | BLOCKIERT NUR STUFE C | cockpit prepared; authentic costs and profitability missing | `PILOT_STAGE_C_ECONOMICS_EVIDENCE_ACCEPTED` |
| 10 | `pilot_region_roster_and_scope` | BLOCKIERT STUFE A | exact envelope prepared; all four prerequisites open | `PILOT_STAGE_A_ENVELOPE_EVIDENCE_ACCEPTED` |
| 11 | `explicit_activation_decision` | BLOCKIERT STUFE A | HOLD; separate Walid decision missing | `PILOT_STAGE_A_DECISION` |

Counts: seven Stage-A blockers, one Stage-B-only blocker, one Stage-C-only
blocker and two explicitly deferred Stage-A capabilities. All eleven lanes are
also classified **TECHNISCH BEREIT, EXTERNE EVIDENZ FEHLT**. Zero release
tokens are issued.

The Stage-A Store lane is limited to proving the exact protected Android
candidate and the selected private closed-test distribution route. It does not
authorize public Store submission. iOS remains outside Stage A. Arbitrary
Support evidence upload also remains disabled; Stage-A Support is limited to
text and already-controlled booking evidence.

## Executable lanes

### 1. Legal and operator

- Goal/evidence: review V5.2 for the bounded pilot and authenticate operator
  and active-provider facts. The 18-decision intake, manifests and provider
  inventories are prepared; professional approval, operator facts, provider
  contracts/DPAs and approved hashes/URLs are missing.
- Owner/cost/contract/Walid: Walid plus an independent qualified German
  marketplace and consumer-law reviewer. Quote unknown; cost approval is
  required first. Professional review and existing contract/DPA evidence are
  required. Walid must be present.
- Next/dependency: send the prepared intake only after quote approval. No
  prerequisite lane. Stop before engagement, contract acceptance, publication
  or an unsupported approval claim.

### 2. Operations roles and absence

- Goal/evidence: assign six real primary roles and six distinct delegates and
  execute four human absence tests. Procedures and four technical rehearsals
  are complete; assignments, RBAC/MFA evidence and human tests are missing.
- Owner/cost/contract/Walid: Walid and the authentic Stage-A Operations owner.
  Staffing time/cost is unknown and must be approved; contracts depend on the
  eventual employment/delegation model. Walid must be present.
- Next/dependency: after Legal/Operator, assign people only in the authoritative
  company system and return sanitized references. Stop before putting personal
  data in Git/chat, changing access or asserting unexecuted tests.

### 3. iOS, Apple signing and device

- Goal/evidence: prepare iOS only when it enters scope. Android signed/device
  evidence exists; Apple membership, full Xcode/CocoaPods, signing and physical
  iPhone/TestFlight evidence are missing.
- Owner/cost/contract/Walid: Walid and the future iOS release operator. Current
  membership price/terms are unknown; purchase approval and Apple agreements
  would be required. Walid must be present.
- Next/dependency: defer while Stage A is Android-only with no iOS/TestFlight
  claim. Stop before purchase, terms, 2FA, signing, app-record creation or
  installation. This does not block Stage A but blocks iOS capability.

### 4. Firebase owner controls

- Goal/evidence: confirm current owner terms and the exact Auth, FCM, deletion,
  retention and Maps-key controls. Fail-closed inventories exist. The last
  direct physical proof belongs only to historical candidate `2026082302`:
  separate Push and voluntary Crash-diagnostics controls were observed twice,
  both off, without opening consent or requesting an opt-in-dependent
  registration/report. Current Play draft `2026082601` has no transferred
  device-control pass. Sanitized owner-console confirmation is still missing.
- Owner/cost/contract/Walid: Walid as owner. Plan/usage cost is unknown and must
  be approved; current provider terms/DPA evidence is required. Walid must be
  present.
- Next/dependency: after Legal and Privacy, record yes/no evidence without
  changing provider state. Stop at login, 2FA, terms acceptance, key/secret,
  billing or production changes.

### 5. Support evidence scanner and upload policy

- Goal/evidence: approve scanner and file policy before arbitrary intake. The
  intake is disabled and eight decisions are machine tracked; provider/security,
  MIME/size, retention/Legal Hold and operator approvals are missing.
- Owner/cost/contract/Walid: Walid plus Security and Privacy reviewers. Cost is
  unknown and depends on managed versus self-hosted choice; a provider contract
  or reviewed self-hosting model is conditional. Walid must be present.
- Next/dependency: after Privacy and Operations, compare reviewed options and
  use synthetic files only. For Stage A keep uploads disabled. Stop before
  selection, purchase, contract, external upload or intake activation.

### 6. PSP contract and sandbox E2E

- Goal/evidence: for Stage B, select a licensed Marketplace PSP and pass all
  eight authorization/capture/payout/refund/chargeback/ledger scenarios. The
  test schema exists; provider, KYC, DPA/region/transfer, secrets and authentic
  scenario evidence are missing.
- Owner/cost/contract/Walid: Walid plus Payments, Legal, Tax and Accounting
  reviewers. Quotes and transaction fees are unknown and require prior
  approval; a Marketplace PSP contract and DPA are required. Walid must be
  present.
- Next/dependency: after Legal, Privacy and Operations, compare offers and seek
  review. Keep Stage A synthetic. Stop before commitment, KYC, contract, secret,
  paid activation or real-money use.

### 7. Privacy, retention and Legal Hold

- Goal/evidence: close six Privacy decisions and ten retention/deletion/Legal
  Hold decisions. Inventories and fail-closed validators exist; professional
  decisions and authentic active-provider facts are missing.
- Owner/cost/contract/Walid: Walid plus an independent qualified Privacy and
  retention reviewer. Quote unknown and requires approval; provider DPA evidence
  and professional review are required. Walid must be present.
- Next/dependency: after Legal, provide the prepared matrices and authentic
  contracts, then store sanitized decisions. Stop before inventing periods,
  accepting contracts, changing providers or publishing disclosures.

### 8. Store submission and closed testing

- Goal/evidence: prove the exact protected Android candidate and private
  distribution route; public Store approval remains a later Stage-C gate.
  Exact current candidate `2026082601` is signed, hash-bound and owner-reported
  as uploaded, processed and saved only as an inactive Google Play Internal
  draft. Active Internal version `2026081509` remains unchanged, the OnePlus is
  expected to contain that old build and every `2026082601` device result is
  `NOT_RUN`.
- Historical boundary: direct Pixel evidence for `2026082302` covers binary
  privacy, data-preserving update, 200% touch targets, restart, authenticated
  cold starts, offline recovery, navigation, legal routes, large text, safe
  links and fail-closed TalkBack activation attempts. These physical passes do
  not transfer to `2026082601` because the application source changed.
- Missing now: `GOOGLE_PLAY_INTERNAL_RELEASE_GO`, Play-delivered update to
  `2026082601`, current-candidate OnePlus identity/lifecycle evidence, protected
  review access, manual visual review and manual TalkBack traversal.
- Owner/cost/contract/Walid: Walid and the authorized release operator. Existing
  Google registration is paid; new costs are unknown and need prior approval.
  Current platform agreements apply. Walid must be present.
- Next/dependency: with Walid present, re-open exact inactive Internal draft
  `2026082601`, verify that it remains inactive and unreviewed, and decide only
  `GOOGLE_PLAY_INTERNAL_RELEASE_GO`. After an authorized Internal activation,
  update the OnePlus through Play and use the separately gated read-only
  preflight and bounded owner-window smoke. Stop before activation without that
  gate, device access without
  `ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO`, review credentials, 2FA,
  submission, agreement acceptance or public publication.

### 9. Economics and cost inputs

- Goal/evidence: replace planning assumptions with authentic fees, cloud cost,
  operator time, attribution and profitability. The read-only cockpit exists;
  actual evidence is unavailable and profitability is undetermined.
- Owner/cost/contract/Walid: Walid plus Finance/Tax/Accounting and Operations.
  Evidence-collection and professional-review cost is unknown and needs prior
  approval; no new contract is implied by the board. Walid must be present.
- Next/dependency: after PSP and a measured pilot, import only sanitized
  authentic inputs. Stop before purchase, contract, production analytics or
  interpreting configured zeroes as actual costs.

### 10. Pilot region, roster and scope

- Goal/evidence: bind the private Android/no-real-money Spiegelberg/Cat8
  envelope to the exact candidate. The 30-adult ceiling and 30–50-flow plan are
  defined; prerequisite evidence, private roster and consent procedure are
  missing.
- Owner/cost/contract/Walid: Walid plus authentic Pilot and Privacy owners.
  Participant/operations cost is unknown and needs prior approval; reviewed
  participant terms/consents are conditional. Walid must be present.
- Next/dependency: after Legal, Operations, Firebase, Privacy and private Android
  distribution evidence, prepare the roster outside Git and keep payment
  synthetic. Stop before personal-data storage, account/invitation creation,
  live configuration or pilot activity.

### 11. Explicit activation decision

- Goal/evidence: make one separate evidence-bound Stage-A GO/NO-GO decision.
  The boundary and dossier mechanics exist; every accepted prerequisite, exact
  candidate binding and Walid's decision are missing.
- Owner/cost/contract/Walid: Walid is the final owner. The decision itself has
  no direct fee; unresolved prerequisite costs still require approval. No new
  contract is created by the decision. Walid must be present.
- Next/dependency: after every Stage-A dependency is externally accepted,
  present one bounded packet and wait for `PILOT_STAGE_A_DECISION`. Stop there;
  no activation may be inferred or performed.

## Safe parallelism and stop rule

Codex may continue preparing sanitized checklists, evidence schemas, validation
and decision packets for independent lanes. A blocked lane does not stop other
non-live lanes. Every lane stops before cost, contract, login/2FA, credentials,
signing, device installation with data risk, Store/provider/cloud mutation,
real money, participant invitation or activation. PF5 must end at
`PILOT_STAGE_A_DECISION`; the token remains unissued.
