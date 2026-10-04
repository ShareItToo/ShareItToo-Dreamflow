# WP159 Processor / Controller / Region / Transfer Truth

Status: technical provider facts reconciled; account-specific contracts,
regions, transfer mechanisms and legal roles remain open.

The SIT first-party backend is the technical controller-service boundary. The
current candidate routes backend/database hosting through Hostinger, SMTP
through Google Workspace, authentication and device services through Firebase,
and Maps requests through an authenticated SIT server proxy. Stripe is
disabled and had no provider traffic in this package.

Public primary sources establish only bounded provider facts. Hostinger's DPA
describes Hostinger as a processor and its location guide lists selectable VPS
regions, but the active SIT VPS region and accepted account DPA are not
proven. Firebase documents Authentication as US-only; FCM and Crashlytics are
global services unless a service-specific location selection applies. Google
Workspace documents SMTP relay and data-region terms, but the SIT edition,
Admin relay policy, accepted DPA and configured region are not proven. Maps
terms incorporate Controller-Controller Data Protection Terms and describe
receipt of search terms, IP addresses and coordinates when used; the SIT
billing/EEA terms, enabled APIs, logging and credential restrictions are not
proven.

These are technical recipient facts, not a legal determination of SIT's
controller roles or an approval to activate a provider. No contract, DPA,
region, transfer mechanism, account setting, credential, provider console or
production state was read or changed. The exact owner gate is
`OWNER_GATE_REQUIRED:PROCESSOR_CONTRACT_REGION_TRANSFER_READBACK`.

The machine-readable evidence and validator intentionally preserve this
distinction. They accept public-source facts, require every account-specific
fact to remain unknown until a protected readback exists, and reject any
claim of contract acceptance, region, transfer approval or activation.
