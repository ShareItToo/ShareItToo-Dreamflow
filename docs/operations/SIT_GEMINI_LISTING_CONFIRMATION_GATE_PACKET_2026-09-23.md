# SIT Gemini Listing Confirmation Gate Packet — 2026-09-23

Status: **CLOSED — DECISION 1 / PASS.** This immutable record binds the
Gemini Pro + Extended gate outcome; it is not a legal conclusion or release
approval.

Target source: ShareItToo worktree
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, exact source
HEAD supplied to the gate `1360628406736c61ecd26d99fe0b9663994ba47b`.

## Immutable gate decision

- Mode: **Gemini Pro + Extended**.
- Decision: **1 active visible owner confirmation / PASS**.
- Exact owner wording: **“Ich habe alle generierten Inseratsdaten (Artikel,
  Zustand, Preis, Verfügbarkeit etc.) geprüft und bestätige deren Richtigkeit
  sowie meine Berechtigung zur Vermietung.”**
- Mapping: the one active confirmation expands to the existing ten factual
  `review.ownerConfirmations` IDs only: `ownership`, `item_identity`,
  `allowed_category`, `functionality`, `condition`, `accessories`,
  `owner_price`, `duration_discounts`, `availability`, `pickup_region`.
- `final_publication` remains in the existing 11-ID payload but is false for
  review/early/AI paths and becomes true only with the exact owner invocation
  of `Anzeige veröffentlichen` through
  `/v1/blue-ocean/listing-drafts/:id/publish`.
- No `ai_draft_verified` field is added or renamed. Server readiness,
  fingerprint/price/photo checks, clarification questions, AI disclosure and
  consent, explicit analysis initiation, draft recovery/editability,
  `autoPublishAllowed: false`, and
  `blue_ocean.listing.published_by_owner` remain mandatory.
- Guardrails retained: one authentic listing photo; `listing-photo-truth-v1`;
  generated/materially altered product images forbidden; handover/return 4+4;
  no vehicle/transport, paid delivery/shipping/express, deposit or insurance;
  10% fee and payment after owner acceptance.

### Sol source register supplied to Gemini

No external sources were used. Gemini did **not** open local files or Git.
The technical source was the Sol capsule bound to the supplied product HEAD
`1360628406736c61ecd26d99fe0b9663994ba47b`:

| Source | SHA-256 |
| --- | --- |
| `lib/screens/create_listing_screen.dart` | `8f614158bdb145642856048c6c3a32d998d1e967a2228f58933ef06f0fbd9bfd` |
| `backend/src/app.js` | `3109d02ecf91aab92261eb0d3ac199e85649b1db58e49110359701dfcc664efb` |
| `backend/src/blue_ocean_listing_workflow.js` | `253a6d9c323d45256537bccaf10423eec0964929f4f7eadd8db8d7a0b28514b3` |
| `backend/src/listing_ai_draft_domain.js` | `91f6e5abe557a8a518ddfb6d180a313629b27ec5c57f53c79a785bd06c9f2684` |
| `backend/src/listing_photo_truth_policy.js` | `5edafaadff65b990e931b021904da1b1306210b39aadfef43f748d68b33e5ba9` |
| `lib/services/data_service.dart` | `cce04e10456801644408f2100db3b179711d531600c09bff2672b1126b732449` |
| `lib/config/private_pilot_config.dart` | `869bb82f4c4f860fa3101b0e6f891d2c9e511f30dbe85e66f2af11a3af2446ec` |

Implementation and focused closure evidence are recorded in the package
commit that follows this decision record.

Gemini in the browser has no demonstrated access to this local filesystem or
Git repository. Do not ask Gemini to open local paths or claim that it opened
them. The technical facts below are the compact Sol-verified gate input,
extracted from product HEAD `1360628406736c61ecd26d99fe0b9663994ba47b` and
bound to the listed SHA-256 values. The current documentation packet is a
docs-only correction successor to commit
`9e8e159511de8f486687ad8acf9e604df4b77be5`.

## Prompt to send only in Gemini Pro + Extended

You are reviewing one bounded ShareItToo listing-UX gate. Use the supplied
technical fact capsule as the technical source for this gate. Local files and
Git commits are not externally accessible in your browser; do not claim to
have opened them. Do not infer current product, legal, platform, provider or
release facts from memory, older reports, snippets or this prompt.

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

### Technical fact capsule (Sol-verified; use as provided)

All excerpts below are from product HEAD
`1360628406736c61ecd26d99fe0b9663994ba47b`. The path and hash identify the
source binding; they do not imply that Gemini opened the local file.

`lib/screens/create_listing_screen.dart:212-224`

```dart
  final Map<String, bool> _blueOceanConfirmations = <String, bool>{
    'ownership': false,
    'item_identity': false,
    'allowed_category': false,
    'functionality': false,
    'condition': false,
    'accessories': false,
    'owner_price': false,
    'duration_discounts': false,
    'availability': false,
    'pickup_region': false,
    'final_publication': false,
  };
```

`lib/screens/create_listing_screen.dart:1742-1752`

```dart
    if (!forceInactive &&
        acceptedExistingPhotos.isEmpty &&
        _pickedImages.isEmpty &&
        _blueOceanPhotoUrls.isEmpty) {
      if (!mounted) return;
      await _showOwnedListingMessage(
        owner,
        title: 'Mindestens ein Foto erforderlich',
        message:
            'Füge ein echtes Foto des Artikels hinzu, bevor du die Anzeige veröffentlichst.',
```

`backend/src/listing_ai_draft_domain.js:31-43`

```js
export const listingAiOwnerConfirmationIds = Object.freeze([
  'ownership',
  'item_identity',
  'allowed_category',
  'functionality',
  'condition',
  'accessories',
  'owner_price',
  'duration_discounts',
  'availability',
  'pickup_region',
  'final_publication',
]);
```

`backend/src/listing_ai_draft_domain.js:293-298`

```js
    ownerConfirmations: normalizedConfirmations,
    generatedAt: instant(generatedAt, 'invalid_listing_ai_generated_at'),
    publicationAction: 'explicit_owner_action_required',
    autoPublishAllowed: false,
    historicalListingRewriteAllowed: false,
```

`backend/src/app.js:4669-4673`

```js
  app.post('/v1/blue-ocean/listing-drafts/:id/publish', blueOceanListingMutationLimiter, requireAuth, requireActiveAccount, requireUnsuspendedScope('listing'), asyncRoute(async (req, res) => {
    assertBlueOceanListingTechnicalAccess();
    if (req.body?.explicitAction !== 'Anzeige veröffentlichen') {
      throw new HttpError(409, 'blue_ocean_explicit_publication_required');
    }
```

`backend/src/app.js:4712-4725`

```js
    const review = reviewBlueOceanListingDraft({
      previousRevision: stored.revision,
      generationKey: req.body?.review?.generationKey,
      editedFields: req.body?.review?.editedFields,
      answeredClarificationIds: req.body?.review?.answeredClarificationIds,
      ownerConfirmations: req.body?.review?.ownerConfirmations,
      pricing: req.body?.review?.pricing,
      previewDays: req.body?.review?.previewDays,
      imagePreflightPassed: stored.row.image_preflight_status === 'consumed',
      consentValid: stored.row.disclosure_version != null
        && stored.row.disclosure_accepted_at != null,
    });
    const authorization = assertBlueOceanExplicitPublication(review, {
      explicitOwnerAction: true,
    });
```

`backend/src/blue_ocean_listing_workflow.js:697-712`

```js
export function assertBlueOceanExplicitPublication(review, { explicitOwnerAction }) {
  const value = object(review, 'blue_ocean_review_invalid');
  if (explicitOwnerAction !== true) fail(409, 'blue_ocean_explicit_publication_required');
  if (value.readiness?.readyToPublish !== true
      || value.readiness?.state !== 'READY_TO_PUBLISH') {
    fail(409, 'blue_ocean_draft_not_ready_to_publish', value.readiness);
  }
  return deepFreeze({
    authorized: true,
    draftId: value.revision.draftId,
    revision: value.revision.revision,
    payloadSha256: value.revision.payloadSha256,
    ownerDailyPriceMinor: value.selection.ownerSelectedDailyMinor,
    publicationAction: 'explicit_owner_action_verified',
    autoPublishAllowed: false,
  });
}
```

`backend/src/app.js:4786-4818`

```js
      await bindListingUploads(client, {
        listingId: id,
        ownerId: req.auth.userId,
        photos: payload.photos,
        requirePhoto: true,
      });
      if (config.privatePilotV4Enabled && payload.status === 'active') {
        await client.query(
          'UPDATE listings SET private_status_confirmed_at = now() WHERE id = $1',
          [id],
        );
        await writePrivatePilotDeclaration(client, {
          userId: req.auth.userId,
          listingId: id,
          declarationType: 'listing_private',
        });
      }
      await markBlueOceanDraftPublished(client, {
        ownerId: req.auth.userId,
        draftId,
        draftVersionId: persisted.draftVersionId,
        listingId: id,
        payloadSha256: authorization.payloadSha256,
      });
      await writeAudit(client, {
        actor: req.actor,
        action: 'blue_ocean.listing.published_by_owner',
        resourceType: 'listing',
        resourceId: id,
        requestId: req.requestId,
        metadata: {
          draftId,
          revision: authorization.revision,
```

`backend/src/listing_photo_truth_policy.js:1-17`

```js
export const listingPhotoTruthPolicyVersion = 'listing-photo-truth-v1';

export const listingPhotoTruthPolicyText =
  'Ich veröffentliche nur aktuelle echte Artikelbilder. Zuschneiden, Belichtung und das Schwärzen privater Details sind erlaubt, wenn Artikel, Zustand und Umfang wahr bleiben. KI-generierte oder materiell veränderte Bilder dürfen nicht veröffentlicht werden.';

export const listingPhotoTruthClassifications = Object.freeze([
  'unknown',
  'authentic',
  'truth_preserving_edit',
  'generated',
  'materially_altered',
]);

const forbiddenClassifications = new Set([
  'generated',
  'materially_altered',
]);
```

`backend/src/listing_photo_truth_policy.js:66-79`

```js
  const normalized = classifications == null
    ? (expectedCount == null ? [] : Array.from({ length: expectedCount }, () => 'unknown'))
    // Client declarations are never provenance. Safe declarations remain
    // publishable, but the server records them as unknown and keeps the
    // existing moderation/content-scan path authoritative.
    : classifications.map((value, index) => {
      normalizeClassification(value, index);
      return 'unknown';
    });
  return Object.freeze({
    policyVersion: omitted ? null : listingPhotoTruthPolicyVersion,
    policyText: omitted ? null : listingPhotoTruthPolicyText,
    classifications: Object.freeze(normalized),
  });
```

`lib/services/data_service.dart:2140-2147`

```dart
            final remote = blueOceanDraftId != null && blueOceanReview != null
                ? await BackendRepository.publishBlueOceanListingForOwner(
                    owner: owner,
                    draftId: blueOceanDraftId,
                    review: blueOceanReview,
                    listing: item.toJson(),
                    supplyEnrichmentLink: supplyEnrichmentLink,
                  )
```

`lib/config/private_pilot_config.dart:27-31`

```dart
  /// The publish action carries this server-validated image-truth assertion;
  /// it deliberately adds no separate checkbox to the listing flow.
  static const String listingPhotoTruthPolicyVersion = 'listing-photo-truth-v1';
  static const String listingPhotoTruthPolicyAttestation =
      'Ich veröffentliche nur aktuelle echte Artikelbilder. Zuschneiden, Belichtung und das Schwärzen privater Details sind erlaubt, wenn Artikel, Zustand und Umfang wahr bleiben. KI-generierte oder materiell veränderte Bilder dürfen nicht veröffentlicht werden.';
```

`lib/config/private_pilot_config.dart:219-225`

```dart
    PilotOpenDecision(
      id: 'handover_photo_workflow',
      status: 'superseded_by_v51',
      title: 'Fotoablauf bei Übergabe und Rückgabe',
      interimRule:
          'Die übergebende Partei erstellt vier Pflichtfotos; die Gegenpartei bestätigt oder ergänzt mindestens ein aktuelles Gegen-/Abweichungsfoto. Danach folgt getrennt QR- oder Fallback-Code-Bestätigung.',
      updateAuthority: 'V5.1 Teil D Nr. 2 und Umsetzungsauftrag Nr. 9',
```

Source hashes at product HEAD:

| Repository path | SHA-256 |
|---|---|
| `lib/screens/create_listing_screen.dart` | `8f614158bdb145642856048c6c3a32d998d1e967a2228f58933ef06f0fbd9bfd` |
| `backend/src/listing_ai_draft_domain.js` | `91f6e5abe557a8a518ddfb6d180a313629b27ec5c57f53c79a785bd06c9f2684` |
| `backend/src/blue_ocean_listing_workflow.js` | `253a6d9c323d45256537bccaf10423eec0964929f4f7eadd8db8d7a0b28514b3` |
| `backend/src/app.js` | `3109d02ecf91aab92261eb0d3ac199e85649b1db58e49110359701dfcc664efb` |
| `backend/src/listing_photo_truth_policy.js` | `5edafaadff65b990e931b021904da1b1306210b39aadfef43f748d68b33e5ba9` |
| `lib/services/data_service.dart` | `cce04e10456801644408f2100db3b179711d531600c09bff2672b1126b732449` |
| `lib/config/private_pilot_config.dart` | `869bb82f4c4f860fa3101b0e6f891d2c9e511f30dbe85e66f2af11a3af2446ec` |

Focused corroborating tests (not independently executed for this packet):
`test/tool/blue_ocean_n6_listing_ui_wiring.test.mjs`,
`backend/test/blue_ocean_listing_workflow.test.js`,
`backend/test/blue_ocean_listing_store.test.js`,
`backend/test/blue_ocean_n7_evaluation_corpus.test.js`, and
`test/tool/run_staging_listing_ai_acceptance.test.mjs`.

Do not invent an endpoint, field, audit record, test result, platform rule,
legal rule or normative requirement. If a current legal or platform statement
is needed, freshly open only the primary authoritative source, record its
retrieval time and include its full direct source register entry. Local source
access is not a substitute for external-source freshness. If access or
freshness cannot be proven, return `NOT VERIFIED` or `STALE`, never `PASS`.

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
- Sol technical capsule: repository path; product HEAD and SHA-256 above;
  capsule excerpt; no claim that Gemini opened the local source
- external primary source, if needed: title/issuing authority; exact direct
  URL; publication/version/effective date; retrieval time; supported claim
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
