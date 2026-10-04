# B4 – Sichere Telefonnummern-Verifizierung

Stand: 14. August 2026
Status: technisch implementiert; standardmäßig deaktiviert; Console-, Datenschutz- und echte Gerätetests offen

## Ziel und klare Grenze

ShareItToo bestätigt den Besitz einer Telefonnummer über Firebase
Authentication. Die App darf eine Nummer niemals lokal als verifiziert
markieren. Der ShareItToo-Server akzeptiert ausschließlich ein serverseitig
geprüftes Firebase-ID-Token aus dem Provider `phone` und nur dann, wenn die
darin bestätigte E.164-Nummer exakt der angeforderten Nummer entspricht.

Die Implementierung ist an den reservierten, noch nicht gebauten oder
eingereichten Nachfolger `2026081403` gebunden. Firebase Authentication ist
im Staging-Projekt initialisiert; noch kein Anmeldeanbieter ist aktiviert.
Die kanonischen SHA-1- und SHA-256-Fingerabdrücke des Android-
Uploadzertifikats sind im Firebase-App-Eintrag gespeichert. Der Telefonanbieter
und eine SMS-Region wurden nicht aktiviert, es wurde keine SMS versendet und
kein AAB dieses Nachfolgers gebaut oder hochgeladen.

## Ablauf

1. Die angemeldete App fragt den authentifizierten Backend-Status ab.
2. Nur bei aktivierter Serverfunktion zeigt die App vor dem SMS-Versand einen
   ausdrücklichen Hinweis zur Übertragung an Firebase Authentication (Google)
   und zur Spam-/Missbrauchsabwehr.
3. Firebase führt Android-/iOS-Appprüfung und SMS-Bestätigung aus.
4. Die App erhält ein kurzlebiges Firebase-ID-Token und sendet es zusammen mit
   der normalisierten E.164-Nummer über die bestehende authentifizierte
   ShareItToo-Sitzung an den Server.
5. Der Server prüft Signatur, Ablauf, Widerruf, Projekt und
   `sign_in_provider=phone`, gleicht beide Nummern exakt ab und sperrt den
   aktuellen Benutzer in einer Datenbanktransaktion.
6. Der Server prüft, dass die nur für diesen Besitznachweis erzeugte
   Firebase-Telefonidentität ausschließlich den Provider `phone` enthält, und
   löscht sie. Eine mit Google, Apple oder Facebook verknüpfte Identität wird
   niemals gelöscht. Schlägt die sichere Bereinigung fehl, wird die
   Verifizierung nicht übernommen; es bleibt kein zweites dauerhaftes
   Anmeldekonto zurück.
7. Erst dann setzt der Server `phone_verified_at`. Ein partieller eindeutiger
   Index verhindert, dass dieselbe bestätigte Nummer zwei Konten gehört.
8. Das Audit speichert nur `provider=firebase-phone` – keine Telefonnummer,
   keinen SMS-Code und kein Firebase-Token.

## Technische Schutzmaßnahmen

- eigene, standardmäßig falsche Variable
  `FIREBASE_PHONE_VERIFICATION_ENABLED`; Social Login wird dadurch nicht
  mitaktiviert;
- authentifizierter, nicht cachebarer Status-Endpunkt;
- getrennt begrenzter Bestätigungs-Endpunkt;
- serverseitige Tokenprüfung einschließlich Widerrufsprüfung;
- Löschung der temporären Firebase-Telefonidentität vor dem Datenbank-Commit;
- keine Demo-Codes, Debug-Codes oder clientseitige `phoneVerified=true`-Pfad;
- eindeutige verifizierte Nummer auf Datenbankebene einschließlich Schutz
  gegen Parallelrennen;
- verständliche Fehler für falschen/abgelaufenen Code, Ratenlimit,
  Nummernkonflikt, Sitzung und Netz;
- Telefonnummer ist bereits als optional, nutzergebunden, nicht für Tracking
  und für Kontosicherheit offengelegt.

## Offene Gates vor Aktivierung

| Gate | Status |
|---|---|
| Firebase Authentication | initialisiert; kein Anbieter aktiviert |
| Firebase-Provider `Phone` und sichtbare Bedingungen | ausdrückliche Zustimmung und Aktivierung offen |
| Zulässige SMS-Regionen | Deutschland-only für den Pilot empfohlen; Zustimmung und Speichern offen |
| Android-Appprüfung, SHA-Zuordnung und Nachfolger-Build | SHA-1 und SHA-256 registriert; Nachfolger-Build und realer Nachweis offen |
| echter Android-SMS-Test | offen |
| Apple-Mitgliedschaft, APNs und iOS-Appprüfung | offen |
| echter iOS-SMS-Test | offen |
| Datenschutz-/Service-Provider-Einordnung für den Nachfolger | offen |
| Missbrauchs-, Quota- und Ratenlimitbeobachtung auf Staging | offen |

Solange auch nur ein Gate offen ist, bleiben `activationAllowed=false`,
`storeSubmissionAllowed=false` und die Servervariable `false`.

Die Deutschland-only-Empfehlung folgt dem verbindlichen lokalen Pilot mit
einer einzigen Startzone. Sie ist noch keine gespeicherte Konsolenentscheidung.
Eine breitere SMS-Freigabe würde Missbrauchs- und Kostenfläche ohne Nutzen für
den ersten Pilot vergrößern. Für neue Firebase-Projekte erlaubt die
Standard-SMS-Regionsrichtlinie keine Region; deshalb darf der Anbieter erst
nach bewusster Auswahl aktiviert werden.

## Offizielle technische Grundlagen

- <https://firebase.google.com/docs/auth/flutter/phone-auth>
- <https://firebase.google.com/docs/auth/web/phone-auth>
- <https://firebase.google.com/docs/auth/admin/verify-id-tokens>
- <https://firebase.google.com/docs/auth/admin/manage-users>
- <https://firebase.google.com/docs/auth/android/phone-auth>
- <https://firebase.google.com/docs/android/play-data-disclosure>

Firebase weist insbesondere darauf hin, Nutzer vor dem SMS-Flow über die
Übertragung ihrer Telefonnummer und deren Verwendung zur Spam-/Missbrauchs-
abwehr zu informieren. Diese Einwilligungsoberfläche ist Bestandteil der
Implementierung, ersetzt aber nicht die ausstehende rechtliche Freigabe.
