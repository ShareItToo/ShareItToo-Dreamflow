# WP76 — Operator, Legal and Role Readiness

## Result

WP76 is complete as a **draft-only repository-readiness package**. It neither
approves public or commercial operation nor substitutes professional legal
review.

The current draft-only operator source is
`assets/legal/de/operator_readiness_draft_20260909.json` (SHA-256
`35fd214b0cf355a2f1ee6084a89294f63495d0def49dffa8036105adb778bfcf`). Its
confirmed operator facts are:

- business designation: `ShareItToo – Inhaber Walid Chraibi`;
- legal form: sole proprietor (`Einzelunternehmer`);
- owner: Walid Chraibi;
- service address: Bernhaldenweg 47, 71579 Spiegelberg, Deutschland;
- contact: `contact@shareittoo.com`.

No tax number, VAT ID, economic ID, register entry, commercial-register claim,
managing-director claim or invented identifier is recorded. Business
registration is required at the actual start at the latest; it is not yet
recorded. The tax number is applied for but not issued or recorded.

## Historical sources and current precedence

The V5 and V5.2 legal manifests remain byte-identical, historical,
hash-bound baseline evidence. The current draft amendment supersedes only
contradictory historical operator-form, managing-director, register and former
address placeholders; it does not silently rewrite historical evidence.

| Historical source | Preserved SHA-256 |
| --- | --- |
| V5 legal manifest | `6cffec53a27f84b24a44aebad50afd6e7ce17a4c196c7946155fba743fdc161f` |
| V5.2 legal manifest | `757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b` |

The legal screens consume the new draft configuration only in the unapproved
internal state. They do not make a public-provider identity approved.

## Role model

Walid is the confirmed sole-founder primary accountable owner. All six
functional role mappings use the same opaque primary-principal reference; no
person name, email address or credential is stored in the role manifest.

- confirmed primary role mappings: 6;
- independent delegate assignments: 0;
- technical rehearsal evidence: 4;
- human absence rehearsal evidence: 0;
- operations readiness: false.

The two required, still-open targets are distinct future delegates: a
technical/admin backup and an operations/trust-and-safety backup. Each requires
its own enterprise account, MFA, least privilege and a tested handover. The
sole founder may not self-delegate. No delegate, RBAC assignment, MFA state or
absence coverage is represented as complete before an actual second person is
onboarded.

## Holds and remaining professional work

All externally effective boundaries remain false: public/commercial operation,
real invitations, real money, binding contract acceptance, public registration,
Store activation, provider activation and production release.

Professional legal review remains open for the legal texts, retention and
deletion, DPA/international transfers, consumer and marketplace classification,
and DSA applicability. This source cites the official DDG imprint rule,
business-registration guidance and DSA text; their presence is a source record,
not legal advice or clearance.

## Verification

The repository validators bind the current operator draft to the legal
readiness record, all three legal screens, the preserved V5/V5.2 baseline
hashes and the P0B operations role manifest. Focused legal, privacy, retention,
P0B and external-gate validators passed. The full local technical regression
also passed, including static analysis, Flutter tests, Web/Wasm loopback smoke
and Android debug build.

## Status

**NO-GO for public or commercial operation.** The next live-facing decision is
separate from this package and requires the applicable legal, operator and
release gates.
