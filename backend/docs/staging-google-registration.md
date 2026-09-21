# Staging-only Google registration lane

This lane is disabled unless `SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true`.
It is accepted only when `DEPLOYMENT_ENVIRONMENT` is `staging` or `test`,
Firebase Auth is enabled, Stripe live mode is false, and the staging access
gate is valid. The allowlist is runtime-only and must contain no plaintext
email, Firebase UID, token, or secret.

## Activation checklist

1. Apply migrations through `095_staging_google_registration_replays` using
   the normal reviewed staging migration procedure.
2. Outside Git, compute one SHA-256 digest over the exact UTF-8 bytes
   `google\n<provider-subject>\n<firebase-uid>\n<lowercase-email>` and set
   `SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST` to
   `<digest>=<staging-user-id>`. The user ID must also be present in
   `SIT_STAGING_ALLOWED_USER_IDS`.
3. Set `SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true`, keep
   `FIREBASE_AUTH_ENABLED=true`, `STRIPE_LIVEMODE=false`, and verify the
   runtime configuration readback without printing environment values.
4. Restart only the reviewed staging API and verify health, version, and the
   social-auth HTTP contract. Use a fresh, verified Firebase ID token for each
   attempt; the lane rejects expired tokens and durable token replays.

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
