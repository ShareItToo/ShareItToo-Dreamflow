# SIT Identity-Test: Pilot-End-Runbook

This is an operator-only closeout, not a Store or production activation.

1. Keep the identity provider in test mode and disable new session creation.
2. In the authenticated staging database, call
   `queueAllIdentityVerificationRedactions(client)` with a bounded limit and
   repeat until it reports no remaining provider-backed sessions.
3. Keep the redaction worker running. It may stop only after a readback proves
   every session is `redacted`, every outbox row is `redacted`, and no raw
   provider session ID remains in sessions, outbox, or webhook events.
4. Record the readback evidence without provider IDs, hashes, documents, or
   secrets. A failed provider redaction remains `retry` and is not reported as
   deleted.
5. Only after the redaction readback may the 30-day bounded retention worker
   remove eligible technical rows and attributable identity audit entries.

The queue helper is deliberately not called at server startup. It is an
explicit pilot-end action, while `startIdentityVerificationRedactionWorker`
continues draining pending work until confirmation.
