# Mission D8 — Einzelbuchung und Historie bleiben autoritativ

Status: **SOURCE MAP / OPEN D8**, keine Implementierungs-, Aktivierungs- oder Releasefreigabe.
Stand: 2026-10-03. Gebundener Source-Commit: `75b7e19dba55579a2b1a8df0e6746e61b5c57874`.
Zu Beginn war lokaler HEAD `30e03ed5860b8108f04e62b00ba92163799c7fcc`, beim Abschluss `458b76bfb726f8409c7d901a42d9782bf456b109` (parallel fortgeschriebener Branch). Alle 22 unten registrierten Dateien sind bytegleich mit dem gebundenen Source-Commit. Zeilen beziehen sich ausschließlich auf diesen Source-Commit; dieser Worker hat weder committed noch gepusht.

## Auftrag und Beweisgrenze

D8 verlangt additive Adapter/Constraints, Altbestands-/Rollbacktests und keine Umschreibung historischer Einzelbuchungen. Masterplan: `docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md:53,79–80,108–112,212`.

Diese Mappe trennt bereits vorhandene Autorität von noch fehlendem Mission-Nachweis. Sie entscheidet weder D1/D2 noch eine Mission→Booking-/Command-Relation. Es wurde kein konkreter, innerhalb dieses Pakets sicher zu behebender Sourcefehler belegt; deshalb nur Dokumentation, kein spekulativer Contract-/Testfix.

Die D1/D2-Source-Map ist ein historisches Provenienz- und Navigationsartefakt, kein neuer Beschluss. Ihre älteren Targets, Gatevorschläge und Capsule-Verweise werden hier nicht als aktuelle Provider-, Runtime- oder Freigabewahrheit übernommen. Eine mutable Capsule ist keine Quelle dieser Prüfung.

## FACT / OPEN — Source-to-claim

| Bereich | FACT am Source-Target | OPEN / nicht daraus ableitbar |
| --- | --- | --- |
| Einzelbuchungsautorität | `backend/src/booking_workflow.js:811–863,953–1033` erstellt Request/Booking und ggf. Plattformvertrag; `:605–636` bindet Command-Replay an Actor, Typ und Requesthash. `backend/src/booking_domain.js:29–70` enthält rollenabhängige Übergänge; `booking_workflow.js:1087–1101,1345–1397` sperrt/bewertet den vorhandenen Datensatz. | Keine Mission kann daraus eine Sammelzusage oder atomare Mehr-Eigentümer-Buchung ableiten. Kein Nachweis einer Mission→Booking- oder Mission→Command-Zuordnung. |
| Getrennte Vertragswahrheit | `backend/sql/migrations/015_v51_contract_persistence.up.sql:28–45` bindet einen Plattformvertrag eindeutig an Booking, Nutzer, Quotehash, Dokument-Snapshots und Idempotenzschlüssel; `:94–116` installiert Append-only-Trigger. `016_v51_booking_quotes.up.sql:4–25` bindet Quotes an Mieter, Listing und Zeitraum. | Vertragsanlage während der Anfrage ist keine Vermieterannahme. Keine neue Quote-/Fee-/Contractengine. Dies ist Strukturbeleg, keine vollständige aktuelle Retention-/Erasure- oder Rechtsprüfung; spätere legitime Lifecycle-Regeln sind nicht durch ein pauschales „niemals veränderbar“ ersetzt. |
| Bestehender Consumer | `backend/src/app.js:2234–2236,6464–6467`: authentifiziertes `GET /v1/rental-requests` delegiert innerhalb einer Transaktion an `listBookings`. `booking_workflow.js:696–708` filtert vorhandene Bookingteilnehmer und `workflow_version = 1`, ohne Mission-ID/Join. Die Create-/Amend-Routen `app.js:6171–6203` besitzen ihren bestehenden Booking-Pilot-Gate. | Kein neuer Runtimeconsumer und keine Missionroute erforderlich. Ein fehlender Mission-Kontext darf hier nicht nachträglich zur Bedingung werden. Auth-/SQL-Isolation wird durch einen Fake-Client-Test allein nicht bewiesen. |
| Historieninhalt | `booking_workflow.js:170–254` priorisiert relationale Bookingfelder, gespeicherte Quote-/Zeitwerte und blendet `platformContract` für Nicht-Mieter aus. `:222–232` liefert privacy-shaped Listingfelder ohne Medien; Status/Revision stammen vom aktuellen Listing. `backend/test/booking_workflow_sql.test.js:124–133` schützt diese Quellform. | `listingSnapshot` ist **kein vollständig eingefrorener historischer Listingtext**. Titel/Status können aktuelle Listingwerte sein, während die Bookingquote autoritativ bleibt. Nicht gleichsetzen mit Vertrags-/Belegsnapshot. Die Query hat einen inneren Listingjoin; Verhalten nach allen denkbaren Erasure-/FK-Lifecycles ist hier nicht verifiziert. |
| History-Read ist nicht generell schreibfrei | `booking_workflow.js:645–708`: `listBookings` ruft zuerst `expireBookingHolds` auf. Dieser bestehende Lifecycle kann abgelaufene nicht-synthetische Holds samt Request, Event, Audit und Notificationfortschritt abschließen. `backend/test/postgres_foundation.integration.test.js:5871–5912` enthält dafür konkrete Ablauf-/Payloadassertionen. | Kein pauschaler „GET verändert nie Historie“-Test. Missionrollback darf bestehende legitime Bookingfortschritte weder verbieten noch als Missioneffekt umdeuten. Der PG-Test wurde in diesem Paket gelesen, nicht ausgeführt. |
| Legacy/Altbestand | Migration `005_b6_booking_workflow.up.sql:57–95` enthält die bereits historische B6-Konvertierung. `:189–245` quarantänisiert Legacy-Schreibpfade; `booking_workflow.js:1098–1100` verweigert normale Commands für nicht revalidierte Versionen. PG-Test `:4584–4647` prüft ein Version-0-Rollbackbooking, Nicht-Sichtbarkeit in der normalen Liste und explizite B6-Revalidierung. | „Alle Altbestände ohne Prüfung bedienbar“ wäre falsch. D8 darf Quarantäne nicht umgehen oder eine neue historische Backfillpflicht erfinden. Fehlende Mission-ID ist etwas anderes als `workflow_version=0`; reguläre Version-1-Einzelbuchungen bleiben der erste enge Testfall. |
| Additiv-only / fehlende Relation | Masterplan `:108–112`; `backend/sql/migrations/102_mission_inventory_resolutions.up.sql:33–67,87–108` hält Resolutioneffekte nicht-bindend und Zuordnungen an Resolutionrevision/Slot/Listing, nicht Booking/Command. `backend/src/mission_quorum_projection_workflow.js:48–56,127–132` ist ein testbegrenzter Repeatable-read/Read-only-Projektionspfad. | Vorhandene Assignment-IDs sind keine Bookingrelation. Weder synthetischer Projektionsstatus noch Quote-/Contractfelder erlauben indirektes Matching oder einen neuen Runtimeadapter. D1/D2-Adaptergate bleibt unabhängig offen. |
| G3 same-owner | `backend/sql/migrations/028_g3b_booking_group_foundation.up.sql:140–195` erzwingt denselben Eigentümer und konsistente Quote-/Bookingkontexte. `backend/test/booking_group_domain.test.js:41–118` schützt same-owner, additive Migration und keine Umschreibung von Bookings/Quotes/Contracts. | Multi-owner-Mission darf G3 nicht zu multi-owner erweitern, Ownerchecks entfernen oder gemeinsame Zusage/Abholung daraus konstruieren. |
| Rollback: disable, Historie erhalten | Masterplan `:112` verlangt zuerst neue Einstiegspunkte deaktivieren; laufende Komponenten und historische Belege erhalten. Die Down-Dateien 028/029/030/031 jeweils `:1–13` verweigern destruktiven Rückbau bei vorhandenem Gruppen-/Quote-/Handover-/Setbestand. Bestehende Tests unten prüfen relevante SQL-Guards. | Das sind vorhandene Guardmuster, kein ausgeführter D8-Rollback-/Restorebeweis. UI-Disable macht keine Verträge oder Providereffekte rückgängig. Keine Downmigration, kein Flagwechsel und kein Datenreset wurden ausgeführt. |

## Kleinster unabhängiger Nachfolger: D8-P1 — bestehende Historyprojektion ausführen

**Umfang:** eine neue reine Testdatei `backend/test/booking_history_authority.test.js` (Vorschlag, noch nicht angelegt). Sie importiert ausschließlich den bestehenden exportierten `listBookings`-Pfad mit einem streng erwartenden Fake-Queryclient und synthetischen relationalen Zeilen. Keine neue Produktionsabstraktion, keine neue Mission-Fixture/-Relation und keine neue SQL-Migration. Das schließt die enge Lücke zwischen dem vorhandenen Regex-Quelltest und ausgeführtem Payloadverhalten; es ersetzt keinen PG-Beweis.

Acceptance:

1. Reguläre Version-1-Bookingzeile ohne Mission-ID, abgeschlossener Status und ohne abgelaufenen Hold: Quote, Zeitraum, IDs und Workflowrevision kommen unverändert aus den bestehenden relationalen Werten, auch wenn `request.payload` widersprechende alte Werte enthält. Eingabefixture bleibt unverändert.
2. Derselbe Datensatz für Mieter und Eigentümer: Plattformvertragsfeld nur für den Mieter; kein erfundener gemeinsamer Vertrag. Queryparameter bindet exakt den betrachteten Nutzer. SQL-Guardassertion bestätigt beide Participantprädikate, Version-1-Filter und keine Missionabhängigkeit; sie wird nicht als DB-RLS-Beweis ausgegeben.
3. Ein nicht mehr öffentlich aktives Listing bleibt im bereitgestellten participant row darstellbar: reduzierte aktuelle Listingfelder, keine Photos, keine Umdeutung der gespeicherten Bookingquote. „Aktuell“ vs. „historisch gespeichert“ im Testnamen sichtbar.
4. Der Fake erwartet zunächst die bestehende Hold-Sweep-Query mit leerem Ergebnis, dann die Bookingquery; danach keine zusätzlichen Queries. Damit wird nur der **Fall ohne fälligen Hold** als mutationsfrei geprüft. Die bestehende echte Hold-Expiry-/Quarantänesemantik bleibt unberührt.
5. Keine künstliche Mission-ID in Schema, SQL, Bookingpayload oder Commandhash; keine Erwartung, dass quarantänisierte Version-0-Zeilen ungeprüft sichtbar werden. Kein same-owner-Relaxing.

Exclusions: kein Source-/Exportrefactor zum Testzweck, kein neuer Consumer/Route/Flag, kein D1/D2-Vertrag, keine Aktivierung/Einladung, kein Provider-/Payment-/Deploymentzugriff, keine behauptete Migration-/Rollback-/E2E-Abnahme. Falls der Test eine echte Divergenz offenlegt: kleinsten Fehlerbeleg zurückgeben; Fix nicht mit neuer Mission-Semantik vermischen.

Verify für diesen Nachfolger, aus `backend/`:

```sh
node --import ./test_setup.js --test test/booking_history_authority.test.js test/booking_workflow_sql.test.js test/booking_domain.test.js test/booking_group_domain.test.js
```

Zusätzlich Consumer-/Diff-/Secretcheck. Erst ein späteres, getrennt beauftragtes PG-Paket darf echte Participantfilterung, Legacy-Revalidierung und bytegleichen Bestand bei einem tatsächlich spezifizierten additiven Mission-Disablepfad beweisen. Dafür ist heute weder eine neue Relation noch ein Deaktivierungsadapter vorhanden; keine hypothetische Lösung in D8-P1 einbauen.

## Durchgeführte fokussierte Verifikation

Aus `backend/`:

```sh
node --import ./test_setup.js --test test/booking_domain.test.js test/booking_workflow_sql.test.js test/booking_group_domain.test.js test/booking_group_quote_workflow.test.js test/booking_group_handover_workflow.test.js
```

Ergebnis: **29/29 PASS, 0 skipped**. Das umfasst vorhandene Rollen-/Quote-, Booking-SQL-/Privacy- und G3-Additiv-/Rollbackguards. Kein neuer D8-Test, keine Vollregression, kein PG-/Provider-/Runtime-/Releasebeweis. Der umfangreiche Foundation-PG-Test ist ausschließlich gelesene Evidenz. `test/tool/mission_web_history_probe.test.mjs` bezeichnet Browsernavigation, nicht fachliche Bookinghistorie, und wird nicht als D8-Beweis verwendet.

Consumercheck: `booking_workflow.js`, `booking_domain.js` und `booking_group_workflow.js` enthalten keine Missionreferenz; der vorhandene Rental-Requests-Consumer wurde direkt gelesen. Hashregister bytegenau gegen `git show <source-target>:<path>` und aktuelle relevante Dateien geprüft. Diff-/Whitespace-/Secretcheck nur für diese neue Mappe; fremde Änderungen bleiben unangetastet.

## Exaktes Quellregister

SHA256 jeweils über die vollständigen Git-Blob-Bytes am Source-Commit oben; keine Mutable-/Livequelle. Zeilenausschnitte in der Matrix dienen nur der Navigation. Die 22 Dateien sind keine Uploadfreigabe und keine Aufforderung zum Lesen breiter persönlicher Daten.

| Repo-Pfad | Vollfile SHA256 |
| --- | --- |
| `docs/product/SIT_MISSION_MASTERPLAN_2026-09-30.md` | `22375f1c7847a76e55fcb362e476067086fb3a5c5d6c378592bc20635847001d` |
| `docs/operations/SIT_MISSION_D1_D2_PG_ADAPTER_SOURCE_MAP_2026-10-03.md` | `e300e4c6a5ec5a699050f642d07b5382f5a9ec66f6c2272905de1127534db597` |
| `backend/src/app.js` | `ac867635b2d02c992347416a0ba3f1f2b681b5902963728c99f89457703863e2` |
| `backend/src/booking_workflow.js` | `1787b0613e37efad99174142f4b34367659966b6b6f64cb3611383abd3ee82f2` |
| `backend/src/booking_domain.js` | `614b13e753f32423f9f32a7355bebf3fb0157e06ca094d58b23cf13235b96919` |
| `backend/src/booking_group_workflow.js` | `c5f7c5dcdc3ae35e87a6724791a2e6cf996f7f2590b016f8a8b3937b2eaed83e` |
| `backend/src/mission_quorum_projection_workflow.js` | `abe3ecfc292cfb85cffc469972f0fddb66852e17230c016ef37b7bc19e4fc5c1` |
| `backend/sql/migrations/005_b6_booking_workflow.up.sql` | `55996e71b9a9144852dd872dd5ccbdf6578518c6ce1e370458ee12976cff0053` |
| `backend/sql/migrations/015_v51_contract_persistence.up.sql` | `c2ccc1d20248672cfe164f4cf5bf093dca855aa4794f71a6f9dfe3a8c8253657` |
| `backend/sql/migrations/016_v51_booking_quotes.up.sql` | `70ab8fbfa5ab8d134775532a8122f429e1c77391bbba926ae13fb233ba8a6d89` |
| `backend/sql/migrations/028_g3b_booking_group_foundation.up.sql` | `b9469e3a4a3f46cad6f793ec7bc88964cac9e941b7656ee5743e27383c5db7e7` |
| `backend/sql/migrations/028_g3b_booking_group_foundation.down.sql` | `ff0f765c19bec48388a998a6d6620dd040efef89ce1934a6148864f3aae89c3f` |
| `backend/sql/migrations/029_g3c_booking_group_quote_state.down.sql` | `2c28e5c5bad7f0e7debbb1ff2717cf6cceb799958244d82099543968e5530992` |
| `backend/sql/migrations/030_g3d_shared_handover_item_evidence.down.sql` | `8ca37eaf68b36b761948ce4bb890896b1d87e1102e9292d4113e02057cafc426` |
| `backend/sql/migrations/031_g5b_listing_sets.down.sql` | `8cba4838c9ef37db16a17ffcc2eff3cc638db9149b8705ca1159fbde1e392123` |
| `backend/sql/migrations/102_mission_inventory_resolutions.up.sql` | `b71a009ad50729d6f423759fb74bee1cafbc8a900e0555f62b4e89f31281c22a` |
| `backend/test/booking_domain.test.js` | `e8b84a1e1f8f1b05d966ccecbba482d07e9c9813534aadcdfe40c12e4ba363e3` |
| `backend/test/booking_workflow_sql.test.js` | `1f3251197152b6e9426076ed819cce7816688340d405d4b05e7c9ac8ecdef065` |
| `backend/test/booking_group_domain.test.js` | `c17c2b9181308f0c9e325e4a27c99aec8e581070fe6a23211e257ebb73c5ec04` |
| `backend/test/booking_group_quote_workflow.test.js` | `1246aca7f839581656e1b0d724c9c455e67e9cb9ebf5c470a62641b4c992e61f` |
| `backend/test/booking_group_handover_workflow.test.js` | `0952875ef54dfb0e3b8979137d4b1cefbdaa2e2f13e6b6f6c013403ccfd83aaa` |
| `backend/test/postgres_foundation.integration.test.js` | `fc8e3e47b5c0655d2e5ceef7ef884c640d3d4f5472814b74d3609365a46ec2b4` |

## Übergabe

RESULT: Mappe PASS; D8 insgesamt OPEN. CHANGED: ausschließlich diese neue Mappe. BLOCKER: kein Blocker für D8-P1; echte Mission→Booking-Autorität und Disable-/Restoreintegration bleiben separat unentschieden/unbewiesen. NEXT: D8-P1 nach obigen Acceptancepunkten, zunächst test-only; keinen Contract aus dem fehlenden Relationsbeleg konstruieren.
