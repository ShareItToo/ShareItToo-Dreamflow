# B11 – Runbook für geschlossenen Store-Test und reale Geräte

Status: Android-Kandidat und Staging-FCM vorbereitet; direkter Android-
Gerätelauf wartet auf ein physisches Telefon, Store- und Apple-Gates bleiben
offen

## Zweck und Schutzgrenze

Dieses Runbook führt den unveränderten ShareItToo-Kandidaten durch Google Play
Internal Testing, Apple TestFlight und die reale Geräteabnahme. Es erlaubt
ausschließlich geschlossene Tests gegen `staging.shareittoo.com`.

Nicht erlaubt sind öffentlicher Store-Rollout, Produktionsdeployment,
Stripe-Liveschlüssel, echtes Geld, echte Auszahlungen oder nicht ausdrücklich
eingeladene Testpersonen.

## Verbindlicher Release-Eintrag

Vor jeder Installation werden alle Felder ausgefüllt. Ändert sich Commit,
Buildnummer, Signatur, Firebase-Konfiguration oder API-Ziel, beginnt die
betroffene Abnahme mit einem neuen Eintrag von vorn.

<!-- SIT_CURRENT_RELEASE_SNAPSHOT_BEGIN -->
### Aktueller maschinengebundener B11-Kandidat

| Merkmal | Verbindlicher Wert |
|---|---|
| App-Identität | `com.shareittoo.app` (Android und iOS) |
| Version und Build | `1.0.0 (2026081509)` |
| App-Commit | `3fa045b98897f9551f91da932136c2b100b2d700` |
| Kanal und API | `internal`, `https://staging.shareittoo.com/api/v1` |
| Firebase und Zahlung | vollständig: `true`; `memory`; `stripeLivemode=false` |
| Android-AAB SHA-256 | `8295b7cef0de1061acdf4179080deda0fb13133c4d7fd306da0d51062312fcc5` |
| Android-APK SHA-256 | `517e1e15b8bbb4409444d29aa5094feedba590078fadaba3293142ab62f1593f` |
| Uploadzertifikat SHA-256 | `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4` |
| Direkte Android-Diagnose | `pending`; noch kein kandidatenspezifischer Nachweis |
| Direkte Android-App-Link-Diagnose | `pending`; noch kein kandidatenspezifischer Nachweis |
| Angemeldete Android-Sitzungsdiagnose | `pending`; noch kein kandidatenspezifischer Nachweis |
| Synthetische Android-Rollenbuchung | `passed` auf Pixel 7 Pro, Android 16; `docs/evidence/b11/android-synthetic-role-booking-2026081509-20260815T133048Z.json` |
| Authentifizierte Android-Deep-Links | `passed` auf Pixel 7 Pro, Android 16; `docs/evidence/b11/android-authenticated-deep-links-2026081509-20260815T132509Z.json` |
| Kontrollierte Android-FCM-Diagnose | `passed` in Vordergrund, Hintergrund und bei beendetem Prozess; `docs/evidence/b11/android-controlled-fcm-2026081509-20260815T131855Z.json` |
| Android-Abmeldung und Push-Unterdrückung | `passed`; `docs/evidence/b11/android-logout-lifecycle-2026081509-20260815T131701Z.json` |
| Android-Offline-/Realtime-Wiederherstellung | `passed` auf Pixel 7 Pro, Android 16; `docs/evidence/b11/android-offline-realtime-2026081509-20260815T132209Z.json` |
| Google-Play-Installation | `passed`; interner Track, exakte Version `1.0.0 (2026081509)` |
| Android-WLAN-/Owner-Matrix | `testing`; Teilpruefungen 9/11 bestanden; moderationAndAccount=testing, largeTextAndScreenReader=testing; `docs/evidence/b11/android-wifi-owner-progress-2026081509-20260815T133200Z.json` |
| Play-Signing und öffentliche App-Links | `passed`; `docs/evidence/b11/android-play-store-links-signing-2026081509-20260815.json` |
| Crashlytics-Releasezuordnung | `testing`; `docs/evidence/b11/android-crash-release-mapping-2026081509.json` |
| Kandidatenbeleg | `docs/evidence/b11/android-candidate-2026081509.json` |
| Staging-Servercommit | `36f9145e67be30fd01ffb61ad38e99361d391479` |
| Ehrlicher Freigabestand | `testing/hold`; Gerätezellen 0/4; Releaseprüfungen 5/7 |

Dieser Block wird aus den verbindlichen JSON-Nachweisen geprüft. Eine bestandene Google-Play-Installation ist nur belegt, wenn der aktuelle Kandidat aus dem internen Track installiert und gestartet wurde. Die früheren direkten APK-, App-Link-, Sitzungs-, Rollenbuchungs-, Deep-Link-, FCM-, Abmelde- und Offline-/Realtime-Diagnosen bleiben davon abgegrenzte Vorprüfungen. Die kontrollierten synthetischen WLAN-Nachweise schließen weder Hotspot und die vollständige Rollen-/Netzmatrix noch TalkBack, iOS/TestFlight, Produktion oder Echtgeld.
<!-- SIT_CURRENT_RELEASE_SNAPSHOT_END -->

Der lokale iOS-Werkzeugcheck für denselben Kandidaten steht auf
`pending-local-tooling`: Die vollständige Xcode-App, das ausgewählte
Xcode-Developer-Verzeichnis, `xcodebuild` und CocoaPods fehlen. Der bereinigte
Nachweis liegt unter
`docs/evidence/b11/ios-local-tooling-readiness-2026081509-20260815.json`.
Archiv, Signierung, Geräteinstallation und Upload wurden nicht versucht.

Der chronologisch erhaltene historische Logout-/Push-Lebenszyklusnachweis für Build
`2026081026` liegt unter
`docs/evidence/b11/android-logout-push-lifecycle-2026081026-20260810T140200Z.json`.
Er belegt auf dem physischen Android-Gerät Vordergrund-, Hintergrund- und bei
zuvor beendetem Prozess ausgelöste Staging-Pushs, das vergrößerte adaptive
Symbol, die Anmeldesperre nach einem Kaltstart und die ausbleibende Zustellung
nach dem Logout. Er wurde durch die oben referenzierten exakten Build-1029-
Nachweise abgelöst und schließt weiterhin kein Store-, Hotspot-, TalkBack- oder
iOS-Gate.

Die anschließende lesende Crashlytics-Triage ist unter
`docs/evidence/b11/crashlytics-open-issues-triage-20260810T221142Z.json`
festgehalten. Beide offenen Fatal-Gruppen stammen aus älteren Builds; für die
vorbereitete Korrektur sind 200 Flutter-Tests sowie Web- und Android-Debug-Build
grün. Da diese Änderung nicht Bestandteil des archivierten Build `2026081029`
ist, muss sie in einem neuen exakten Kandidaten erneut auf Geräten geprüft
werden und schließt hier kein Gate.

Der Kandidat ist gebaut, kanonisch signiert, privat archiviert und auf einem
physischen Pixel 7 Pro direkt diagnostisch installiert. Version, Buildnummer,
Paket, Start, Staging-Bindung und eine begrenzte maschinelle
Barrierefreiheitsprüfung wurden zurückgelesen. Eine neue Buildnummer oder
Funktionsänderung verlangt einen neuen Kandidatennachweis; die direkte
Installation ersetzt weiterhin weder Google Play Internal noch die manuelle
Rollen-, Netzwerk-, Push- und TalkBack-Matrix.

## Eintrittsbedingungen

Vor Beginn müssen alle zutreffenden Punkte nachweisbar erfüllt sein:

- Firebase-Projekt `shareittoo-staging` angelegt; Android- und iOS-App exakt
  mit `com.shareittoo.app` registriert.
- Android `google-services.json` und iOS `GoogleService-Info.plist` lokal
  eingebunden und gegen Projekt `shareittoo-staging` geprüft; beide bleiben
  aus Git ausgeschlossen.
- FCM-Service-Account außerhalb Git sicher eingebunden, strukturell geprüft
  und read-only auf Staging gemountet.
- Der strenge Firebase-Releaseprüfer für beide Plattformen ist bestanden;
  Analytics und Werbung bleiben deaktiviert.
- APNs-Key, Apple-Team und Provisioning für TestFlight verfügbar.
- Play-App-Signing-Fingerabdruck zusätzlich in Digital Asset Links
  eingetragen und öffentlich geprüft.
- Google-Play-Internal-Track und TestFlight-interne Gruppe vorhanden.
- Mindestens ein reales unterstütztes Android- und ein reales iOS-Gerät
  verfügbar; Geräte besitzen keine produktiven ShareItToo-Daten.
- Zwei synthetische Testkonten stehen bereit: Vermieterrolle und Mieterrolle.
- Stripe bleibt `memory` oder ausdrücklich freigegebener Testmodus;
  `livemode=false` ist vor und nach jedem Lauf sichtbar.
- Staging `/version` zeigt exakt den freigegebenen Backendcommit; Readiness
  meldet Datenbank und Mail gesund sowie keine tote Queue.
- Vor dem Lauf besteht eine geprüfte Staging-Sicherung von Datenbank und
  Uploads.

### Synthetische Rollen-Konten ohne Secret-Leak

Für die wiederholbare Besitzer-/Mietermatrix erzeugt
`tool/provision_staging_test_accounts.mjs` genau zwei neue Alias-Konten über
den öffentlichen Staging-Registrierungsweg. Die Basis-Mailadresse wird nur aus
einer nicht leeren, eigentümerlesbaren Datei außerhalb des Repositories
gelesen; sie erscheint dadurch weder in der Prozessliste noch in Git. Der
Helfer schreibt E-Mail-Adressen und zufällige Passwörter ausschließlich in
einen lokalen Tresor unter
`~/Library/Application Support/ShareItToo/qa/staging-accounts/` mit privaten
Verzeichnis- und Dateirechten. Seine Konsolenausgabe enthält nur Laufkennung,
Rollen und Status, aber keine Adresse und kein Passwort.

```text
node tool/provision_staging_test_accounts.mjs --mailbox-file <private-datei>
```

Eine angenommene Registrierung ist noch kein bestätigtes Konto und schließt
kein Geräte-Gate. Der Verifizierungsweg muss separat auf Staging bestätigt
oder als ausdrücklich dokumentierte, isolierte Staging-Fixture vorbereitet
werden. Der Tresor darf nie in Git, Drive, Telegram, Maximus, Screenshots oder
Store-Review-Unterlagen gelangen und wird nach bereinigter Kontolöschung
entfernt. Der Helfer besitzt kein Produktionsziel und verändert weder
Produktionskonten noch Stripe-Live.

## Geräte- und Rollentabelle

Für jede Zeile werden Gerät, Betriebssystem, App-Build, Netz und Tester
eingetragen. Simulatoren dürfen ergänzen, aber keine reale Gerätezeile
ersetzen.

| Plattform | Gerät/Modell | Betriebssystem | Build | Netz | Rolle | Ergebnis |
|---|---|---|---|---|---|---|
| Android real | offen | offen | `2026081509` | WLAN | Vermieter | offen |
| Android real | offen | offen | `2026081509` | Mobilfunk/Hotspot | Mieter | offen |
| iOS real | offen | offen | `2026081509` | WLAN | Vermieter | offen |
| iOS real | offen | offen | `2026081509` | Mobilfunk/Hotspot | Mieter | offen |

Vor einer manuellen Android-Matrixrunde muss der neue, rein lesende Preflight
`tool/preflight_android_manual_matrix.mjs` den Status
`ready-for-manual-matrix` ausgeben. Er prüft fail-closed den exakten installierten
Build, die Installation durch Google Play, das aktive Netz, TalkBack und
mindestens 200 Prozent Textskalierung. Er schreibt keinen Nachweis und kann
keine Matrixzelle selbst als bestanden markieren.

Für WLAN wird zuerst ausgeführt:

```bash
node tool/preflight_android_manual_matrix.mjs --cell android-wifi-owner
```

Der ausgegebene bereinigte `networkFingerprint` wird anschließend als
Ausgangswert für die Hotspot-Runde verwendet. Wenn Android den WLAN-Namen aus
Datenschutzgründen nicht an ADB ausgibt, verwendet der Prüfer stattdessen einen
anonymisierten Fingerabdruck der lokalen WLAN-Route; weder Netzname noch
IP-Adresse erscheinen im Bericht. Erst nachdem das Telefon sichtbar mit dem
getrennten Handy-Hotspot verbunden wurde, darf die ausdrücklich manuelle
Bestätigung gesetzt werden:

```bash
node tool/preflight_android_manual_matrix.mjs \
  --cell android-hotspot-renter \
  --baseline-network-fingerprint <BEREINIGTER_WLAN_FINGERPRINT> \
  --confirm-hotspot
```

Der Preflight weist eine unveränderte WLAN-Verbindung, eine direkte APK statt
Play Internal, deaktiviertes TalkBack oder zu kleine Schrift als Blocker aus.
Auch ein grüner Preflight ersetzt keinen der elf manuellen Matrixpunkte.

## Artefakt- und Installationsprüfung

Vor jedem direkten Android-Gerätelauf wird der unveränderte Kandidat samt
privatem Archiv und das angeschlossene Gerät fail-closed geprüft:

```text
node tool/prepare_android_device_test.mjs
```

Der Prüfer vergleicht Buildnummer, Commit, Paketkennung, Staging-API,
Firebase-Zustand, AAB-/APK-Hashes, Uploadzertifikat, Datenschutzbericht und
private Dateirechte mit `store/device-validation.json`. Er akzeptiert genau ein
autorisiertes physisches Android-Gerät. Emulatoren, nicht bestätigte/offline
Geräte, mehrere gleichzeitig angeschlossene Telefone oder abweichende
Artefakte führen zum Stopp. Die Geräte-Seriennummer wird intern nur als
separates Prozessargument an ADB übergeben und weder ausgegeben noch in einen
Nachweis übernommen.

Der signierte Build archiviert das exakt geprüfte AAB, APK, Manifest und den
Datenschutzbericht jetzt automatisch über
`tool/archive_android_release_candidate.mjs`. Das private Ziel wird mit engen
Dateirechten angelegt, alle Hashes werden nach dem Kopieren erneut geprüft und
ein vorhandenes Kandidatenarchiv niemals überschrieben. Damit entfällt das
frühere manuelle Kopieren vor der Geräteprüfung.

Nach grünem Prüflauf erfolgt die ausdrücklich getrennte Diagnoseinstallation:

```text
node tool/prepare_android_device_test.mjs --install
```

Sie installiert exakt das geprüfte APK, liest die installierte Version zurück
und startet die App einmal. Das ausgegebene bereinigte JSON kennzeichnet diesen
Schritt bewusst als `direct-apk-diagnostic`: Er erfüllt weder das
Play-Internal-Installationsgate noch die manuelle Rollen-, Netzwerk-, Push-
oder Accessibility-Matrix. Für Kandidat `2026081403` ist der getrennte
Store-Download inzwischen bestanden; eine erneute direkte APK-Installation
darf diesen Play-Stand nicht ersetzen.

1. Commit, Buildnummer, Paketkennung, API-Ziel und Hash gegen den
   Release-Eintrag prüfen.
2. Den bereits aktiven Android-AAB im geschlossenen Internal-Track unverändert
   lassen; Warnungen und Play-App-Signing-Zertifikat dokumentieren.
3. Android weiterhin über den offiziellen Testlink verwenden. Die
   Store-Installation von `2026081403` ist belegt; ein direktes APK dient nur
   der Diagnose und zählt nicht als Ersatz.
4. iOS-Archiv aus dem dokumentierten Commit mit dem ausgewählten Team bauen,
   in TestFlight laden und Verarbeitung ohne kritische Warnung abwarten.
5. TestFlight-Build ausschließlich an interne oder ausdrücklich benannte
   geschlossene Tester verteilen.
6. Auf jedem Gerät eine vorhandene ältere Testinstallation entfernen, wenn
   dadurch Signatur-, Cache- oder Migrationszustand unklar wäre.
7. Erststart und `/version`-sichtbare Releasekennung im Testnachweis erfassen.

## Kernablauf pro Plattform

### Installation, Berechtigungen und Sitzung

1. Store-Installation, Erststart und Darstellung des weißen App-Icons prüfen.
2. Benachrichtigungs-, Foto-/Kamera- und weitere Berechtigungen einmal
   erlauben und einmal ablehnen; die App muss in beiden Fällen verständlich
   bleiben.
3. Verifiziertes Testkonto anmelden, App beenden, neu starten und
   Sitzungswiederherstellung prüfen.
4. Abmelden, erneut anmelden und parallele Sitzung auf dem zweiten Gerät
   prüfen.
5. App-Link für Verifizierung, Passwortweg, Buchung, Chat, öffentliches
   Inserat und öffentliches Profil öffnen; fremde Hosts, ungültige Kennungen
   sowie pausierte oder entfernte Inserate müssen sicher abgewiesen werden.

### Inserat, Suche und Buchung

1. Vermieter erstellt ein synthetisches Inserat mit mindestens einem
   Testbild, Preis, Standorttext und Verfügbarkeit.
2. Mieter findet es über Feed und Suche, öffnet Details und sendet eine
   Buchungsanfrage.
3. Vermieter nimmt an; beide Geräte zeigen denselben autoritativen Status.
4. Wiederholtes Tippen, Netzwechsel und erneutes Öffnen dürfen keine doppelte
   Anfrage oder Transition erzeugen.
5. Zahlung bleibt im freigegebenen Testtransport. Betrag, Plattformanteil und
   Beleg müssen mit dem Backendzustand übereinstimmen; Kaution muss `0` sein.

### Chat, Push und Offline-Wiederkehr

Für Vermieter und Mieter jeweils prüfen:

1. Nachricht im Vordergrund; genau eine Zustellung und korrekte Lesemarkierung.
2. App im Hintergrund; Push erscheint ohne private Nachrichtendetails auf dem
   Sperrbildschirm, sofern die Systemeinstellung Vorschauen begrenzt.
3. App vollständig beendet; Push öffnet ausschließlich den berechtigten Chat
   oder Buchungszustand.
4. Push-Berechtigung abgelehnt und später in Systemeinstellungen aktiviert.
5. WLAN aus, Aktion versuchen, Mobilfunk/Hotspot aktivieren und sichere
   Wiederkehr ohne doppelte Mutation prüfen.
6. Abmelden und Push an das alte Konto auslösen; das Gerät darf keine private
   Zielansicht des abgemeldeten Kontos öffnen.
7. Tokenwechsel beziehungsweise Neuinstallation prüfen; ungültige alte Tokens
   dürfen keine dauerhafte tote Queue erzeugen.

### Übergabe, Rückgabe, Storno und Vertrauen

1. Übergabe und Rückgabe in zulässiger Reihenfolge durchführen.
2. Storno- und Testrefundweg aus beiden Rollen prüfen.
3. Kontrollierten Streitfall mit ausschließlich synthetischer Evidenz anlegen.
4. Meldung und Blockierung prüfen; gesperrte Interaktion muss serverseitig
   abgewiesen werden.
5. Nach berechtigtem Abschluss je Rolle genau eine Bewertung erstellen;
   Duplikat muss abgewiesen werden.

### Datenschutz und Kontolebenszyklus

1. Kontodatenexport auslösen; Datei muss privat, vollständig und ohne
   Passwort-/Token-Hashes, Zahlungskennungen oder Staff-Notizen sein.
2. Exportdatei unmittelbar nach Prüfung vom Testgerät löschen.
3. Kontolöschungs-Preflight prüfen, blockierende Buchung zuerst korrekt
   abschließen oder stornieren und Konto regulär löschen.
4. Gelöschtes Konto darf keine neue Sitzung erhalten; berechtigte Auditspur
   bleibt ohne unnötige private Nutzdaten erhalten.

## Barrierefreiheit

Auf mindestens einer realen Gerätekonfiguration je Plattform:

- Systemschrift auf mindestens 200 Prozent; keine abgeschnittene P0-Aktion.
- TalkBack beziehungsweise VoiceOver vollständig für Login, Feed, Inserat,
  Buchung, Chat, Zahlungstest, Export und Löschung verwenden.
- Fokusreihenfolge, Rollen, Namen, Busy-, Fehler- und Erfolgsmeldungen prüfen.
- Kontrast, Touchziele, Hoch-/Querformat und kleine unterstützte
  Displaybreite prüfen.
- Externe Tastatur oder Switch-/Full-Keyboard-Access ergänzend prüfen, sofern
  auf dem Gerät verfügbar.

## Crashlytics- und Releasezuordnung

1. Nur auf dem geschlossenen Staging-Build ein kontrolliertes, als solches
   markiertes Testereignis erzeugen.
2. In Crashlytics prüfen: Paketkennung, Plattform, Version, Buildnummer,
   Commit-/Releasekennung und Testzeit stimmen überein.
3. Sicherstellen, dass weder Token, E-Mail, Nachrichtentext, Adresse noch
   Zahlungsdaten im Ereignis erscheinen.
4. Ereignis im Nachweis referenzieren, nicht dessen sensible Rohdaten kopieren.

## Evidenz und Datenschutz

Jeder Lauf erhält eine eindeutige Kennung im Format
`b11-<plattform>-<build>-<kurzzeit>`. Erfasst werden:

- Gerät und Betriebssystem ohne persönliche Gerätekennung;
- Store-Track, Version, Build, Commit und Artefakthash;
- Testschritt, erwartetes Ergebnis, tatsächliches Ergebnis und Schweregrad;
- bereinigter Screenshot oder Bildschirmaufnahme, wenn für den Fehler nötig;
- relevante serverseitige Anfragekennung, niemals Token oder vollständige
  private Nutzdaten;
- Abschlusszeit, Testerrolle und Freigabeentscheidung.

Screenshots werden vor Ablage auf E-Mail, Namen, Adressen, Nachrichten,
Geräte-IDs und Zahlungsdetails geprüft. Versehentlich erfasste private Daten
werden nicht in Git, Telegram oder den Masterplan kopiert.

### Maschinenlesbarer Go/No-Go-Nachweis

`store/device-validation.json` ist die verbindliche Ergänzung zu diesem
Runbook. Vor Beginn wird dort derselbe Commit, Build, API-Ziel, Firebase- und
Zahlungsmodus eingetragen. Jede der vier Rollen-/Netz-Zellen erhält nach der
Ausführung Gerätemodell, Betriebssystem, Store-Installationsweg, alle
Einzelresultate und einen bereinigten JSON-Nachweis unter
`docs/evidence/b11/`. Eine bloß vorhandene oder nicht leere Datei zählt nicht:
Der Validator prüft Zell-ID, Kandidatenidentität, alle elf Einzelprüfungen,
Zeitpunkte und Datenschutzgrenzen inhaltlich. Releaseprüfungen und Freigaben
benötigen entsprechend gebundene JSON-Nachweise; fremde Prüfungs-IDs,
abweichende Commits und Roh-Gerätekennungen führen zum Stopp.

Der offene Stand muss jederzeit bestehen:

```text
node tool/validate_device_evidence.mjs
```

B11 darf nur freigegeben werden, wenn zusätzlich der strenge Lauf besteht:

```text
node tool/validate_device_evidence.mjs --require-passed
```

Der strenge Lauf verlangt vier bestandene reale Gerätezellen, sieben
plattformweite Releaseprüfungen, technische und produktseitige Freigabe sowie
die gemeinsame Schließung der drei zugehörigen Store-Gates. Zugangsdaten,
Tokens, Roh-Gerätekennungen und unbereinigte Nutzerdaten sind in Manifest und
Evidenzablage verboten. Detailvertrag:
`docs/operations/B11_MACHINE_READABLE_DEVICE_EVIDENCE_2026-08-09.md`.

## Fehlerklassen und Stop-Regeln

| Klasse | Bedeutung | Reaktion |
|---|---|---|
| P0 | Datenverlust, Kontoübernahme, Secret-/Privatdatenleck, falscher Geldfluss, nicht autorisierter Zugriff, App startet nicht oder Kernbuchung unmöglich | Test sofort stoppen, Track nicht freigeben, Staging sichern, Ursache beheben und gesamte betroffene Matrix mit höherer Buildnummer wiederholen |
| P1 | Wesentliche Kernfunktion, Push, Deep Link oder Accessibility-Weg unbrauchbar, aber kein unmittelbarer P0-Schaden | Keine B11-Freigabe; Fix und betroffene Plattformmatrix wiederholen |
| P2 | Begrenzte Abweichung mit verständlichem Workaround | Dokumentieren, priorisieren und explizit vor Pilotfreigabe bewerten |
| P3 | Kosmetik ohne Funktions- oder Zugänglichkeitsverlust | Backlog; blockiert geschlossenen Test nicht automatisch |

Bei falscher API-Umgebung, unerwartetem `livemode=true`, unbekanntem Commit,
nicht reproduzierbarer Signatur oder fehlendem Staging-Backup gilt unabhängig
von der sichtbaren Funktion sofort No-Go.

## Rückfall und Bereinigung

1. Fehlerhaften Store-Build deaktivieren beziehungsweise Testerzugriff
   stoppen; keinen öffentlichen Rollout auslösen.
2. Staging nur über den aktuellen abgesicherten Deploy-Harness auf den letzten
   dokumentierten gesunden Image-Digest zurücksetzen.
3. Datenbank nicht herabmigrieren. Bei additiver Migration zunächst ältere App
   auf neuem Schema prüfen; Restore nur nach eigener Restore-Abnahme.
4. Synthetische Buchungen, Inserate, Uploads und aktive Testkonten regulär
   bereinigen; notwendige Audit-/Fallspuren bleiben nachvollziehbar.
5. Push-Tokens der Testgeräte beim Abmelden oder Kontolöschen deaktivieren.
6. Readiness, Version, Queue, Payment-Status und Produktionsinvariante nach dem
   Rückfall erneut prüfen.

## B11-Go/No-Go

B11 ist nur bestanden, wenn alle Punkte erfüllt sind:

- derselbe dokumentierte Build wurde aus Play Internal Testing und TestFlight
  auf realen Geräten installiert;
- die vollständige Kernmatrix ist auf Android und iOS ohne offenen P0 oder P1
  bestanden;
- TalkBack und VoiceOver sind auf den Kernwegen bestanden;
- Push in Vordergrund, Hintergrund und beendetem Zustand ist geprüft;
- Crashlytics zeigt die korrekte Releasezuordnung ohne sensible Nutzdaten;
- Store-Warnungen, App-Signing-Fingerabdrücke und Deep Links sind geprüft;
- synthetische Testdaten sind bereinigt und Staging bleibt gesund;
- Produktion und Echtgeldpfade blieben unverändert;
- Bericht, Masterplan und Maximus enthalten denselben finalen Buildstand.
- `node tool/validate_device_evidence.mjs --require-passed` besteht für genau
  diesen unveränderten Build.

Erst danach darf B12 mit exakt diesem unveränderten Geräte-Build beginnen.
