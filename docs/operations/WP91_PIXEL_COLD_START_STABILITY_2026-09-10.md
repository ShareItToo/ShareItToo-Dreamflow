# WP91 — Pixel cold-start stability

Status: **COMPLETE FOR THREE BOUNDED, READ-ONLY COLD-START OBSERVATIONS.**

WP91 isolates the WP90 restart observation from general app launch behavior.
Using the exact explicit archive for the installed `1.0.0+2026090905` Pixel
candidate, three controlled cold starts each reached the authenticated main
navigation. The runner stops at the first missing navigation, but none occurred.
No screenshot or account content was retained.

This rules out neither the WP90 in-cycle condition nor a permission-controller
interaction. It accepts only these three ordinary, non-mutating cold starts;
it does not accept the permission lifecycle, any account/business flow, or a
candidate-wide release outcome.

No permission, account, listing, booking, message, provider, Store, Production
or OnePlus state changed. The next safe action is a non-mutating probe of the
Android permission-controller/app-foreground state around one controlled
restart, before another lifecycle attempt.

Machine-readable evidence:
`docs/evidence/release-readiness/wp91-pixel-cold-start-stability-20260910.json`.
