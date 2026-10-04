# WP82 — Staging persistent-source proof contract

Status: **LOCAL CONTRACT COMPLETE; REMOTE READ-ONLY OBSERVATION BLOCKED BEFORE
AUTHENTICATION.**

## Purpose

WP77 correctly refused to change public legal runtime values because the active
container could not be bound to one persistent authoritative source and safe
recreate path. WP82 turns that finding into a precise, machine-checked contract
for the next observation. It does not create a substitute source, retry the
failed Control-Panel recreate path or permit a deployment.

## Required proof

A later dedicated read-only observation must prove all of the following without
printing configuration or credential contents:

- the exact running Staging Compose project, its persistent working directory
  and its contained regular Compose configuration file;
- regular, non-symlinked Compose and owner-restricted environment metadata,
  plus the immutable-image/no-build/verified-rollback release script;
- matching named Staging PostgreSQL/upload volumes, exact runtime/image/release
  identity, retained rollback image, and a nonsecret legal-runtime comparison;
- no full environment/configuration dump, credential read, source/container
  mutation, local-image fallback or retry of the failed recreate route.

The existing checked-in release harness and runtime inventory are hash-bound by
the contract, so a later source change cannot silently alter the proof standard.

## Current observation result

The configured Staging SSH alias was tried once in non-interactive read-only
mode. Its hostname failed to resolve before authentication, so no key was used,
no remote command ran and no evidence was captured. This is a connectivity
precondition only; it is not represented as a server, runtime or deployment
failure.

No remote source, container, database, provider, payment, Store, device or
Production state changed. The next permitted action is a dedicated read-only
observation after the existing alias has an authoritative reachable hostname.

## Local verification

- focused WP82 contract tests: **6 passed**;
- complete Node tool inventory: **2,568 passed**;
- full technical regression, Web/Wasm loopback, Android debug build/minSdk 24,
  and the R11 Android-security surface check: **passed**.

## Exact GitHub verification

The exact implementation commit `7bfe42fbeafce1d65f8dc0373e4c7c88181df7e8`
passes GitHub Regression
[`34418503497`](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/34418503497):
Backend, PostgreSQL, clean-checkout reproducibility and Flutter all pass; the
image-publish job is skipped. CodeQL
[`34418503596`](https://github.com/ShareItToo/ShareItToo-Dreamflow/actions/runs/34418503596)
passes. PR #7 remains Draft, open and clean with zero open alerts on its merge
reference. These source-quality facts do not open the remote observation gate.

Machine-readable contract:
`docs/evidence/release-readiness/wp82-staging-persistent-source-proof-contract-20260910.json`.
