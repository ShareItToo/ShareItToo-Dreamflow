# RW8 local review/reputation authorization, durability and recovery

Date: 2026-08-25
State: implementation candidate `9d4780f0d7ebd88bc2521ae38d77203e181ecda6`;
full local regression and exact-head GitHub verification passed

## Decision

RW8 hardens the existing device-local review fallback without changing public
reputation readability, the four approved rating criteria, backend authority or
moderation policy. Local submission requires the exact current authenticated
account and an exact completed booking in which that account is the reviewer.
Direction, counterparty, item and `needsReview == false` are derived from the
stored booking rather than trusted from caller identifiers.

The booking mutation queue is acquired before the review queue. The operation
rechecks the exact session, validates the complete booking document, validates
the complete review document and verifies that the booking bytes did not change
before persistence. This fixed lock order prevents a review from racing a
booking transition and avoids cyclic queue acquisition.

## Store contract

The legacy `reviews` and canonical `multi_reviews_v1` documents are decoded as
strict bounded units. Each accepts at most 1,000 unique records and 8 MiB of
encoded data. Required ids, timestamps, finite rating values, exact direction,
four canonical unique criteria, integer stars and bounded notes are validated.
Duplicate review ids or duplicate booking/reviewer contexts close the entire
multi-review document.

Corruption is never converted to an empty reputation history and is never
partially rewritten. Missing classic reviews mean no reviews; public reads no
longer create demo reputation. Demo reviews remain available only through the
explicit QA/sample bootstrap.

Local review writes share one serialized queue, validate the complete next
document, verify read-back and restore the exact prior bytes if a rejected
platform write changed them. Capacity exhaustion rejects without pruning old
reviews. One rejected operation does not poison later valid work.

## Privacy, deletion and UI truth

The local privacy export includes only reviews authored by or received by the
current authenticated account. Other public review cache entries remain
excluded. Reviews are shared public counterparty records and remain retained
when the account profile is anonymized; RW8 does not invent a deletion period or
change the backend deletion contract.

Submission failure keeps the sheet, criteria and notes open and exposes a retry
instead of reporting false completion. Public and own-profile review reads turn
corruption into a visible retry state rather than an indefinite spinner or an
empty-history claim. The own-profile tab binds its async result to the exact
current account. Shared local review changes trigger the bounded own-profile
refresh path.

## Deterministic proof and exclusions

The synthetic matrix covers guest, outsider and stale sessions; exact booking
status, direction, counterparty, item and `needsReview`; missing classic data;
corrupt documents and exact raw preservation; same-context and distinct
parallel writes; injected storage failure and queue recovery; full capacity;
privacy scope and shared-record retention; process-style recreation; and UI
input-preserving retry. It contains no sleeps, timing allowances or reduced
parallelism requirements.

The complete supported regression passed on the exact clean candidate with
standard Flutter parallelism: analyzer zero issues, 496 default-profile tests
passed with three documented profile skips, all dedicated profile and RW0-RW8
checks passed, and the Web debug build, loopback smoke, Android debug build and
binary `minSdk 24` check passed. The run used no timing workaround or reduced
test parallelism.

The initial full run correctly exposed predecessor source-inventory drift after
the shared compliance document changed; RW3, RW4 and RW6 hashes were refreshed
without changing their scope or decisions. A subsequent run exposed one legacy
public-profile fixture that still depended on implicit review demo seeding. The
fixture now supplies its review explicitly, while RW8 independently proves that
missing review storage remains empty. RW0's bound hash for that test was then
mechanically refreshed. All affected validators and the final full regression
passed.

Exact-head GitHub Regression `32830068534` passed on rerun attempt 2 after its
first attempt was canceled only by the branch concurrency policy when the local
evidence commit entered the queue. CodeQL `32830068632` passed on the same
candidate and the repository reported zero open code-scanning alerts. The
canceled first attempt is not used as success evidence.

RW8 changes no contract, quote, acceptance, payment, refund, payout, handover,
return, damage, moderation decision, production schema, provider, AI, candidate,
device, Play, Firebase, Store, VPS, DNS, Cloud, pilot, real-money, legal-owner,
PR-merge, GitGuardian-content or Git-history gate.
