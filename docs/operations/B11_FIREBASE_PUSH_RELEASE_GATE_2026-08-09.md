# B11 – Firebase-, Push- und Crash-Release-Gate

Stand: 9. August 2026

Status: Firebase-Projekt und beide App-Identitäten angelegt; öffentliche
Plattformkonfiguration wird lokal eingebunden. FCM-Service-Account, APNs,
signierter Push-Kandidat und reale Geräteabnahme bleiben offen. Produktion
wurde nicht verändert.

## Autoritative Firebase-Identität

| Feld | Wert |
|---|---|
| Projektname | `shareittoo-staging` |
| Projekt-ID | `shareittoo-staging` |
| Projektnummer / Messaging Sender ID | `214007794438` |
| Tarif | Spark, kostenlos |
| Google Analytics | deaktiviert |
| Android-Paket | `com.shareittoo.app` |
| Android-App-ID | `1:214007794438:android:4f2dedc99128fabeeaac87` |
| iOS-Bundle | `com.shareittoo.app` |
| iOS-App-ID | `1:214007794438:ios:b8df8a8d00664f7eeaac87` |

Die Firebase-Konfigurationsdateien enthalten öffentliche App-Kennungen und
API-Konfiguration, aber keinen FCM-Service-Account und keinen privaten APNs-
Schlüssel. Trotzdem bleiben `android/app/google-services.json` und
`ios/Runner/GoogleService-Info.plist` aus Git ausgeschlossen, damit keine
Umgebungswerte versehentlich zwischen Staging und einem späteren
Produktionsprojekt vermischt werden.

## Fail-closed Release-Vertrag

`tool/validate_firebase_release_config.mjs` ist die autoritative Vorprüfung.
Im normalen Entwicklungs- und CI-Modus akzeptiert sie den ehrlichen Zustand
`planned`, solange keine unvollständige Plattformkonfiguration vorgetäuscht
wird. Ein Store- oder Firebase-pflichtiger Build verlangt dagegen:

- die zur Plattform passende Firebase-Konfigurationsdatei;
- Projekt-ID, Sender-ID, App-ID und API-Schlüssel aus derselben Konfiguration;
- exakt `com.shareittoo.app` als Paket beziehungsweise Bundle;
- Firebase Core, Messaging und Crashlytics, aber keine Analytics-, Werbe- oder
  Performance-Abhängigkeit;
- Android-Gradle-Plug-ins nur bei vorhandener Konfiguration;
- iOS Push Capability, APNs-Entitlement und die Hintergrundmodi `fetch` und
  `remote-notification`;
- aktiviertes Firebase-App-Delegate-Swizzling;
- Crashlytics-dSYM-Upload als letzte Xcode-Buildphase.

Die Prüfung ist in technische Regression, Release-Preflight und den
Android-Release-Builder eingebunden. Der strenge Lauf lautet:

```text
node tool/validate_firebase_release_config.mjs --require-configured --platform all
```

Ein Store-Preflight schaltet diesen strengen Lauf automatisch ein.

## iOS/APNs-Sicherung

Die App wartet nach erteilter Push-Berechtigung begrenzt auf einen echten
APNs-Token, bevor sie einen FCM-Token anfordert. Bleibt APNs aus, wird keine
scheinbar erfolgreiche Geräteregistrierung erzeugt. Debug verwendet die
Development-APNs-Umgebung; Profile und Release verlangen Production.

Ein Apple Developer Team ist für die reine Firebase-iOS-Registrierung noch
nicht nötig. Vor TestFlight und realer iPhone-Push-Abnahme werden jedoch eine
Apple-ID, eine aktive Apple-Developer-Mitgliedschaft, Team-Signierung,
Provisioning und ein APNs-Authentifizierungsschlüssel benötigt. Dieser
Schlüssel wird nur in Firebase/Apple verwaltet und niemals in Git oder
Telegram kopiert.

## Backend-Zugangsdaten

Der FCM-Service-Account ist ein echtes Geheimnis und bleibt getrennt von den
öffentlichen App-Konfigurationen. Bei aktiviertem FCM prüft das Backend beim
Start nicht nur die Lesbarkeit der Datei, sondern auch Typ, Projektnummern-
Format, Token-Endpunkt, Private-Key-Hülle, Service-Account-Domain und die
Bindung an die erwartete Firebase-Projekt-ID. Jeder Fehler schließt den Start
mit einer generischen Meldung; Inhalte werden nicht geloggt.

Der spätere Staging-Mount ist read-only und liegt außerhalb des Repositories.
Produktion bleibt bis zu einer eigenen Freigabe auf deaktiviertem Push-
Transport.

Auf dem VPS bleibt die Datei im Besitz von `root`. Sie erhält ausschließlich
für die dedizierte, keinem Login zugeordnete Laufzeitgruppe `65532` Leserecht
(`0640`, `root:65532`). Dieselbe Gruppe wird nur dem isolierten Staging-API-
Prozess ergänzend zugewiesen. So kann der nicht privilegierte Prozess den
Schlüssel lesen, ohne Weltlesbarkeit oder einen Login-Zugriff zu eröffnen.

Die Aktivierung erfolgt ausschließlich über die zusätzliche Compose-Datei
`backend/compose.staging.fcm.yml`. Sie erzwingt `PUSH_TRANSPORT=fcm`, die
Projekt-ID `shareittoo-staging`, einen absoluten Hostpfad und einen
read-only-Bind-Mount ohne automatische Dateierstellung. Die Produktion nutzt
diese Datei nicht.

Vor jedem FCM-Staging-Start muss auf dem VPS ausgeführt werden:

```text
FIREBASE_PROJECT_ID=shareittoo-staging \
FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/absoluter/pfad/firebase-service-account.json \
node backend/ops/validate_fcm_staging_secret.mjs
```

Der Prüfer akzeptiert nur eine normale, nicht verlinkte Datei außerhalb des
Repositories. Zulässig sind entweder reine Eigentümerrechte (`0600`) oder auf
dem VPS exakt `0640` mit `root` als Eigentümer und Gruppe `65532`; jede andere
Gruppen- oder Weltlesbarkeit wird abgelehnt. Er prüft Größe, Eigentümer,
Service-Account-Struktur und exakte Projektbindung, gibt aber weder Pfad noch
E-Mail noch Schlüsselmaterial aus. Erst nach `PASS` darf der Staging-Override
verwendet werden.

Der Account ist bewusst auf
`sit-fcm-staging@shareittoo-staging.iam.gserviceaccount.com` festgelegt. Ihm
wird ausschließlich die von Google für HTTP-v1-Senden dokumentierte Rolle
`roles/firebasecloudmessaging.admin` zugewiesen. Der automatisch erzeugte,
breiter verwendbare `firebase-adminsdk`-Account wird vom Gate abgelehnt. Die
Rollenquelle ist die offizielle
[Google-IAM-Referenz](https://cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging).

`backend/ops/deploy_release.sh` bindet den Override nur bei der ausdrücklichen
Staging-Freigabe `ENABLE_STAGING_FCM=1` ein und führt den Prüfer vor Compose
automatisch aus. Derselbe Schalter ist für Produktionsdeployments verboten.
Der erfolgreiche Release-Nachweis hält mit `stagingFcm=true` ausschließlich
die bewusste FCM-Aktivierung fest, ohne Secretpfade oder Credential-Metadaten
zu speichern.

## Noch offene Freigabeschritte

1. Beide öffentlichen Plattformdateien lokal ablegen und den strengen
   Konfigurationsprüfer bestehen lassen.
2. Einen minimal berechtigten FCM-Service-Account außerhalb Git erzeugen,
   sicher auf den VPS übertragen und nur in isoliertem Staging read-only
   mounten.
3. Einen signierten Android-Build `2026080903` oder höher mit Firebase bauen,
   Binärscan und GitHub Actions vollständig bestehen lassen.
4. Apple Developer Team und APNs erst nach Kontoeinrichtung verbinden; danach
   iOS-Archiv und dSYM-Zuordnung prüfen.
5. Vordergrund, Hintergrund, beendete App, Berechtigungsablehnung,
   Tokenwechsel und Logout auf realen Geräten gemäß B11-Runbook abnehmen.
6. Erst danach Push für den geschlossenen Pilot freigeben. Öffentlicher Store,
   Produktion und echtes Geld bleiben eigene Gates.

## Automatische Negativproben

Die Tests decken unter anderem fehlende Dateien, nur teilweise gesetzte
Umgebungswerte, falsches Android-Paket, falsches iOS-Bundle, fremde App-IDs,
abweichende API-Schlüssel, eingeschaltete Analytics-/Werbefunktionen,
deaktiviertes Swizzling, fehlenden APNs-Token und einen Service-Account aus
dem falschen Projekt ab.
