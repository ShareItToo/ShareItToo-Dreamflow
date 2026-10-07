# Narrow Busboy dependency security fix — 2026-10-03

Source: `244e4511848cba795f4827ebfdec9ca5909a32dd`, branch
`codex/master-workflow-20260808`. **Local source fix PASS; exact-244 CI FIX.**
No commit, push, CI retry, deployment, provider action or audit suppression.
The independently green PostgreSQL proof is not rerun or reclassified.

## Trigger and official provenance

Sol's exact-244 CI readback failed only dependency audit/R10; Backend had
2,249 passes and 23 skips, PostgreSQL proof was green. Fresh local pre-fix
production audit reproduced two high findings through
`firebase-admin@14.2.0 > @fastify/busboy@3.2.0`.

All decisive sources were opened/queried on 2026-10-03:

| Official source | Status/date and supported fact |
| --- | --- |
| [Maintainer advisory GHSA-xjh9-v7x6-24jw](https://github.com/fastify/busboy/security/advisories/GHSA-xjh9-v7x6-24jw) | Accessible; published 2026-08-12. High-severity multipart-boundary denial of service; affected `>=3.1.0 <3.2.1`, patched `3.2.1`. |
| [Maintainer advisory GHSA-x8mw-p69m-v3mx](https://github.com/fastify/busboy/security/advisories/GHSA-x8mw-p69m-v3mx) | Accessible; published 2026-08-12. High-severity prototype-named multipart-header denial of service; affected **`>=1.0.0 <3.2.1`**, patched `3.2.1`. Its affected range is broader than the other advisory. |
| [Maintainer v3.2.1 release](https://github.com/fastify/busboy/releases/tag/v3.2.1) | Accessible; security release dated 12 August, names both advisories. |
| [GitHub reviewed advisory](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) | Accessible; database publication/review/update 2026-10-02 explains a newly failing fresh audit despite older green evidence. |
| [npm Firebase Admin 14.2.0 metadata](https://registry.npmjs.org/firebase-admin/14.2.0), [14.5.0 metadata](https://registry.npmjs.org/firebase-admin/14.5.0) | Explicit official-registry `pnpm view` queries succeeded. Both permit Busboy `^3.0.0`; 14.5.0 also changes Google Auth Library to `^11.1.0` from 14.2.0's `^10.6.2`. Publication dates not used as proof. |
| [npm Busboy 3.2.1 metadata](https://registry.npmjs.org/@fastify%2fbusboy/3.2.1) | Explicit official-registry query succeeded; exact version and integrity below. |

Registry integrity:
`sha512-tgK4O+57iz5ycYNGXE5ZWj1ES03lD2XnnBYWSbU/3wYZRMQzCUq7Ycds/RdyBZQeL5MU4fxBt6lzbIWf/Bickw==`.
No claim that SIT's current Firebase call path was exploited or independently
proved reachable; vulnerability absence is required rather than excused by an
unverified reachability assumption.

## Smallest compatible successor

Only the existing Busboy resolution changes **3.2.0 → 3.2.1** in
`backend/pnpm-lock.yaml`: package record/integrity, snapshot and Firebase edge.
`backend/package.json` and Firebase Admin **14.2.0 remain unchanged**. No other
locked dependency changes; no override, direct dependency, exclusion or floor
suppression is introduced. The already-declared parent range permits the patch.
Upgrading the parent to 14.5.0 would introduce an unrelated Google Auth major
without tightening its Busboy range, so it is not the narrower security fix.

The selective `pnpm update @fastify/busboy@3.2.1 --depth 1 --lockfile-only`
attempt left the transitive lock unchanged. The four exact resolution lines
were therefore patched from official registry metadata, then validated by
`pnpm install --lockfile-only --ignore-scripts` and `pnpm install --frozen-lockfile`.
The latter installed the exact patched dependency and accepted its integrity.

`backend/test/dependency_security_floor.test.js` now recognizes quoted scoped
lock entries, guards both Busboy records and the installed Firebase resolution,
and rejects absent/single/mixed/vulnerable entries, including a vulnerable
snapshot with a patched package record. Existing Sharp/Multer/Nodemailer floors
remain intact. Red first: **3 pass / 1 fail**, specifically Busboy 3.2.0; green
after the lock fix: **4/4**.

## Verification and remaining gate

Node **22.23.2**, pnpm **11.16.0**. Executed once after the source fix:

- Lockfile-only validation and frozen install: PASS.
- `pnpm why @fastify/busboy`: one version, **3.2.1**, under Firebase Admin 14.2.0.
- `pnpm audit --prod --audit-level=moderate`: **no known vulnerabilities**.
- Focused dependency tests: **4/4**; complete `pnpm test`: **2,251 pass,
  23 skip, zero failures** (2,274 tests).
- `pnpm run check`: PASS. Current-consumer closure against HEAD: **39/39**
  assertions across five consumer tests; four current manifests, five code
  consumers, 104 migrations; no binding refresh or historical evidence rewrite.
- Repository secret scan: no new high-confidence findings; 44 exact historical
  baseline findings unchanged. Final diff/path/secret checks: PASS.

The lock is runtime-affecting source. Existing deployed images, Web artifacts
and historical release/CI results are not relabelled as patched. Exact-244 CI
remains FIX; only a reviewed source successor may receive a new exact-head CI
run. No retry of unchanged 244 is justified. D5 measurement source-map work is
paused until this security package closes; D1–D4 and all runtime/provider gates
remain unchanged.
