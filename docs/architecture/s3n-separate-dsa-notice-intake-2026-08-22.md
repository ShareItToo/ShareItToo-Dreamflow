# S3N separate DSA notice intake - architecture

Status: locally verified for non-live operation on 22.08.2026. Production,
external delivery and public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`, scenario `SUP-027`.
- Drive `07_TRUST_SAFETY_MODERATION_PRIVACY_LEGAL`, ID
  `1fxfhV8aBH2MKrqfnudY6_mKeC5P1HPDXac41c0KZpu4`, checked on
  22.08.2026.
- Drive `08_MAXIMUS_AUTOMATION_APPROVAL_CODEX_SPEC`, ID
  `1v5SOAWn0B6UO5jAFv2eo3P_l0jVdqE1PpMz99mPRjzQ`, checked on
  22.08.2026.

## Intake and evidence model

The Flutter flow branches from the existing safety-first, single-issue intake
into a dedicated illegal-content route. Submission is blocked until content
type, locator, a sufficiently detailed illegality statement and explicit
good-faith confirmation are present. Jurisdiction or legal basis is optional
because the source does not make it universally mandatory.

The backend validates the exact `sit_dsa_notice_intake_v1` shape and derives
reporter name and email from the authenticated database row. It creates one
opaque Notice ID and stores the complete evidence snapshot with source channel
and server submission time. Migration `042` binds evidence to the exact
`moderation_content/illegal_content_notice` route, requires the number/evidence
pair, constrains every field and forbids later mutation. Rollback refuses to
erase the schema after any notice evidence exists.

The API response, case list and detail expose the Notice ID but never the full
evidence object. Events and support audit metadata retain only Notice ID,
version and content type. Account export returns full evidence only when the
requesting user is the original reporter, preventing disclosure to an affected
user who may also be linked to a case.

## Decision boundary and exclusions

Routing to `moderation_owner` is deterministic, but the case subtype is an
explicit red decision boundary. Intake does not establish illegality, remove
or restrict content, notify an affected party, issue a Statement of Reasons,
decide an appeal or call any external adapter.

The package adds no public/guest channel, production service, provider,
Cloud/VPS/DNS, payment, Store, real-money or signed-release mutation.
