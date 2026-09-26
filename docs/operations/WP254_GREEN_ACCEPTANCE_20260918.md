# WP254-A Green acceptance — 2026-09-18

Die isolierte Green-Umgebung läuft auf dem Start-HEAD
`338c7bc066f10b72b05f89a5485cb5f5204a8e25` mit eigenem internem Docker-Netz,
ohne Host-Port und getrennten Daten-/Upload-Volumes. `/version`, `/health/live`
und `/health/ready` liefern 200. Payment bleibt memory-only, Identity ist
deaktiviert, Listing-AI ist zero-budget mock und Provider-Egress ist blockiert.

Der Altbestand wurde nur gelesen und separat gesichert:
`/docker/shareittoo/backups/rehearsals/staging-wp254-fresh-20260918011257.dump`
(3,855,507 Bytes, SHA-256
`b724f8de6be1a88434c613c44fd8335b77d9bfa12c7d374c9928a4ceb6eaef8a`).
Originaldump und WP253-Evidence blieben hashgleich. Der reale Altbestand mit
Finanz-, Support-, Audit- und Medienbeziehungen wurde nicht nach Green kopiert.

Green enthält ausschließlich die Dataset-ID `wp254-green-dataset-001` mit zwei
synthetischen Konten, einem `Sonstiges`-Inserat und einem Bild. MFA
enroll/pending/cancel, Upload und Persistenz über API-/DB-Neustart,
Owner-/Renter-Lesen, Mieter-Mutationsschutz und Memory-Connect-Onboarding
bestanden. Green-Backup und isolierter Restore ergeben identische Werte
(2 Nutzer, 1 Listing, 1 Upload, 87 Migrationen). Temporäre Restore-Ressourcen
sind entfernt.

Die vollständige rechtlich gebundene Buchungs-/Checkout-Abnahme bleibt offen:
V5.2 ist im Repository `draft-blocked`, und es wurden keine Snapshots erfunden.
Damit ist B8/B10 als Gesamtjourney ehrlich blockiert, nicht technisch
grüngewaschen. Runner-Test 6/6 und `git diff --check` sind grün; die
unveränderte Vollregression wurde nicht dupliziert. Details stehen im JSON-
Evidence. Nächster Gate-Punkt ist Sols Review plus ein echtes V5.2-Legal-Gate;
keine Umschaltung und kein Provider-/Store-/Play-Schritt.
