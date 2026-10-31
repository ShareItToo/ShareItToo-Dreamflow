# B7 — Kommunikation, Push und Deep Links

Stand: 9. August 2026

Branch: `codex/master-workflow-20260808`

Status: technisch für Staging freigegeben. Autoritativer Buchungs-Chat,
private Fotoanhänge, Lesezustand, Archivierung, Melden/Blockieren,
transaktionale In-App-/E-Mail-/Push-Benachrichtigungen, Outbox mit Retry sowie
sichere App- und Web-Linkziele sind implementiert und abgenommen. Produktion
wurde nicht verändert. Reale APNs-/FCM-Zugangsdaten, die finale iOS-Domain-
Verknüpfung und physische Gerätetests bleiben ein ausdrückliches B11-Gate.

## Ergebnisziel

B7 sorgt dafür, dass ein wichtiges Buchungs- oder Nachrichtenereignis genau
den richtigen Nutzer erreicht und ihn in den richtigen App-Kontext führt.
Eine fehlgeschlagene Benachrichtigung darf niemals die Buchungstransaktion
zurückrollen. Kontakte außerhalb einer Buchung sowie durch eine Partei
blockierte Kontakte dürfen keinen Chat erzwingen.

## Autoritativer Buchungs-Chat

Der Server ist ab B7 die einzige Autorität für Buchungs-Chats. Ein Thread ist
eindeutig an genau eine B6-Buchung gebunden und wird nur für deren Vermieter
und Mieter geöffnet. Fremde Nutzer erhalten unabhängig von erratenen Thread-
oder Datei-IDs keinen Zugriff.

Der Vertrag umfasst:

- serverseitige Thread-Erstellung aus einer gültigen Buchung;
- paginierte Thread- und Nachrichtenlisten;
- idempotente Nachrichten mit einer eindeutigen Client-Kennung;
- private, serverseitig bereinigte Fotoanhänge mit maximal fünf Anhängen pro
  Nachricht;
- benutzerspezifische Lesebestätigungen;
- benutzerspezifische Archivierung ohne Datenverlust;
- Sperre des Chats in ungeeigneten Buchungszuständen;
- Sperre bei aktiver Nutzer- oder Messaging-Suspension.

Die bisherige Bulk-Synchronisierung darf im Pilotbetrieb weder neue B7-
Threads noch neue B7-Nachrichten erzeugen. Dadurch kann ein alter Client den
autoritativen Pfad nicht umgehen. Vorhandene ältere Threads bleiben beim
Rückfall lesbar; der Vorwärtslauf kann sie kontrolliert an die B7-Buchung
binden.

## Anhänge und Privatsphäre

Chat-Fotos verwenden den vorhandenen gehärteten Bildpfad: Typprüfung anhand
der tatsächlichen Datei, Dekodierung, Metadatenentfernung, Größenbegrenzung,
Neukodierung und Inhalts-Hash. Nachrichtendateien sind privat und nur mit
einer aktiven Sitzung eines Buchungsteilnehmers abrufbar. Der Client zeigt sie
als geschützte Fotoanhänge und fällt im produktiven Backendmodus nicht auf
lokale Fake-Nachrichten zurück.

Ein Konto-Löschvorgang entfernt die zugehörigen Uploads, neutralisiert
gesendete Nachrichtentexte und erhält nur die für Audit und rechtliche
Nachweise notwendige pseudonyme Struktur.

## Melden und Blockieren

Ein Buchungsteilnehmer kann eine konkrete Nachricht mit Grund und optionaler
Beschreibung melden. Die Meldung geht in den bestehenden moderierbaren
Report-Pfad und erzeugt eine Auditspur.

Blockieren ist serverseitig und bidirektional wirksam: Sobald eine der beiden
Parteien die andere blockiert, kann keine Seite eine weitere Nachricht
zustellen. Entblocken ist explizit, nachvollziehbar und stellt nicht
automatisch alte Nachrichten oder Benachrichtigungen neu zu.

## Benachrichtigungs-Outbox

Buchungsstatus und Benachrichtigungsabsicht werden in derselben PostgreSQL-
Transaktion gespeichert. Der eigentliche Versand erfolgt danach aus einer
Outbox. Ein Lieferfehler kann deshalb eine bereits bestätigte Buchung nicht
rückgängig machen.

Jede Zeile besitzt einen stabilen Ereignisschlüssel, Nutzer und Kanal. Die
Kombination ist eindeutig; ein wiederholter Befehl erzeugt keine zweite
Zustellung. Der Worker verwendet konkurenzsichere Zeilensperren, erkennt
verwaiste Worker-Sperren, erhöht den Versuchszähler und plant exponentielle
Wiederholungen. Jeder Versuch wird unveränderlich protokolliert. Nach der
konfigurierten Maximalzahl wechselt ein Ereignis auf `dead` und macht den
Bereitschaftsstatus sichtbar degradiert.

Persönliche Einstellungen steuern getrennt:

- In-App-Benachrichtigungen;
- E-Mail;
- Push insgesamt;
- Nachrichten-Push;
- Buchungs-Push;
- Sprache/Locale.

Deaktivierte Kanäle werden nachvollziehbar als `suppressed` abgeschlossen,
nicht als Fehler wiederholt.

## Ereignisse und Kanäle

Die B6-Zustände `requested`, `accepted`, `payment_pending`, `confirmed`,
`active`, `returned`, `completed`, `declined`, `cancelled`, `refunded` und
`disputed` erzeugen rollenbezogene Benachrichtigungen. In-App, E-Mail und Push
verwenden dieselbe Ereignisidentität und dasselbe sichere Ziel. Neue
Nachrichten erzeugen In-App plus Push für den jeweils anderen Teilnehmer.

E-Mails verwenden die vorhandenen escaped Text-/HTML-Templates und enthalten
keine geheimen Sitzungstoken. Staging nutzt bewusst den `memory`-Transport.
Push unterstützt `disabled`, `memory` und einen HTTPS-Webhook-Transport. Der
Webhook erhält nur die erforderlichen Gerätedaten, akzeptiert ungültige Token-
Hashes als Rückmeldung und deaktiviert solche Geräte ohne Tokenwerte zu
protokollieren.

## Deep Links und sichere Web-Rückfälle

Die App akzeptiert nur ShareItToo-HTTPS-Hosts oder das eigene
`shareittoo://`-Schema. Nutzerinformationen in URLs, fremde Hosts,
unbekannte Ziele und unsichere IDs werden abgewiesen.

Unterstützt sind sichere Ziele für:

- Buchung;
- Buchungs-Chat;
- E-Mail-Verifizierung;
- Passwort-Zurücksetzung;
- Zahlungsrückkehr.

Geschützte Buchungs- und Chat-Ziele verlangen eine gültige Sitzung und
bleiben durch die Serverrollenprüfung abgesichert. Ohne installierte App zeigt
der Server eine sichere ShareItToo-Webseite zum Öffnen der App. Ungültige und
abgelaufene Links liefern eine neutrale Fehlerseite ohne Token- oder
Kontodetails.

Android besitzt HTTPS-App-Link-Filter für ShareItToo und das eigene Schema.
iOS kennt das eigene URL-Schema und Flutter-Deep-Linking. Die finale
`Associated Domains`-Berechtigung und die Domaindateien werden erst nach
Festlegung von Apple-Team, Bundle-ID und Store-Ziel in B11 aktiviert.

## App-Anbindung

- Der App-Start verarbeitet initiale und nachträglich eingehende Links.
- Buchungs- und Chat-Links navigieren nach erfolgreicher Anmeldung in den
  autoritativen Datensatz.
- Verifizierungs-, Reset- und Zahlungslinks verwenden den sicheren Webpfad.
- Chat-Erstellung, Senden, Lesen und Archivieren verwenden die B7-Endpunkte.
- Blockierlisten und Benachrichtigungsfeed kommen im Backendmodus vom Server;
  lokale Speicherung bleibt ausschließlich für QA erhalten.
- Ein Foto wird vor dem Senden privat hochgeladen und dann per Upload-ID an
  die idempotente Nachricht gebunden.

## Automatische Nachweise

Endgültiger Implementierungslauf:
[GitHub Actions `31294252348`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/31294252348)
für Commit `4c4088fd8d6f9da2e96dbbedb1e4e21914ad57c1`.

- Backend: 39 von 39 Tests bestanden, einschließlich PostgreSQL 16,
  Migration 006, Rollen, Idempotenz, Blockieren/Melden, Outbox und Link-
  Rückfall.
- Syntax- und Produktions-/Staging-Compose-Prüfungen bestanden.
- Flutter: 159 Tests bestanden.
- Analyse: keine Fehler; akzeptierte Altlasten-Baseline unverändert bei 710
  Hinweisen.
- Web-Debug-Build und Android-Debug-APK bestanden.
- Das commitgebundene API-Image wurde erst nach beiden grünen Jobs
  veröffentlicht.

Unveränderliche Image-ID:
`sha256:41e9bbfb6033a128ce8cf6bf8a7f846961cc05d8f706c7d1165130d4fc01c060`.

Migration-006-Prüfsumme in Repository und Staging:
`f1452d85f736cc013c33747ec6de71a9d139a1b6f993eb39f591171cc2a1dd83`.

## Isolierte Staging-Abnahme

Vor dem Rollout wurden Datenbank, Uploads, Staging-Identität und Produktions-
Containeridentität unter
`/docker/sit-staging/backups/pre-b7-20260809T042734Z` gesichert. Dump,
Uploadarchiv und gemeinsames SHA-256-Manifest wurden vor dem Rollout gelesen
und geprüft.

Release-Nachweis:
`/docker/sit-staging/backups/releases/staging-20260809T042915Z-4c4088fd8d6f.json`.

Die reale Abnahme mit drei verifizierten Testkonten, echtem Inserat und echtem
privatem Bild bestätigte:

- je eine erfolgreiche In-App-, E-Mail- und Push-Zustellung für Anfrage und
  Annahme;
- genau eine gespeicherte Nachricht und genau eine Nutzerbenachrichtigung bei
  Wiederholung desselben Idempotenzschlüssels;
- je eine In-App- und Push-Zustellung für die erste Nachricht;
- `in_app:sent` und `push:suppressed` nach Nachrichten-Push-Abwahl;
- Teilnehmerzugriff auf den privaten Fotoanhang und Ablehnung des Fremdnutzers;
- erfolgreiche Melde-, Blockier- und Entblockierwege;
- Ablehnung eines Sendeversuchs während der Blockierung;
- sichere Buchungs-/Chat-Rückfälle sowie Fehlerseiten für ungültige und
  abgelaufene Links;
- kontrollierter Versandfehler mit `retry` im ersten und `sent` im zweiten
  Versuch;
- leere Queue ohne `dead`-Ereignis am Ende.

Nachweis:
`/docker/sit-staging/backups/b7-live-acceptance-20260809T043556Z.json`.

Nach der Abnahme wurde die Buchung regulär aktiviert, zurückgegeben und
abgeschlossen, das Inserat beendet und alle drei Testkonten über den
regulären Kontolöschpfad geschlossen. Der aktive Staging-Katalog, aktive B7-
Testkonten, wartende Outbox-Einträge und tote Zustellungen stehen jeweils auf
null.

## Rückfall und Restore

Die letzte geprüfte B6-App
`ef73fd413945d57ca6ba06c17ea91368db6315ae` wurde auf dem bereits migrierten
B7-Schema gestartet. Version und Bereitschaft blieben gesund. Anschließend
wurde B7 erneut aus demselben unveränderlichen Image gestartet; Migration 006
war genau einmal vorhanden und die Benachrichtigungsqueue blieb leer.

Nachweis:
`/docker/sit-staging/backups/b7-rollback-acceptance-20260809T043739Z.json`.

Die Vor-B7-Sicherung wurde zusätzlich in einer getrennten PostgreSQL-Instanz
mit eigenem temporärem Volume und einem getrennten Uploadverzeichnis
wiederhergestellt. Sie enthielt 25 Tabellen, alle fünf Vor-B7-Migrationen und
das Uploadarchiv. Migration 006 war erwartungsgemäß noch nicht enthalten.
Container, Volume und temporäre Dateien wurden danach entfernt.

Restore-Nachweis:
`/docker/sit-staging/backups/restore-checks/restore-check-b7-20260809T043845Z-7844.json`.

Zusammengefasster B7-Nachweis:
`/docker/sit-staging/backups/b7-evidence-20260809T043955Z.json`.

## Produktionsschutz und externe Plattform-Gates

Die Produktions-Containeridentität blieb vor, während und nach Rollout,
Rückfall, Restore und Bereinigung bytegenau identisch. Produktion wurde weder
migriert noch neu gestartet. Der produktive Push-Transport bleibt
standardmäßig `disabled`.

Für echte Hintergrundzustellung und vollständige Universal Links werden in
B11 benötigt:

- finale iOS-Bundle-ID, Apple-Team und Associated-Domains-Datei;
- finale Android-Paket-ID und Digital-Asset-Links;
- APNs-/FCM-Projekt und deren geheime Zugangsdaten;
- physische iOS-/Android-Proben mit installierter und nicht installierter App,
  Vordergrund, Hintergrund, beendetem Prozess, Offline-Wiederkehr und
  abgelaufenem Link.

Diese Anbieter-Gates ändern nicht den bereits bestandenen B7-Serververtrag.
Sie bleiben jedoch zwingend, bevor Push und Universal Links produktiv
freigegeben werden.

## Freigaben

| Gate | Erforderlicher Nachweis | Status |
|---|---|---|
| Teilnehmerbindung | nur Vermieter und Mieter sehen/senden | bestanden |
| Idempotenz | eine Nachricht und eine Benachrichtigung pro Ereignis | bestanden |
| Anhänge | privat, bereinigt, Fremdzugriff abgelehnt | bestanden |
| Missbrauchsschutz | Melden, Blockieren, Suspension | bestanden |
| Outbox | Buchung unabhängig vom Versand | bestanden |
| Retry/Audit | erster Fehler, zweiter Erfolg, unveränderliche Versuche | bestanden |
| Einstellungen | Push-Abwahl führt zu `suppressed` | bestanden |
| Deep-Link-Sicherheit | sichere Ziele und neutrale Rückfälle | bestanden |
| App-Regression | 159 Tests, Analyse, Web und Android | bestanden |
| Backend/PostgreSQL | 39/39 inklusive Migration 006 | bestanden |
| Unveränderliches Image | Commit, OCI-Revision und `/version` identisch | bestanden |
| Rückfall | B6-App auf B7-Schema gesund | bestanden |
| Restore | Vor-B7-Datenbank und Uploads getrennt wiederhergestellt | bestanden |
| Bereinigung | keine aktiven Testkonten/Inserate/Queuefehler | bestanden |
| Produktion | unverändert, produktiver Push aus | bestätigt |
| Reale APNs/FCM und physische Geräte | externe Plattformdaten und Store-IDs | offen bis B11 |

B7 ist damit als technischer Hauptbaustein bestanden. Der nächste
Hauptbaustein ist B8: Zahlungen, Auszahlungen und finanzielle
Ledger-Integrität.
