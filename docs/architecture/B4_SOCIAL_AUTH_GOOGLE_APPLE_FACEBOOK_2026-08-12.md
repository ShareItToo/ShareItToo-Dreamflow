# B4 – Social Login mit Google, Apple und Facebook

Status: Code und lokale Prüfungen fertig; Google in Firebase vorbereitet,
aber im aktuellen App-Kandidaten weiterhin release-seitig gesperrt. Apple und
Facebook sind extern noch nicht aktiviert.

## Verifizierter externer Stand am 14. August 2026

- Firebase Authentication ist im Projekt `shareittoo-staging` initialisiert.
  Telefon und Google sind in Firebase aktiviert. Apple und Facebook bleiben
  deaktiviert.
- Das SIT-Geschäftskonto besitzt Projektzugriff und ist zusätzlich zum
  bisherigen privaten Eigentümerkonto als Projekteigentümer eingetragen. Das
  private Konto bleibt als Rückfallzugang bestehen.
- Der Google-Anbieter wurde am 15. August 2026 mit dem öffentlichen Namen
  `ShareItToo` und der geschäftlichen SIT-Supportadresse gespeichert. Die
  private Adresse wurde ausdrücklich nicht verwendet. Der bereinigte Nachweis
  liegt unter
  `docs/evidence/b11/firebase-google-signin-provider-20260815.json`.
- SHA-1 und SHA-256 des kanonischen Android-Upload-Zertifikats sind im
  Firebase-Android-App-Eintrag gespeichert und in der Konsole rückgelesen.
  Die Android-Konfigurationsdatei wird erst nach Aktivierung des Google-
  Anbieters einmalig neu geladen, damit sie den endgültigen OAuth-Stand
  enthält.
- Beide Firebase-Konfigurationsdateien wurden nach der Google-Aktivierung neu
  geladen, ausschließlich lokal mit Eigentümerrechten ersetzt und bleiben aus
  Git ausgeschlossen. Android enthält zwei zertifikatsgebundene und einen
  Web-OAuth-Client. Die Apple-Datei enthält Google-Client-ID, umgekehrte
  Client-ID und aktiviertes Google Sign-In; Analytics und Werbung bleiben aus.
- Der plattformübergreifende Release-Validator akzeptiert die neuen Dateien.
  Er unterstützt nun auch die von Firebase aktuell ausgegebenen erweiterten
  XML-Booleschen Werte wie `<true></true>` und `<false></false>`.
- Der Android-Validator verlangt zusätzlich exakt zwei verschiedene
  zertifikatsgebundene OAuth-Clients für Upload- und Play-App-Signing sowie
  genau einen gültigen Web-OAuth-Client. Dadurch kann ein lokaler Direktbuild
  nicht mehr fälschlich als ausreichende Vorbereitung für den aus Google Play
  installierten Build gelten.
- Auf dem Build-Mac sind nur die Apple Command Line Tools vorhanden.
  Vollständiges Xcode, `xcodebuild` und CocoaPods fehlen; ein iOS-Archiv wurde
  folgerichtig nicht versucht.
- Es wurden keine OAuth-Schlüssel, Provider-Secrets, Client-IDs oder
  Nutzertokens in Nachweise oder das Repository übernommen. Der
  Staging-Endpunkt lehnt einen rein synthetischen ungültigen Token mit `401`
  und `invalid_social_token` ab; kein Konto und keine Sitzung wurden erzeugt.
- Der veröffentlichte Play-Kandidat `2026081509` bleibt unverändert mit
  deaktivierten Google-, Apple- und Facebook-Release-Schaltern. Die externe
  Google-Aktivierung allein macht den Weg daher in dieser App noch nicht
  nutzbar und löst keinen neuen Build aus.

## Architektur

- Firebase Authentication führt den jeweiligen Anbieter-Dialog aus und stellt
  ein kurzlebiges Firebase-ID-Token aus.
- Die App sendet ausschließlich dieses Firebase-ID-Token an
  `POST /v1/auth/social`. Provider-Zugriffstoken werden weder im SIT-Backend
  gespeichert noch protokolliert.
- Das Backend prüft Signatur, Zielprojekt und Widerruf über das Firebase Admin
  SDK. Es akzeptiert ausschließlich `google.com`, `apple.com` und
  `facebook.com`.
- Erst danach verknüpft das Backend die externe Identität mit genau einem
  SIT-Konto und stellt die normale kurzlebige SIT-Sitzung mit rotierendem
  Refresh-Token aus. Kontostatus, Moderation und Berechtigungen bleiben
  ausschließlich im SIT-Backend maßgeblich.
- Die Kontoverknüpfung verwendet die unveränderliche native Anbieter-ID;
  zusätzlich wird die Firebase-Nutzer-ID für Export, Widerruf und die spätere
  vollständige Kontolöschung festgehalten. Anbieter-Tokens werden weiterhin
  nicht gespeichert.
- Nach erfolgreicher Übergabe an das SIT-Backend meldet die App Firebase sowie
  das Google- beziehungsweise Facebook-SDK wieder ab. Auf dem Gerät verbleibt
  nur die normale SIT-Sitzung.

## Sichere Kontoverknüpfung

- Google und Apple dürfen nur mit einer vom Anbieter bestätigten E-Mail ein
  bestehendes SIT-Konto automatisch verknüpfen.
- Facebook-E-Mails gelten laut Firebase nicht automatisch als bestätigt. Ein
  neues Facebook-Konto erhält deshalb einmal eine SIT-Bestätigungs-E-Mail.
- Eine unbestätigte Facebook-E-Mail darf niemals ein vorhandenes SIT-Konto
  übernehmen; dafür ist zuerst die bestehende SIT-Anmeldung erforderlich.
- Neue Nutzer müssen Mindestalter, AGB und Datenschutz bestätigen – unabhängig
  vom gewählten Anbieter.
- Gleichzeitige Anmeldeversuche werden je Provider-Identität serialisiert;
  Datenbank-Eindeutigkeitsregeln verhindern Doppelverknüpfungen.

## Noch erforderliche externe Einrichtung

1. Google ist in Firebase Authentication aktiviert. Für den nächsten bewusst
   gebündelten Kandidaten nur Google release-seitig einschalten und anschließend
   Kontoauswahl, Zustimmung, sichere Kontoverknüpfung und Abmeldung auf einem
   physischen Staging-Gerät prüfen. Das Google-only-Profil ist ohne Artefakt im
   App-Code getestet. Der vorbereitete Einmal-Baupfad verweigert eine nicht
   erhöhte Buildnummer, Apple/Facebook, Produktion und Store-Einreichung.
2. Android-SHA-1 und SHA-256 des echten Upload-Zertifikats sowie der SHA-1 des
   Play-App-Signing-Zertifikats sind in Firebase registriert. Die nach
   Aktivierung des Google-Anbieters neu geladene Android-Konfigurationsdatei
   enthält zwei verschiedene zertifikatsgebundene OAuth-Clients und einen
   Web-Client; der Release-Vorcheck validiert dies fail-closed. Der kanonische
   Upload-Fingerabdruck ist SHA-1
   `6A:79:73:86:14:85:F7:33:0D:57:25:FF:D6:AA:A9:06:6D:78:97:14` und SHA-256
   `09:8F:48:5E:57:16:15:58:E9:11:FC:3C:74:28:45:92:55:84:DB:31:C4:74:CD:BA:08:DD:A0:2F:EB:01:29:A4`.
3. Apple Developer: „Sign in with Apple“ für `com.shareittoo.app` aktivieren,
   Firebase-Apple-Provider verbinden und die iOS-Konfiguration aktualisieren.
4. Meta Developer App anlegen; echte öffentliche App-ID und Client-Token nur
   über die Release-Konfiguration liefern, App Secret ausschließlich in
   Firebase/Meta verwalten.
5. Apple und Facebook erst nach vollständiger externer Einrichtung
   release-seitig aktivieren und auf Staging-Geräten prüfen. Der aktuelle
   Kandidat behält für alle drei Anbieter seine geschlossenen Schalter.

Bis diese Schritte vollständig sind, scheitern die Anbieterwege sichtbar und
geschlossen; E-Mail-Anmeldung bleibt verfügbar.
