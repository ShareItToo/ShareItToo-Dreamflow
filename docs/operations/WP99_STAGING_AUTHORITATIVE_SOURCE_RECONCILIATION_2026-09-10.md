# WP99 — Staging Authoritative-Source Reconciliation

## Result

WP99 closes the previously unreachable read-only Staging source proof. The
configured connection is available again and the dedicated inspection was
limited to Docker labels, filesystem metadata, volume metadata and the
already allowlisted runtime inventory. It never read configuration or
credential contents, dumped a container configuration, or changed remote
state.

The active Staging API and PostgreSQL containers are healthy. Runtime image,
release record and runtime identity match one another; a rollback image is
available and existing disk health remains below its existing threshold.
Staging remains Firebase/SMTP/FCM scoped, with memory-only payment, Stripe live
mode false and mock-only listing AI.

The active API Compose binding contains exactly five persistent, regular files
within one persistent working directory. Its `.env.staging` metadata is
owner-restricted; the release script is regular and executable; the retained
runtime override is owner-restricted; and the API/database containers belong to
the same Staging project with their named volumes bound to that project.

The database container correctly retains its base Compose metadata rather than
the API's five overlay list. The new inspection treats that difference as a
separate, required project/volume binding instead of incorrectly demanding
identical per-container Compose lists.

## Current candidate relationship

The current Pixel candidate is `1.0.0+2026091001`, source
`068c843a2660e2a4c44a1715f4f8e51a67b41d24`. The running Staging source is
`926a00c5fa7f6595069aed12119d2dde90935bc3`. Their Backend runtime trees are
identical; the later candidate's startup-session correction is mobile-only.
Therefore this exact candidate can use the observed Staging API without
claiming that the mobile correction itself was deployed to the server.

Public Staging health, version and listings endpoints each returned success.
The public catalog is structurally valid and currently server-confirmed empty.
On the installed Pixel candidate, the authenticated session restored online
and through a controlled offline/online recovery; each of Entdecken, Mietkorb,
Buchungen, Nachrichten and Mein SIT passed separately through the real UI.
The individual runner is intentionally used because the all-in-one run exceeds
the host's single command window. It retains full per-surface wait and
fail-closed behavior, and a one-surface result cannot claim the whole matrix.

## Boundaries and remaining scope

WP99 performed no deployment, remote source change, container/data change,
account action, listing/booking/payment action, Store action, OnePlus contact
or Production action. The direct Pixel APK is not Play-delivered evidence.

The next functional package may now use the current Pixel candidate against
the verified Staging runtime. Its first work is still read-only legal,
account/support, large-text and theme evidence. A fresh, explicitly
email-verified two-role synthetic source remains required before listing,
request, booking, chat and notification mutation can be tested again; no
unknown existing session will be repurposed as that source.
