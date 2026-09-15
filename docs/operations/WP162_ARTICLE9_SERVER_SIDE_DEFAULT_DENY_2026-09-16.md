# WP162 Article 9 server-side default-deny boundary

WP162 is a technical safety package only. No Article 9 legal basis, role,
purpose or provider approval is selected. The only authoritative decision for
the current staging runtime is therefore **default deny** whenever new input
may contain special-category/health data.

The support-case normalizer no longer treats a client warning, checkbox,
owner-role label or `specialCategoryHandling` body object as authorization. A
future server-owned gate may pass a strict, case-bound authorization object,
but no current HTTP route issues one. Sensitive case intake consequently fails
with `support_article9_server_authorization_required` before persistence or
workflow forwarding. Neutral product-safety reports with an explicit
`injuryOccurred: false` remain recordable; explicit negative wording such as
“ohne Verletzung” is not classified as an injury.

Evidence uploads are also fail-closed: a possible-special-category
classification, or a new upload on the product-safety route without a trusted
server authorization, is rejected before `persistFiles`, database inserts,
audit rows or workflow delivery. Existing rows remain readable/exportable and
are not deleted or rewritten.

Focused backend tests cover client spoof rejection, sensitive text rejection,
neutral accident reporting, explicit-negation handling and the no-persistence
upload boundary. Privacy export/read paths remain unchanged and continue to
project only their existing bounded metadata. No production, provider,
payment, Store, cloud/VPS, DNS or device state changed.
