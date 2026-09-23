# SIT Gemini Listing Confirmation Gate Packet — 2026-09-23

Status: **PREPARATION ONLY — no implementation, external message, web access,
CUA action or release decision.**

Target source: ShareItToo worktree
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, exact HEAD
`1360628406736c61ecd26d99fe0b9663994ba47b`.

## Prompt to send only in Gemini Pro + Extended

You are reviewing one bounded ShareItToo listing-UX gate. Open every decisive
local source freshly at exact commit
`1360628406736c61ecd26d99fe0b9663994ba47b` before deciding. Do not infer
current product, legal, platform, provider or release facts from memory,
older reports, snippets or this prompt.

### Exact question

Choose exactly one of **0, 1 or 3 active owner declarations** for the
reachable Blue Ocean / KI listing-assistant confirmation step. “Active
declarations” means visible owner confirmation controls; the choice must
preserve the server contract and owner accountability. For the selected choice
give:

1. the exact German UI wording, including the exact action wording;
2. a technical mapping to the current `review.ownerConfirmations` payload;
3. the treatment of all 11 current IDs, including
   `final_publication`;
4. a justified `LEGAL_UX_RISK` class (`LOW`, `MEDIUM`, `HIGH` or `BLOCKED`)
   with the reason. This is a review-risk classification, not a legal
   conclusion.

The current publication endpoint is exactly:

`/v1/blue-ocean/listing-drafts/:id/publish`

The required explicit action is exactly:

`Anzeige veröffentlichen`

The current publish request carries `review.ownerConfirmations`. There is no
`ai_draft_verified` field in the reviewed source contract; do not invent one,
rename one, or propose it as if it already existed. Today
`final_publication` is one of the 11 IDs. Explain whether it remains an
explicit visible declaration or is derived only from the exact server-checked
publish action. The server-side explicit action and the owner publication audit
must remain mandatory in every option; AI must never auto-publish.

### Non-negotiable product boundaries

- The owner remains responsible for truthful ownership/permission, item
  identity, category, functionality, condition, accessories, price, rental
  settings, availability and pickup region. No wording may transfer that
  responsibility to SIT or the AI.
- At least one current authentic listing photo remains required for
  publication. Preserve the current photo-truth policy: AI-generated or
  materially altered images remain forbidden/limited exactly as currently
  implemented; do not add an unsupported classifier or weaken the existing
  server upload/content-scan and policy checks.
- The handover/return **4+4 photo requirement remains unchanged and out of
  scope**. Do not merge listing confirmation declarations with handover or
  return evidence.
- Dynamic clarification questions remain separate controls and remain required
  when present.
- The AI disclosure/consent and explicit analysis initiation remain separate
  from owner truth declarations.
- Draft recovery, editable AI suggestions, the exact reviewed-content
  fingerprint, price/value confirmation and readiness checks may not be
  silently bypassed.

### Required source-bound review

Freshly open and cite the exact local sources below, with path, commit, line
range and the claim supported:

- `lib/screens/create_listing_screen.dart:212-224,1688-1752,2320-2333,2701-2733,3872-3891`
- `backend/src/listing_ai_draft_domain.js:31-43,272-303`
- `backend/src/blue_ocean_listing_workflow.js:697-712`
- `backend/src/app.js:4669-4673,4712-4725,4734-4751,4786-4818`
- `backend/src/listing_photo_truth_policy.js:1-17,43-79`
- `lib/services/data_service.dart:2138-2152`
- `lib/config/private_pilot_config.dart:27-31,218-225`
- focused tests: `test/tool/blue_ocean_n6_listing_ui_wiring.test.mjs`,
  `backend/test/blue_ocean_listing_workflow.test.js`,
  `backend/test/blue_ocean_listing_store.test.js`,
  `backend/test/blue_ocean_n7_evaluation_corpus.test.js`,
  `test/tool/run_staging_listing_ai_acceptance.test.mjs`.

Do not claim a source was opened when it was not. Do not invent an endpoint,
field, audit record, test result, platform rule, legal rule or normative
requirement. If a current legal or platform statement is needed, freshly open
the primary authoritative source, record its retrieval time and include its
full direct source register entry. If access or freshness cannot be proven,
return `NOT VERIFIED` or `STALE`, never `PASS`.

### Required answer shape

Return exactly:

```text
DECISION: 0 | 1 | 3
STATUS: PASS | FIX | NOT VERIFIED | STALE
EXACT_UI_WORDING: ...
TECHNICAL_MAPPING:
- visible declaration/control -> existing review.ownerConfirmations IDs
- final_publication handling -> ...
- server action/audit -> ...
BOUNDARIES_PRESERVED:
- one authentic listing photo
- AI non-publication
- generated/materially altered image policy
- owner truth responsibility without liability transfer
- handover/return 4+4
- dynamic clarifications and AI disclosure separate
LEGAL_UX_RISK: LOW | MEDIUM | HIGH | BLOCKED — reason
FACTS: ...
INFERENCE: ...
RECOMMENDATION: ...
SOURCE_REGISTER:
- title/path or issuing authority; exact direct URL or repository path;
  commit/version/effective date; retrieval time; supported claim
```

Do not return a legal approval, release approval or implementation approval.
The gate decides only the narrow declaration-count and wording/mapping
question. Any missing decisive source blocks a `PASS`.

## Preparation evidence (not a Gemini decision)

Facts from the exact source set: the client currently presents 11 owner
confirmation controls; the server currently names those 11 IDs and requires
readiness; the publish route checks the exact action string, revalidates the
review and writes `blue_ocean.listing.published_by_owner`; the source contains
no `ai_draft_verified`; active publication requires a photo and the versioned
photo-truth policy; handover/return evidence is not part of this listing UI.

Inference: `final_publication` is a likely presentation duplicate of the exact
publish CTA, but removing it requires a source-reviewed contract decision
because it is currently one of the server readiness IDs. Grouping the factual
claims may reduce clicks only if the server still receives and verifies the
existing IDs or an explicitly reviewed successor mapping.

Recommendation: send the prompt unchanged to Gemini only after the visible
mode is freshly verified as **Pro** with **Extended** thinking. Until then,
implement nothing and treat the listing-confirmation UX package as blocked.
