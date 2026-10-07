# SIT Staging acceptance checkpoint — 05.09.2026

This checkpoint is bound to frozen Pixel candidate `1.0.0+2026090503` at source
`96b97b55983111d9e0ae8d8fcc91e9e241a2cb6f` and the current diagnostic
implementation head `a690d70607c0fff9beacecd055f984dc0a806642`.
Historical evidence is not promoted to the current candidate. `PASS` is exact,
`PARTIAL` means narrower or older proof exists, and `OPEN` means the required
end-to-end result is not proved.

| Required outcome | State | Current evidence and exact remaining gap |
| --- | --- | --- |
| Signed candidate, provenance, Pixel install and exact CI | PASS | Candidate0503 archive, APK/signature and data-preserving Pixel install pass; exact candidate and later diagnostic commits have local full regression/R10 and GitHub lanes. |
| Existing-session E-mail login/logout and persistence | PASS | Candidate0503 two-role journey and protected-owner restoration pass. |
| Fresh E-mail registration and verification | PARTIAL | N20 proves the real UI path on historical0305; exact0503 fresh-registration repetition remains open. |
| Direct password change and A→B isolation | PASS | WP14 proves definite success, old rejection, replacement login/cold start, A→B isolation, original restoration and owner restoration on exact0503. |
| Password recovery and single-use link | PARTIAL | N21 proves historical0305; exact0503 recovery repetition remains open. |
| Google sign-in | PASS | WP12 proves first/repeat login, cold persistence, stable principal and no duplicate on exact0503. |
| Facebook and Apple sign-in | OPEN | Android controls remain disabled pending separate official provider setup and owner facts. |
| Real SMS verification | PARTIAL | WP13 retains unverified truth after one unsuccessful code attempt; a fresh owner SMS request is required. |
| Listing AI condition/catalog contract | PASS | WP06/WP07 close deterministic local contracts without invented data. |
| Real external image analysis | OPEN | Staging remains mock/budget0; `codex_local_dev` is developer-only and not a public runtime entitlement. |
| Owner publish, renter discovery and non-binding request | PASS | WP05/WP08 prove the combined exact0503 two-role Staging path with cleanup. |
| Binding quote/contract/availability workflow | OPEN | V5.2 remains draft-blocked; simulation is not a contract or reservation. |
| Text chat and role isolation | PASS | Exact0503 combined two-role journey passes. |
| Attachments, location and appointments | PARTIAL | Component and older evidence exists; complete exact0503 connected matrix remains open. |
| FCM foreground/background/terminated process | PASS | Exact0503 combined controlled FCM proof passes with private icon review. |
| Pickup, return, cancellation, damages, reviews and invoices | OPEN | Complete intended two-role lifecycle remains blocked by binding/legal/payment prerequisites. |
| Stripe sandbox payment/refund/simulated payout | OPEN | WP09/WP10 technical path exists; WP11 confirms platform profile/terms, capabilities, connected account and webhook are not ready. |
| Cart, projects, booking groups, sets and planner | PARTIAL | Principal/epoch corrections and non-reserving local paths are green; complete exact0503 connected functional matrix remains open. |
| Support, report, block and privacy export | PARTIAL | Exact Staging support/safety evidence exists, but full staff follow-up, deletion and all physical transition cells remain open. |
| Light/Dark/background variants | PASS | Exact0503 candidate-generic physical matrix passes after the background-family correction. |
| Offline/online, restart, permissions and accessibility | PARTIAL | Exact and historical bounded cells pass; complete per-surface permission/TalkBack/large-text matrix remains open. |
| Complete Pixel acceptance | PARTIAL | Many high-value exact0503 rows pass, but the OPEN/PARTIAL rows above prevent overall closure. |
| Same-candidate OnePlus handoff | OPEN | OnePlus remains untouched until Pixel closure, then requires exact package/signature and a separate account/device matrix. |

## Priority after WP14

The V2.4 Growth-Core portfolio is fully `DONE` in its original non-live scope.
The next autonomous package should therefore close the highest-value exact0503
authentication gap that does not depend on a fresh owner SMS: fresh E-mail
registration/verification and password recovery on the current candidate.
SMS remains isolated at its owner interaction. Binding lifecycle, real Stripe,
external Listing AI, Facebook/Apple, production, public Store and live money
remain separate gates.
