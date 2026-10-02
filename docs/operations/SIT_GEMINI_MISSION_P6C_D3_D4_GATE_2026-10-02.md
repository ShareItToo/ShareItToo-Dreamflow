# SIT Gemini Mission P6-C D3/D4 gate — FIX

Date: 2026-10-02  
Gate: narrow P6-C owner eligibility, location, retention and deterministic
selection review  
Source head presented: `14e7678ff2ee32aac5ebaa8ef06f44a6cbbbb973`  
Observed Gemini surface: Google account `walid.walid.chraibi@gmail.com`, model
mode `Pro` with `Extended`, conversation
`https://gemini.google.com/app/347b4120d7678bc8`  
Decision: **FIX — no real-data activation; professional review remains required
for the unresolved legal wording and classification.**

## Scope sent

The gate asked Gemini to review only:

- legal-basis separation for owner profile, matching, in-app request, email and
  push;
- the smallest owner participation UI;
- coarse stored P5 region versus a fresh location selection at demand creation;
- purpose-bound retention without invented durations;
- deterministic, auditable selection, rate limits and fail-closed aborts.

It explicitly prohibited an app rewrite, live activation, unsupported facts,
uncited claims, invented retention periods and unverified freshness. It required
a complete current-source register and `NOT VERIFIED` or
`PROFESSIONAL_REVIEW_REQUIRED` where proof was insufficient.

## Why the answer did not pass

Gemini returned `PASS WITH CONDITIONS`, but the answer cannot authorize D3/D4:

1. It proposed 30-day, 90-day and three-year retention periods without a legal
   or product-purpose proof, and mislabeled one duration as a verified fact.
2. It proposed a "deterministic jitter (random factor)", which is internally
   contradictory and not reproducibly auditable.
3. It categorically excluded the in-app channel from electronic mail/direct
   marketing without proving that conclusion for SIT's exact technical flow.
   C-102/20 concerns inbox advertising and C-654/23 concerns a newsletter; they
   do not establish that broad product claim.
4. It made fresh location selection mandatory and added an H3 resolution/error
   claim without a decisive source or a demonstrated necessity. That would add
   avoidable user friction.
5. Its flattened candidate fields and proposed uniqueness shape did not match
   the normalized, revisioned source contracts already present at the supplied
   head.
6. The selection abort list was incomplete, so the D4 algorithm was not an
   implementable fail-closed contract.
7. It did not report that EDPB Guidelines 1/2024 remain Version 1.0, adopted for
   public consultation, with the feedback consultation closed; its register
   omitted the status page.

## Accepted routing after FIX

Only the source-only P6-C1 participation foundation may proceed:

- explicit owner participation `active`/`withdrawn`;
- owner-bound private Shelf item confirmation for the currently proven
  `plant_container_equipment` need key;
- immutable revisions, exact command/revision binding, idempotency, account
  export, deletion cascade and count-only retention inventory;
- existing synthetic injected resolver remains the only P6 create path.

The following remain fail-closed: real owner resolver, location/radius matching,
exact-coordinate persistence, retention TTL, final Art. 13 wording, outbound
email/push, legal marketing classification, public listing/search, reservation,
booking, contract, payment, provider and live activation.

## Current official source register

Checked 2026-10-02. Primary and regulator sources only:

- [GDPR, official EUR-Lex text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/) — Articles 5 and 6; storage limitation is purpose-bound and does not supply the proposed fixed periods.
- [Directive 2002/58/EC, consolidated official text](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:02002L0058-20091219) — Article 2(h) definition of electronic mail.
- [UWG section 7, official German text](https://www.gesetze-im-internet.de/uwg_2004/__7.html) — unreasonable harassment and electronic-mail advertising.
- [CJEU C-102/20 official press release](https://curia.europa.eu/jcms/upload/docs/application/pdf/2021-11/cp210210de.pdf) — inbox advertising classification in the reviewed case.
- [CJEU C-654/23 official EUR-Lex summary](https://eur-lex.europa.eu/legal-content/EN/SUM/?uri=celex:62023CJ0654) — 2025 judgment concerning direct-marketing email/newsletter facts.
- [EDPB Guidelines 1/2024 consultation status](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en) — closed for feedback; Version 1.0.
- [EDPB Guidelines 1/2024 PDF](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf) — adopted version for public consultation, not treated here as final guidance.
- [EDPB Guidelines 2/2019 final page](https://www.edpb.europa.eu/documents/guideline/guidelines-22019-on-the-processing-of-personal-data-under-article-61b-gdpr-in_en) — contractual necessity for online services.
- [EDPB March 2026 official summary of Guidelines 2/2019](https://www.edpb.europa.eu/system/files/2026-03/edpb-summary-guidelines2-2019-contractual-necessity-online-services_en.pdf) — Article 6(1)(b) is limited to processing objectively necessary for the service requested.
- [German data-protection authorities' direct-marketing guidance](https://www.datenschutzkonferenz-online.de/media/oh/OH-Werbung_Februar%202022_final.pdf) — regulator orientation; not a substitute for product-specific professional review.

This record is gate evidence only. It is not independent legal advice, runtime
proof, deployment proof or release approval.
