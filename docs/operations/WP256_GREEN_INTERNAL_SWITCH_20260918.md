# WP256 — Green internal staging switch (technical only)

Am 18.09.2026 wurde der bereits akzeptierte Green-Stand einmalig als
kanonischer interner Staging-Service aktiviert. Die Quelle bleibt
`62a777ccaa9d360db8f3ebede41be27decc352f2`; der Container läuft mit dem
WP254-Image `338c7bc066f10b72b05f89a5485cb5f5204a8e25` und Image-Digest
`sha256:43c3e62e47fd6b22ea5015a5a90003f48b6704066b490502466919a0e46e8c43`.

## Switch und Readback

- Der vorherige kanonische Container wurde nicht gelöscht, sondern als
  `shareittoo-staging-api-alt-sealed-wp256` angehalten. Sein Image und das
  Volume `shareittoo_staging_uploads` blieben unverändert.
- `shareittoo-staging-api` nutzt ausschließlich das Green-Netz
  `sit-green-network-20260918011528-wp254` (`internal=true`), die Green-DB
  und `sit-green-uploads-20260918011528-wp254`. Es gibt keine Host-Portbindung.
- Nach einem kontrollierten Container-Neustart lieferten `/health/live` und
  `/health/ready` beide HTTP 200. `/version` bestätigte `wp254-green`, Commit
  `338c7bc066f10b72b05f89a5485cb5f5204a8e25`, Buildzeit
  `2026-09-18T01:15:00.000Z`, Umgebung `test`.
- Green-Datenbank: 2 synthetische Nutzer, 1 Listing `Sonstiges`, 1 Upload,
  0 Payments/Refunds/Payouts und 0 rechtliche Snapshots. Listing-Original und
  Thumbnail waren nach dem Neustart im Green-Upload-Volume vorhanden.
- Migrationen: Green 87, Alt 74. Die DSN-Prüfung gab nur den Green-Host,
  Green-Datenbank und Green-Benutzer aus; kein Passwort wurde ausgegeben.

## Sicherheits- und Scope-Grenzen

Payment bleibt `memory`, Stripe-Livemode ist `false`, Identity ist deaktiviert,
Listing-AI ist Mock mit Budget 0 und Provider-Egress ist blockiert. Der direkte
öffentliche API-Pfad lieferte 502; der Web-Container konnte den kanonischen API-
Namen aus seinem Netz nicht auflösen. Das beweist die interne Begrenzung des
API-Dienstes, nicht die Abschaltung der vorgeschalteten Gateway-Webseite.

V5.2 bleibt im Repository `draft-blocked` (Manifest-SHA-256
`757289c45dfe50c9f3f3ec9c96953f06b62f15b282bb1d6cdedc6e8e07d2e69b`) und die
Green-DB enthält keine rechtlichen Snapshots. Daher ist keine rechtliche,
Payment-, Pilot-, Produktions- oder Release-Abnahme erfolgt.

Die vollständige Evidence steht in
`docs/evidence/release-readiness/wp256-green-internal-switch-20260918.json`.
Keine Play-, Store-, Provider-, Payment-, DNS-, Public- oder Produktions-
Änderung wurde vorgenommen. Nächster Schritt ist ausschließlich Sols Review.
