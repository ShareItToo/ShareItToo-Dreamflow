# RW20 zweites Android-Handy — Internal-Testmatrix

Status: **ONEPLUS-ALTBUILD INSTALLIERT — NEUER KANDIDAT NOCH NICHT AKTIV**

Gebundene Soll-Identitaet: `com.shareittoo.app`, Version `1.0.0`, VersionCode
`2026082601`, Internal Track, Staging-API. Artefakt-Quell-Commit:
`a1aa3f2528f1923c092a1fb15bdd3dc083673890`; AAB-SHA-256:
`8cf36552f39fe9558411809518b374c437125cbd6ef123258ad9df7061acd873`.

Derzeitiger OnePlus-Erkenntnisstand: Installation bestaetigt; wegen des nur
gespeicherten Play-Entwurfs wird Build `2026081509` erwartet. Noch keine Zeile
dieser Matrix ist fuer `2026082601` ausgefuehrt. Die vorbereitete read-only
Wireless-ADB-Baseline fuer den Alt-Build darf nicht als Kandidatentest zaehlen.

| Test | Vorbereitung | Erwartung | Stopkriterium |
| --- | --- | --- | --- |
| Clean Install | App nicht vorhanden; privater Play-Opt-in aktiv | Installation aus Google Play, richtige Paket-ID und Buildnummer | Sideload, falsche Version oder anderer Track |
| Update von `2026081509` | Alten internen Build nicht deinstallieren | Play-Update erhaelt App-Daten und Kontokontext; kein Signaturfehler | Datenverlust, Downgrade, Neuinstallation erforderlich |
| WLAN | Stabiler privater Internetzugang | Start und verfuegbare Staging-Aufrufe verhalten sich definiert | Produktionsziel oder unerwarteter Providerverkehr |
| Mobilfunk/Hotspot | WLAN aus; mobile Verbindung aktiv | Gleiches sichtbares Verhalten und keine WLAN-Abhaengigkeit | Netzwechsel erzeugt falschen Erfolg oder fremde Daten |
| Offline zu Online | Nach initialem Start offline schalten, danach wieder online | Offline bleibt erkennbar; Wiederherstellung zeigt nur serverbestaetigte Wahrheit | Fehler erscheint als Erfolg oder als wahrheitsgemaess leer |
| Prozessende/Neustart | App aus Recents entfernen beziehungsweise Prozess beenden | Neustart erhaelt nur korrekt gebundene lokale Daten und laedt Remote-Wahrheit neu | Fremdkonto, verlorene angenommene Wahrheit oder erfundener Erfolg |
| Account A zu B | Nur zwei owner-bereitgestellte synthetische Konten | A-Dialoge/Antworten erscheinen nie unter B; B-eigene Route bleibt erhalten | A-Daten, A-Erfolg oder A-Navigation unter B |
| Berechtigungen | Kamera/Fotos/Benachrichtigungen nur bei sichtbarem Anlass pruefen | Ablehnung bleibt nutzbar und wird nicht als Zustimmung behandelt | Pauschaler Galeriezugriff, unerwartete Pflichtfreigabe oder falscher Erfolg |
| Verfuegbare Stage-A-Oberflaechen | Staging erreichbar und Owner-Testkonto vorhanden | Nicht bindender Hinweis, Listing-Entwurf, Suche, Gemerkt/Projekt und nicht reservierender Mietkorb soweit serverseitig vorhanden | Bindende Anfrage, Vertrag, Zahlung oder automatische Publikation |
| Blue-Ocean-UI | Nur ausdruecklich sichtbaren internen Ablauf oeffnen | Externer Provider bleibt aus; nur klar gekennzeichnete manuelle/Mock-Grenze | Externer KI-Aufruf, Kosten oder autoritative Providerbehauptung |

## Ohne weitere Aktivierung nicht vollstaendig testbar

- Ein nicht erreichbares oder nicht owner-freigegebenes Staging-Backend begrenzt
  Login, serverseitige Listings, Suche und Kontowechsel auf Fehler-/Offlinepfade.
- Externe Listing-KI bleibt ohne separates Provider- und Budget-Gate aus.
- Echte Zahlungen, Refunds, Auszahlungen, KYC und Payment-Webhooks bleiben aus.
- Bindende Mietanfrage, Vertrag, Annahme/Ablehnung sowie
  Uebergabe/Rueckgabe/Schaeden/`needsReview` werden nicht als Release-Erfolg
  beansprucht.
- G3/G4/G5, oeffentliche Registrierung, Closed/Open/Production, FCM-Liveversand,
  Crashlytics-Ereigniserzeugung und Support-Upload bleiben ausserhalb dieses
  Tests, solange ihre separaten Gates geschlossen sind.

Jede Zeile wird als `PASS`, `FAIL`, `BLOCKED_BY_GATE` oder `NOT_RUN` mit
anonymem Run-Code und sichtbarer Buildnummer erfasst. Keine Kontoadresse,
Opt-in-URL, Tokens, Rohfotos oder persoenliche Daten in Evidence uebernehmen.
