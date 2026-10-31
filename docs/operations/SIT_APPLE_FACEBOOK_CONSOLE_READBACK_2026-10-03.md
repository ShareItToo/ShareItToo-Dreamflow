# Apple/Facebook — sanitisiertes Read-only-Consoleinventar

Stand: 2026-10-03. Ausgang: Gap-Map in Commit `678b84b3527829eae0ceb7c013e7cfc3094d024f`; lokaler HEAD zu Beginn identisch. Projekt: ShareItToo, Staging Web/Privatpilot. Nur vorhandenes Chrome-Browserprofil verwendet; keine andere Kontositzung angelegt.

RESULT: **BLOCKED vor authentifiziertem Consolezugriff.** Die Anmeldegrenzen sind direkt in offizieller UI beobachtet. Kein Provider-/App-/Domain-/Callback-/Audiencezustand wurde als bestätigt ausgegeben. Kein Login, Passwort, Passkey, 2FA oder Formularsubmit ausgeführt.

## Providerweise Readback

| Prüffeld | Apple | Facebook / Meta |
| --- | --- | --- |
| Offizielle Einstiegsseite erreicht | Ja: [Apple Developer Account](https://developer.apple.com/account/) | Ja: [Meta Developer Apps](https://developers.facebook.com/apps/) |
| Authentifizierte bestehende Console zugänglich | Nein im geprüften Browserzustand: Weiterleitung zu „Sign in to Apple Developer“ | Nein im geprüften Browserzustand: Weiterleitung zu „Log into Meta for Developers“ |
| Richtiges Konto / Team verifiziert | NOT VERIFIED | NOT VERIFIED |
| Bestehende SIT-App / Identifier sichtbar | NOT VERIFIED — keine App-/Identifierliste zugänglich | NOT VERIFIED — keine Appübersicht zugänglich |
| Firebase-Providerbeziehung discoverable | NOT VERIFIED, unabhängige Firebaseprüfung ebenfalls an Anmeldung blockiert | NOT VERIFIED, unabhängige Firebaseprüfung ebenfalls an Anmeldung blockiert |
| Callback-/Domaingleichheit | NOT VERIFIED, keine tatsächlichen Werte gelesen | NOT VERIFIED, keine tatsächlichen Werte gelesen |
| App-/Tester-/Audience-Modus | NOT VERIFIED | NOT VERIFIED |
| Präziser Blocker | Apple-Anmeldung verlangt Kontokennung oder Passkey; ob danach 2FA verlangt wird, ist unbekannt | Meta bietet bestehende Facebook-Anmeldung oder Managed-Meta-Anmeldung; welche Identität zur SIT-App berechtigt ist, ist unbekannt |

Apple zeigte ein leeres Eingabefeld und deaktiviertes „Continue“ sowie Passkeyoption. Meta zeigte Anmeldeoptionen, Accountanlage und einen Cookiehinweis. Keine dieser Aktionen wurde ausgelöst; insbesondere keine Accountanlage und keine Änderung der Cookieauswahl.

## Unabhängige Firebaseprüfung

[Firebase Console](https://console.firebase.google.com/) ausschließlich zur möglichen Apple-/Facebook-Zuordnung geöffnet. Die UI zeigte einen Kontoauswahldialog mit ausdrücklich **„Signed out“**, keine Projektübersicht. Keine Kontokennung, kein Account-/Sessionlocator und keine Redirectparameter in dieses Dokument übernommen. Kein Konto ausgewählt, keine Anmeldung durchgeführt; Google-Provider- und Geminioberflächen nicht angefasst.

Diese Beobachtung beweist nur, dass in diesem Browserzustand kein Consolezugriff verfügbar war. Sie beweist weder das Fehlen eines Firebaseprojekts noch fehlende Apple-/Meta-Apps, falsche Callbacks, gesperrte Tester oder nicht vorhandene Berechtigungen. Eine bestehende Sitzung in einem anderen Gerät/Profil wurde nicht behauptet oder gesucht.

## Browser- und Änderungsgrenze

- Die drei Prüftabs wurden neu im bestehenden Browserprofil geöffnet; vorhandene Nutzer-/Geminitabs blieben unverändert.
- Apple-/Meta-Anmeldeseiten bleiben als Übergabepunkte für eine spätere Anmeldung erhalten. Der lediglich diagnostische Firebase-Tab wird geschlossen; kein Browserlogout oder Kontowechsel.
- Keine Secretanzeigen, IDs, Token, Cookies, Rohscreenshots oder Accountdaten gespeichert/kopiert. Das Artefakt enthält nur öffentliche Einstiegspfade und Beobachtungsstatus.
- Keine erneute Sourceregression nötig: nur diese neue Readbackdatei. Whitespace-/Secret-/Locatorcheck und Repo-Status kontrolliert; fremde Capsule und alle bisherigen Artefakte unverändert.

## Kleinster nächster Schritt

Die berechtigte Person meldet sich an den vorhandenen Apple-/Meta-Entwicklerkonten an und erledigt nur eventuell nötige 2FA. Keine neue App/Services ID, kein Testerkonto, keine Aktivierung und keine Callbackänderung. Für den unabhängigen Abgleich muss außerdem eine vorhandene berechtigte Firebase-Console-Sitzung verfügbar sein; dies ist keine Google-Provideränderung.

Danach kann dasselbe Read-only-Inventar ohne weitere Kontextsuche fortgesetzt werden: Konto/Team → vorhandene SIT-App/Services ID → Firebaseproviderbeziehung → exakte Callback-/Domaingleichheit → Pilot-Audience/Accesslevel. Nur Booleans/Status zurückgeben, keine Identifier/Secrets exportieren. Fehlender Zugang oder eine zusätzliche Verifikationsanforderung bleibt ein enger Blocker. Die in der Gap-Map belegten fehlenden Webpfade und Staging-Registrierungslanes werden dadurch nicht automatisch erledigt.

CHANGED: nur diese Datei. BLOCKER: keine nutzbare authentifizierte Console-Sitzung im geprüften Browser. NEXT: bestehende berechtigte Sitzungen bereitstellen, dann read-only fortsetzen. Kein Commit/Push.
