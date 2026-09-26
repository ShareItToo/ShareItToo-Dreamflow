# Staging-only Google registration lane

This lane is disabled by default. The Green promotion preserves the existing
pre-state with `DEPLOYMENT_ENVIRONMENT=test`, Firebase Auth and phone
verification false, Google registration disabled, an empty/absent allowlist,
the access gate enabled, payment memory, and Stripe live mode false. A later
activation is separately reviewed; the allowlist is runtime-only and must
contain no plaintext email, Firebase UID, token, or secret.

## Activation checklist

1. Run the Green promotion from the manifest-bound source readback schema
   `92` through current schema `97`. Require the source ledger digest before
   rehearsal, the full isolated 97 ledger digest before candidate provisioning,
   and the exact `097_registration_consent_bundle.up.sql` readback for
   isolated and canonical targets. The runner rejects any other readback and
   leaves Google registration disabled.
2. Run the existing separate Firebase-auth activation runner for its reviewed
   `test` to `staging` transition and its `FIREBASE_AUTH_ENABLED=false` to
   `true` transition. This promotion package does not change that runner.
3. In the later Google-registration activation step, outside Git, compute one SHA-256 digest over the exact UTF-8 bytes
   `google\n<provider-subject>\n<firebase-uid>\n<lowercase-email>` and set
   `SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST` to
   `<digest>=<staging-user-id>`. The user ID must also be present in
   `SIT_STAGING_ALLOWED_USER_IDS`.
4. Set `SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true`, keep
   `FIREBASE_AUTH_ENABLED=true`, `STRIPE_LIVEMODE=false`, and verify the
   runtime configuration readback without printing environment values.
5. Restart only the reviewed staging API and verify health, version, and the
   social-auth HTTP contract. Use a fresh, verified Firebase ID token for each
   attempt; the lane rejects expired tokens and durable token replays.

The separate Google-registration enablement runner for step 3 is not present
in this package and remains an operational blocker; do not infer or synthesize
its command or account mapping.

An allowlisted identity is linked to an existing account with the exact
allowlisted user ID, or created with that ID after normal consent checks. A
different owner, provider, email verification state, or identity digest fails
closed. Audit metadata contains only provider and operation state.

## Rollback

Set `SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false` and remove the runtime
allowlist, then perform the normal reviewed staging restart. Do not delete the
replay table as part of an operational rollback. If the migration itself must
be reverted, use the paired reviewed `095_...down.sql` only after confirming no
lane requests are in flight and the feature is disabled. No production or
livemode activation is supported by this module.
