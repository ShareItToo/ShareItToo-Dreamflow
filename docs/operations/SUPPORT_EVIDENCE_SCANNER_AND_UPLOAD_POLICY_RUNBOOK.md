# Support evidence scanner and upload-policy runbook

Status: technically prepared, external decisions required. Support evidence
intake remains disabled and cannot be enabled in production.

## Current preflight

Run from the repository root:

```sh
node tool/validate_support_evidence_external_readiness.mjs
```

Expected result: `prepared-hold`, eight required decisions, zero completed,
intake disabled, scanner transport `none` and external readiness false.

The final check is intentionally red:

```sh
node tool/validate_support_evidence_external_readiness.mjs --require-ready
```

## Decisions to complete with Walid

1. Choose one reviewed deployment mode: a contracted managed scanner or a
   security-reviewed self-hosted scanner. A deterministic test signature is
   never a production scanner.
2. Complete the scanner threat-model, availability, fail-closed, quarantine,
   update and incident-response review.
3. Complete the processor, DPA, processing-region and transfer assessment; for
   a self-hosted choice, record the reviewed non-processor basis instead of
   inventing a DPA.
4. Approve the maximum file size from operational, security, accessibility
   and cost evidence. The current 8 MiB technical value is an unapproved
   default.
5. Approve the detected MIME allowlist. The current JPEG/PNG/WebP-only set is
   technical scope, not business or legal approval.
6. Bind originals, previews, quarantine objects, scan events and grants to the
   approved Retention and Legal Hold policy.
7. Approve operator procedures for quarantine review, false positives,
   scanner failure, user notification, escalation and deletion holds.
8. Bind the approved configuration and clean-scanner evidence to the exact
   signed candidate and deployment environment before enabling intake.

## Safe configuration order

Record only sanitized evidence references in Git. Keep provider credentials in
the approved secret store. Configure and test the scanner in an isolated,
non-production environment with synthetic files first. Prove clean,
quarantine, timeout, unavailable, malformed-response and replay behavior. Run
the complete Privacy, Retention, backend, PostgreSQL and release gates. Only a
separate activation decision may then enable intake in an approved external
environment.

Do not upload private user evidence during setup. Do not send evidence to
external generative AI. Do not copy account identifiers, provider endpoints,
credentials, secrets, scanner findings or private filesystem paths into Git or
chat. Do not start a paid service or accept a contract without Walid's
specific cost approval.
