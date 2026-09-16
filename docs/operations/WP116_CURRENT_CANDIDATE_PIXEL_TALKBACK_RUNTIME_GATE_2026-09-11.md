# WP116 — Current-candidate Pixel TalkBack runtime gate

## Result

The exact signed Internal/Staging candidate `com.shareittoo.app`
`1.0.0+2026091110`, source
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b`, completed a fresh physical
TalkBack activation probe on the Pixel 7 Pro. Android exposed the user-visible
Accessibility Settings route, the TalkBack row, the service toggle and the
system confirmation. The diagnostic accepted that system confirmation and
observed the TalkBack process active and its accessibility service bound.

Android nevertheless reported neither runtime touch exploration nor its secure
touch-exploration state or service grant. The diagnostic therefore stopped
before focus, double-tap or ShareItToo destination traversal. This is an exact
current-candidate fail-closed result, not an automated or manual TalkBack pass.

## Restoration

The probe began only after verifying the known disabled Accessibility baseline.
Its mandatory cleanup restored all five relevant settings exactly: global
accessibility disabled, no enabled service, touch exploration disabled, no
touch-exploration grant and no accessibility-key target. ShareItToo then
returned to the authenticated `Entdecken` destination. No timeout increase,
direct secure-setting grant, retrying app mutation or invented manual result
was introduced.

## Verification and boundaries

Execution head `05b9dc0ac053179257a132c3c0c12ee6bda29b0c` has no mobile-runtime
drift from the artifact source. It passes the complete local regression,
GitHub Regression `34642104364` including independent clean checkout, CodeQL
`34642104387` and a zero-open-alert readback. PR #7 remains draft, open,
mergeable and unmerged.

No account, booking, message, payment, provider, Store, Production, OnePlus or
PR state changed. No screenshot or raw hierarchy was retained. Automated and manual TalkBack navigation remain explicitly open until Android exposes the
required touch-exploration runtime or a human completes the bounded review.

Machine-readable evidence is retained at
`docs/evidence/release-readiness/wp116-current-candidate-pixel-talkback-runtime-gate-20260911.json`.
