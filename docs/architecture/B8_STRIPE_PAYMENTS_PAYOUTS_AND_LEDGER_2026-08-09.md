# B8 – Stripe-Zahlungen, Auszahlungen und Ledger

Stand: 9. August 2026  
Technischer Status: Staging bestanden  
Produktionsstatus: unverändert; Stripe-Livebetrieb nicht freigegeben

## Ergebnis

B8 ersetzt lokale oder vom Client behauptete Zahlungszustände durch einen
serverautoritativen Zahlungsablauf. Buchungsbestätigung, Erstattung,
Auszahlung und Chargeback-Folgen werden ausschließlich aus
verifizierten Serverereignissen und in Datenbanktransaktionen abgeleitet.

Die technische Staging-Abnahme ist vollständig bestanden. Der reale Stripe-
Test- und Livebetrieb bleibt absichtlich gesperrt, bis das Plattformkonto,
die Vertragspartei und die Geschäftsregeln freigegeben und die Stripe-Secrets
außerhalb des Repositorys eingerichtet wurden.

## Architekturentscheidung

- Stripe-hosted Checkout verarbeitet die Mietzahlung. Die App erfasst und
  speichert keine vollständige Kartennummer, keinen CVC und keine IBAN.
- Checkout überlässt die Auswahl der im jeweiligen Konto, Land, Gerät und
  Betrag zulässigen Zahlungsmethoden Stripe. Karten und verfügbare Wallets
  können dadurch ohne clientseitige Zahlungsdatenfelder erscheinen; weitere
  Methoden wie Klarna oder PayPal gelten erst nach ihrer nachgewiesenen
  Aktivierung und einem echten Test im Plattformkonto als verfügbar.
- Stripe Connect mit gehostetem Express-Onboarding bildet das
  Auszahlungskonto des Vermieters ab.
- Separate Charges and Transfers halten die Vermieterauszahlung bis zum
  abgeschlossenen Mietvorgang und dem konfigurierten Sicherheitszeitraum
  zurück.
- Die Plattformgebühr und der Vermieteranteil werden aus dem unveränderlichen
  serverseitigen Buchungsangebot berechnet.
- Die Vorwärtsmigration `011_launch_without_deposit_or_protection.up.sql`
  neutralisiert die frühere Kautionsspur auf `0`/`NULL`, setzt das frühere
  Schutzmodell auf `none` und sperrt neue Mandate, Belastungen, Kommandos und
  Ledger-Buchungen durch Datenbank-Trigger. Die alten Tabellen bleiben
  ausschließlich aus Schema- und Audit-Kompatibilitätsgründen erhalten.
- Webhook-Ereignisse werden vor Verarbeitung signaturgeprüft, dauerhaft
  gespeichert, anhand ihres Payload-Hashes geschützt und idempotent
  verarbeitet.
- Das doppelte Ledger ist append-only. Jede Transaktion muss ausgeglichene
  Soll- und Habenbuchungen erzeugen; nachträgliches Ändern oder Löschen wird
  durch Datenbanktrigger abgelehnt.

Die Umsetzung folgt den offiziellen Stripe-Verträgen für
[Checkout](https://docs.stripe.com/payments/checkout),
[Express Accounts](https://docs.stripe.com/connect/express-accounts),
[Separate Charges and Transfers](https://docs.stripe.com/connect/separate-charges-and-transfers),
[gespeicherte Zahlungsmethoden](https://docs.stripe.com/payments/save-and-reuse),
[Webhook-Signaturen](https://docs.stripe.com/webhooks/signature) und
[Disputes](https://docs.stripe.com/disputes).

## Serververtrag

Die neuen Hauptendpunkte sind:

- `POST /v1/payments/connect/onboarding`
- `GET /v1/payments/connect/status`
- `POST /v1/bookings/:id/payment/checkout`
- `GET /v1/bookings/:id/payment`
- `POST /v1/payments/:id/refunds`
- `POST /v1/payments/:id/payout-release`
- `POST /v1/payments/webhook`
- `GET /v1/open/payment/:bookingId`

Der Simulationsendpunkt für Zahlungen existiert nur beim Memory-Transport in
Test und Staging. Kautionsendpunkte sind im Launch nicht registriert.

## Zustände und Schutzregeln

### Zahlung

Der Client darf nur Checkout starten und den Zustand lesen. Eine Buchung wird
erst nach einem erfolgreich verarbeiteten Provider-Ereignis bestätigt.
`requires_action`, Ablehnung, Abbruch, Wiederholung und Ereignisse außerhalb
der Reihenfolge sind eigene Zustände. Betrag, Währung, Zahlungs-ID und
Live/Test-Modus müssen mit dem gespeicherten Vertrag übereinstimmen.

Bei verzögerten Zahlungsmethoden ist der Abschluss der Checkout-Oberfläche
noch kein Geldeingang. `checkout.session.completed` und
`checkout.session.async_payment_succeeded` bestätigen deshalb nicht direkt
die SIT-Buchung. Erst das signierte `payment_intent.succeeded` mit der
kanonischen Payment-Intent-, Betrags-, Währungs- und Charge-Referenz löst die
Ledger-Buchung und Buchungsbestätigung aus. Ein
`checkout.session.async_payment_failed` darf den Zahlungsversuch dagegen
explizit als fehlgeschlagen markieren. Allgemeine Providerobjekte mit einem
Feld `status=succeeded` werden niemals als Zahlungsnachweis akzeptiert.

### Auszahlung

Eine Auszahlung ist nur möglich, wenn:

- die Buchung abgeschlossen ist;
- die Haltefrist abgelaufen ist;
- das Connect-Konto auszahlungs- und transferfähig ist;
- kein offener Streitfall und kein verlorener Provider-Chargeback besteht;
- noch ein nicht ausgezahlter Vermieteranteil vorhanden ist.

Teil- und Vollerstattungen nach Auszahlung kehren den zugehörigen
Vermieteranteil exakt und kumulativ um. Eine zweite Auszahlung desselben
Anteils wird unterdrückt.

### Keine Kaution und kein Schutzprodukt

Neue und aktualisierte Inserate werden auf `deposit=null` und
`protectionModel=none` normalisiert. Jedes Buchungsangebot und jede Zahlung
trägt `securityDepositMinor=0`. Alte Mandate werden widerrufen und können über
keinen öffentlichen API-Endpunkt aktiviert oder belastet werden.

### Chargebacks

Provider-Ereignisse für Eröffnung, Mittelentzug und Wiedereinsetzung werden
idempotent gespeichert. Mittelentzug und Wiedereinsetzung erzeugen getrennte
Ledger-Transaktionen. Ein verlorener Chargeback blockiert die Auszahlung; nur
der Providerstatus `won` hebt diese Sperre auf.

## Persistenz

Migration `007_b8_payments_and_ledger.up.sql` ergänzt unter anderem:

- Connect-Konten und Stripe-Kunden;
- Payment Commands, Versuche und Provider-Ereignisse;
- historische Mandats- und Belastungstabellen zur Audit-Kompatibilität;
- vollständige Payment-, Refund-, Payout- und Dispute-Providerreferenzen;
- Ledger-Transaktionen und Ledger-Einträge;
- partielle Unique-Indizes gegen parallele Checkout-, Refund-, Payout- und
  konkurrierende Zahlungsaktionen;
- Append-only- und Balance-Trigger.

Repository- und Staging-Prüfsumme der Migration:
`ec1afc0291417a0de6698969f5d9e72b2280e7e05e1c3b3678e7469d9662a82a`.

## App

Die Flutter-App besitzt nun:

- einen servergebundenen Zahlungsbildschirm pro Buchung;
- Stripe-Checkout-Öffnung und sichere Statusaktualisierung;
- einen Stripe-Auszahlungskonto-Bildschirm mit gehostetem Onboarding;
- einen echten Zahlungs-Deep-Link statt lokaler Erfolgssimulation;
- rein erklärende Zahlungsmethoden-Einstellungen ohne Karten- oder IBAN-
  Eingabefelder.

Die alten lokalen Zahlungs- und Auszahlungsspeicher sowie das lokale IBAN-
Formular wurden entfernt.

## Automatische Nachweise

Endgültiger Implementierungslauf:
[GitHub Actions `31297896941`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31297896941)
für Commit `0f058ee256ff8d7f7174e355bc3b22449965be35`.

- Backend: 46 Tests, davon 45 lokal bestanden und der echte PostgreSQL-Test
  lokal mangels PostgreSQL übersprungen; in CI ist die vollständige
  PostgreSQL-16-Integration einschließlich Migration 007 bestanden.
- Flutter: 159 Tests bestanden.
- Analyse: keine neuen Fehler; die akzeptierte Altlasten-Baseline sank von 710
  auf 699 Hinweise.
- Web-Debug-Build und Android-Debug-APK bestanden.
- Produktions- und Staging-Compose sowie commitgebundener Image-Build
  bestanden.
- Das API-Image wurde erst nach grünem Backend- und Flutter-Job
  veröffentlicht.

Unveränderliche Staging-Image-ID und Registry-Digest:
`sha256:8222190bc76015dc71db88f808bf194745344ea8b63a267b90585d09ecb29f3f`.

## Isolierte Staging-Abnahme

Vor dem Rollout wurden Datenbank, Uploads, Staging-Version sowie Staging- und
Produktionscontaineridentität unter
`/docker/sit-staging/backups/pre-b8-20260809T060117Z` gesichert. Dump und
Uploadarchiv wurden gelesen; alle SHA-256-Prüfsummen stimmen.

Release-Nachweis:
`/docker/sit-staging/backups/releases/staging-20260809T060850Z-0f058ee256ff.json`.

Die isolierte Abnahme bestätigte mit drei ausschließlich dafür erzeugten und
anschließend geschlossenen Konten:

- Connect-Onboarding und Auszahlungsbereitschaft im Memory-Transport;
- autoritatives Angebot: 4.000 Cent Miete, 400 Cent Plattformgebühr,
  4.400 Cent Zahlbetrag und keine Kaution;
- idempotente Checkout-Wiederholung;
- `requires_action`, erfolgreichen Providerabschluss und Unterdrückung eines
  doppelten Provider-Ereignisses;
- Buchungsbestätigung ausschließlich nach Providerabschluss;
- deaktivierte Kautionsendpunkte und ein serverseitiger Kautionswert von `0`;
- Chargeback-Mittelentzug und -Wiedereinsetzung;
- blockierte Auszahlung bei `lost` und erfolgreiche Auszahlung von 4.000 Cent
  bei `won`;
- zwei Erstattungen zu je 2.200 Cent und vollständige Umkehr der Auszahlung;
- neun ausgeglichene Ledger-Transaktionen und Ablehnung einer nachträglichen
  Ledgeränderung;
- sichere Zahlungs-Linkseite;
- null aktive Abnahmekonten, null aktive Abnahmeinserate, null wartende und
  null tote Benachrichtigungen nach Bereinigung.

Nachweis:
`/docker/sit-staging/backups/b8-live-acceptance-20260809T060913Z.json`.

## Rückfall, Restore und Produktionsschutz

Die B7-App `4c4088fd8d6f9da2e96dbbedb1e4e21914ad57c1` startete gesund auf dem
vorwärtskompatiblen B8-Schema. Danach wurde B8 erneut aus demselben
unveränderlichen Image gestartet. Migration 007 ist genau einmal vorhanden,
Readiness ist grün und der Payment-Healthcheck meldet Memory-Transport,
`livemode=false`, keine ausstehenden Zahlungen, keine fehlgeschlagenen
Provider-Ereignisse und kein unausgeglichenes Ledger.

Rückfallnachweis:
`/docker/sit-staging/backups/b8-rollback-acceptance-20260809T061002Z.json`.

Die Vor-B8-Sicherung wurde zusätzlich in PostgreSQL 16 mit einem separaten
temporären Container, Volume und Uploadverzeichnis wiederhergestellt. Sie
enthielt 31 öffentliche Tabellen, sechs Migrationen, sechs Uploaddateien und
erwartungsgemäß noch keine Migration 007. Alle temporären Ressourcen wurden
entfernt.

Restore-Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-b8-20260809T060558Z-413297.json`.

Gesamtnachweis:
`/docker/sit-staging/backups/b8-evidence-20260809T061040Z.json`.

Die Produktions-Containeridentität war vor und nach Backup, Rollout,
Abnahme, Rückfall und Restore exakt identisch. Produktion wurde weder
migriert noch neu gestartet. `PAYMENT_TRANSPORT` bleibt dort standardmäßig
`disabled`.

## Offene externe Gates

Vor einem echten Stripe-Test oder Livepilot müssen außerhalb des Codes
verbindlich festgelegt und eingerichtet werden:

- Vertragspartei und aktiviertes Stripe-Connect-Plattformkonto;
- Plattformgebühr, klare Regel „keine Kaution/kein Schutz“, Auszahlungsfrist,
  Storno-/Erstattungsregeln und Pilotwährung;
- serverseitiger Stripe-Testschlüssel und Webhook-Secret;
- 3DS-, Ablehnungs-, Webhook-, Refund-, Payout- und Dispute-Proben im Stripe-
  Testmodus;
- Live-Schlüssel, enge Nutzer-Allowlist und kontrollierte reale
  Kleinstbetragsbuchung mit anschließender Erstattung.

Bis diese Gates ausdrücklich erfüllt sind, ist B8 als **technisch im Staging
bestanden**, aber nicht als **realer Stripe-Livebetrieb freigegeben** zu
bezeichnen.
