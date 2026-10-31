# RW19 profile and location mutation principal/epoch transaction

## Decision

Every repository-owned profile, address, social, biography, interest, photo and
location mutation is one exact-subject transaction. A screen loads a token-free
profile context, captures that exact principal plus a monotonically increasing
screen-action epoch before the first `await`, and revalidates both before the
remote call, after every permission or media await, before presenting any
result and before changing navigation.

The profile coordinator is the only user-facing entry point. Screens no longer
call `DataService.updateCurrentUserProfile` or `DataService.setCurrentUser`
directly. The data layer passes the captured auth owner to
`BackendRepository.updateCurrentProfileForOwner`; the repository resolves a
credential only through `AuthService.accessTokenForOwner`. It never falls back
to the globally current session after an await.

## Result semantics

Profile mutation outcomes remain mutually exclusive:

1. `rejected`: only an exact checked-in HTTP status plus structured error code
   proves refusal. The allowlist is `400/minimum_age_required`,
   `400/invalid_phone`, `401/authentication_required`,
   `401/invalid_or_expired_session`, `401/account_not_active`, and
   `404/user_not_found`.
2. `remoteAccepted`: the existing backend returned its expected user response.
   A later owner transition, response-decoding problem, local paired-write
   failure or local verification failure cannot become "not changed".
3. `outcomeUnknown`: timeout, transport, intermediary, malformed and every
   non-allowlisted response cannot prove commit or rejection. This includes
   `408` and unstructured or non-allowlisted `4xx` responses.
4. `localUnavailable`: no remote write was attempted, or a local step failed;
   the attached `remoteAccepted` bit retains whether the server already
   accepted the update.
5. `principalChanged`: the exact loaded account or action epoch is stale. No
   stale result is shown under the successor account.

The UI handles `ProfileMutationFailure` before its generic catch. It therefore
cannot merge rejected, accepted-but-local-incomplete, unknown and
principal-changed outcomes back into one false success or false failure.

## Principal and local-commit invariant

1. `ProfileMutationContext` contains the loaded user and exact token-free
   `SessionTransitionOwner`.
2. `ProfileMutationActionOwner` adds the screen-local action epoch.
3. The coordinator rechecks the context on both sides of the data-layer call.
4. The data layer verifies the same owner before payload construction, before
   the backend request, after remote acceptance and around the paired local
   profile commit.
5. The backend repository acquires or refreshes a credential only while that
   same owner remains current.
6. The owner is never reconstructed from whatever account happens to be
   current after an await, and no token is stored in an interaction owner.

## Interaction and route invariant

Each mounted screen owns one `ProfileMutationInteractionController`. Account
change invalidates its context and epoch. The controller tracks the exact
dialog, modal sheet or pushed route created by the stale action and removes
only that route object. It never globally pops the current navigator route, so
closing an A-owned map/photo/dialog surface cannot close an unrelated surface
opened later by B.

`ChangeAddressScreen`, `ContactDataScreen`, `EditProfileScreen`,
`EditSocialMediaScreen`, `ExploreScreen`, `OwnProfileScreen` and
`ProfileInfoScreen` subscribe to the account-security transition signal,
invalidate stale actions and reload the exact successor context. Profile-info
photo selection revalidates after picker and byte-read awaits. Explore
revalidates after permission inspection, permission prompt and GPS lookup.

## Backend contract binding

RW19 binds to the existing `PATCH /v1/profile` and `GET /v1/auth/me`
contracts. It does not add or change a backend route, schema, provider or
runtime configuration. The previous trusted authentication/registration
hydration entry point remains separate from user-facing profile editing and is
not broadened by RW19.

## Boundaries

RW19 changes client transaction coordination, exact-owner backend access,
deterministic tests, inventories and evidence only. It performs no Production,
VPS, DNS, cloud/Firebase configuration, Store/Play, payment, real-provider,
pilot, legal, PR-merge, GitGuardian or Git-history action.
