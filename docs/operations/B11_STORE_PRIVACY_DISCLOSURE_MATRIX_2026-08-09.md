# B11 – Datenschutz-Matrix für Google Play und Apple App Store

Stand: 9. August 2026  
Status: codebasierter Arbeitsentwurf; Store-Antworten erst nach finalem Binärscan absenden

## 1. Bewertungsgrundlage

Diese Matrix bildet die Datentypen des aktuellen ShareItToo-Clients,
Backends und der für den ersten Store-Build vorgesehenen SDKs ab. Sie ist
bewusst konservativ: Ein Datentyp wird eher deklariert als verschwiegen, wenn
er vom Gerät an das Backend oder an einen eingebundenen Dienst übertragen und
dort länger als für die unmittelbare Anfrage benötigt gespeichert wird.

Maßgebliche technische Grundlage:

- Konto, Profil, Sitzungen, Identitäten, Buchungen und Zahlungsereignisse;
- Inserate, Verfügbarkeit, Preise und Standorte; keine Kaution;
- Nachrichten, Bildanhänge, Bewertungen, Meldungen und Streitfälle;
- Push-Registrierungen, Benachrichtigungseinstellungen und -historie;
- Audit-, IP-, User-Agent- und Sicherheitsinformationen;
- Firebase Authentication für Google-, Apple- und Facebook-Anmeldung,
  Firebase Cloud Messaging, Crashlytics und die Google-Maps-Platform-
  Webservices im Release-Build;
- kein Firebase Analytics, kein Werbe-SDK und kein ATT-Tracking;
- lokaler App-Zustand in SharedPreferences;
- Stripe-hosted payment data nur im später freigegebenen Test-/Livepfad.

Die Matrix ersetzt keine Datenschutzerklärung und keine Prüfung der Verträge
mit Hosting-, Mail-, Firebase-, Apple-, Google- und Zahlungsdienstleistern.

## 2. Globale Antworten

| Store-Frage | Arbeitsantwort | Begründung/Restprüfung |
|---|---|---|
| Sammelt die App Nutzerdaten? | Ja | mehrere Kernfunktionen übertragen und speichern Daten serverseitig |
| Übermittelt sie Daten an notwendige Auftrags-/Serviceanbieter? | Ja | Hosting, Mail, Firebase/Push und später Stripe; Verträge und Datenflüsse final prüfen |
| Google-Play-Frage „Data shared“ | vorläufig nein, sofern jeder Empfänger nachweislich nur als Service Provider im Auftrag und nach Weisung handelt | Googles Service-Provider-Ausnahme je Empfänger/Vertrag bestätigen; andernfalls den betroffenen Datentyp als shared markieren |
| Werden Daten verkauft? | Nein | kein Verkauf und keine Werbenetzwerke im Code |
| Werden Daten für Tracking verwendet? | Nein | kein Werbe-Tracking, keine Datenbroker, kein ATT-Zweck |
| Enthält die App Werbung? | Nein | kein Anzeigen-SDK im finalen Abhängigkeitsstand erwartet |
| Sind Daten bei Übertragung verschlüsselt? | Ja | öffentliche API ausschließlich über HTTPS/TLS; finaler Store-Build erneut prüfen |
| Kann der Nutzer Löschung beantragen? | Ja, in der App und technisch auf Staging im Web | öffentliche Produktions-Lösch-URL ist vor Einreichung Pflicht |
| Kann der Nutzer Daten exportieren? | Ja | serverseitiger datensparsamer Export ist vorhanden und getestet |
| Sind alle Daten optional? | Nein | Konto-, Sicherheits- und Buchungsdaten sind für die jeweiligen Kernfunktionen erforderlich |
| Sind Berechtigungen kontextbezogen? | Ja | Kamera, Medien, Standort und Push werden im jeweiligen Funktionsweg benötigt; reale Geräteprüfung offen |

## 3. Datenarten und geplante Store-Deklaration

Legende: **erforderlich** bedeutet für Konto oder die gewählte Kernfunktion
notwendig; **optional** bedeutet nur bei einer ausdrücklich gewählten Funktion
oder optionalen Profilangabe. „Verknüpft“ bezieht sich auf Apple und bedeutet,
dass der Datentyp einem Konto, einer Installation oder Buchung zugeordnet
werden kann.

| Produktdaten | Google-Play-Datentyp | Apple-Datentyp | Erhebung | Verknüpft | Zweck | Typische Empfänger/Prüfung |
|---|---|---|---|---|---|---|
| Anzeigename/Profilname | Personal info: Name | Contact Info: Name | erforderlich fürs sichtbare Profil | ja | App-Funktion, Kontoverwaltung, Sicherheit/Moderation | ShareItToo-Backend/Hosting |
| E-Mail | Personal info: Email address | Contact Info: Email Address | erforderlich | ja | Anmeldung, Verifizierung, Kontoverwaltung, Transaktionskommunikation, Sicherheit | Backend, Firebase Authentication und gewählter Google-/Apple-/Facebook-Anbieter, Transaktionsmail-Dienst; Verträge final prüfen |
| Telefonnummer | Personal info: Phone number | Contact Info: Phone Number | optional, solange kein verifizierter Pflichtflow aktiviert ist | ja | Kontakt/Übergabe, Kontoverwaltung, Sicherheit | Backend; Firebase Authentication im Nachfolger technisch vorbereitet, aber Provider, Datenschutz- und echte Gerätetests vor Aktivierung offen |
| Profilbild und Profilbeschreibung | Photos and videos / Other user-generated content | Photos or Videos / Other User Content | optional | ja | Profil und Vertrauen | Backend/Objektspeicher |
| Stadt, Inserat-/Übergabe-/Abholadresse | Personal info: Address plus Location | Contact Info: Physical Address plus Location | erforderlich für gewählten Inserat-/Buchungsflow | ja | Suche, Distanz, Buchung, Übergabe | Backend; öffentliche Ausgabe nur abgerundet, genaue Adresse rollen-/zeitgebunden prüfen |
| Gerätestandort grob | Location: Approximate location | Coarse Location | optional/funktionsbezogen | ja | lokale Suche, Vorschläge | Backend, nur wenn abgeleiteter Wert übertragen/gespeichert wird |
| Gerätestandort präzise | Location: Precise location | Precise Location | optional/funktionsbezogen | ja | optionale Standortfreigabe, Übergabe-/Rückgabeprüfung | Backend; Laufzeitdialog, Speicherform und Löschung real prüfen |
| Inserattext, Titel, Beschreibung, Preis, Verfügbarkeit | Other user-generated content | Other User Content | erforderlich für Vermieterfunktion | ja | Marktplatz, Suche, Buchung | Backend/Hosting |
| Inserat-, Chat-, Melde- und Übergabebilder/-videos | Photos and videos | Photos or Videos | optional je Upload, für einzelne Nachweisflows funktional erforderlich | ja | Inserat, Kommunikation, Übergabe, Support, Moderation | Backend/Objektspeicher; Metadatenbereinigung prüfen |
| Chatnachrichten | Messages | Emails or Text Messages | erforderlich für Chatfunktion | ja | Buchungsabstimmung, Support, Sicherheit/Moderation | Backend/Hosting |
| Bewertungen, Meldungen, Blockierungen, Support-/Streitfalltexte | Other user-generated content | Customer Support / Other User Content | optional oder ereignisbezogen | ja | Vertrauen, Support, Missbrauchsbekämpfung | Backend, berechtigte Support-/Adminrollen |
| Buchungszeitraum, Status, Beträge, Gebühren, Refund/Payout-Status | Purchase history | Purchases: Purchase History | erforderlich für Buchung | ja | Buchungs- und Zahlungsabwicklung, Belege, Sicherheit/Compliance | Backend; später Stripe als Zahlungsdienstleister |
| Kartennummer, Bankkonto, vollständige Zahlungsmethode | Financial info: Payment info | Financial Info: Payment Info | **nicht durch ShareItToo erheben**, sofern Stripe-hosted Eingabe und kein Entwicklerzugriff | nicht anwendbar | Zahlungsabwicklung beim Provider | vor Stripe-Aktivierung durch Netzwerk-/SDK-Test bestätigen; sonst Matrix ändern |
| Konto-ID | User IDs | Identifiers: User ID | erforderlich | ja | Konto, Berechtigung, Buchung, Support, Sicherheit | Backend |
| Externe Anbieterkennung | User IDs | Identifiers: User ID | optional bei Social Login | ja | Anmeldung, Kontoverknüpfung, Betrugsprävention | Firebase Authentication und ausdrücklich gewählter Google-/Apple-/Facebook-Anbieter; keine Provider-Zugriffstoken im SIT-Backend |
| FCM-/APNs-Token und Firebase Installation ID | Device or other IDs | Identifiers: Device ID | optional nach Push-Einwilligung, technisch für Push erforderlich | ja zur Installation und serverseitig zum Konto | Benachrichtigungen, Sicherheit | Firebase/Google, Apple Push, Backend |
| IP-Adresse, User-Agent, Sitzungs-/Gerätelabel | Device or other IDs / Other data depending on Play form | Identifiers: Device ID oder Diagnostics entsprechend finaler Verwendung | automatisch bei Konto-/API-Nutzung | ja zur Sitzung/Konto | Authentifizierung, Betrugsprävention, Sicherheit, Betrieb | Backend/Hosting; keine Werbenutzung |
| App-/Sicherheits-Auditereignisse | App activity: App interactions / Other actions | Usage Data: Other Usage Data | automatisch bei sicherheits- oder geschäftsrelevanten Aktionen | ja | Sicherheit, Compliance, Support, Fehleranalyse | Backend; keine allgemeine Marketinganalyse |
| Benachrichtigungseinstellungen/-historie | App activity / Other user-generated content je Play-Form | Other Usage Data | erforderlich für gewählte Benachrichtigungen | ja | App-Funktion, Nutzersteuerung, Zustellnachweis | Backend und lokal |
| Crash-Stacktrace und App-Zustand | App performance: Crash logs | Diagnostics: Crash Data | automatisch nur Release mit aktivem Crashlytics | zur Installation; kein bewusster ShareItToo-User-ID-Zusatz | Stabilität, Fehlerbehebung | Firebase Crashlytics; 90-Tage-Firebase-Retention laut Anbieter prüfen |
| Geräte-/OS-/App-Metadaten bei Crash oder Push | App performance / Device or other IDs | Diagnostics / Device ID | automatisch bei aktivem FCM/Crashlytics | zur Installation | Pushzustellung, Stabilität | Firebase/Google; finales SDK-Verhalten erneut abgleichen |
| Suchbegriffe | Search history | Search History | derzeit nicht dauerhaft gespeichert | nein | unmittelbare Suchanfrage | **nicht deklarieren**, solange Logs/Backend keine Suchhistorie speichern; final verifizieren |
| Lokale Einstellungen, Cache und Sitzung | nur On-device, solange nicht übertragen | nur On-device, solange nicht übertragen | lokal | lokal | App-Funktion | nicht als Collection deklarieren; synchronisierte Teilmengen sind oben erfasst |

## 4. Google-Play-Data-Safety-Arbeitsantworten

Für jeden oben als erhoben markierten Datentyp wird im Play-Formular einzeln
geprüft:

1. **Collected:** ja, wenn der finale Build ihn vom Gerät überträgt und
   serverseitig oder beim SDK-Anbieter länger als die unmittelbare Anfrage
   speichert.
2. **Shared:** vorläufig nein für reine Auftrags-/Serviceanbieter. Sobald ein
   Empfänger nicht eindeutig im Auftrag und nach ShareItToo-Weisung handelt,
   wird der betroffene Datentyp konservativ als shared markiert. Vertrag und
   konkrete Datenpraxis sind vor Abgabe je Anbieter zu prüfen.
3. **Ephemeral:** nein für Konten, Buchungen, Nachrichten, Medien, Audit,
   Push-IDs und Crashdaten; nur echte kurzfristige Verarbeitung darf anders
   markiert werden.
4. **Required/optional:** Konto/E-Mail und Sicherheitsdaten sind erforderlich;
   Profilzusätze, Uploads, Standort, Push und Supportdaten sind abhängig vom
   jeweils gewählten Feature optional. Buchungsdaten sind für eine Buchung
   erforderlich.
5. **Purposes:** App functionality, Account management und Fraud prevention,
   security and compliance. Developer communications nur für transaktionale
   Benachrichtigungen; nicht „Advertising or marketing“ auswählen.
6. **Analytics:** nur Crash-/Leistungsdiagnose entsprechend Googles konkreter
   Formularlogik auswählen. Es gibt kein Firebase Analytics und keine
   Produktmarketinganalyse.
7. **Deletion:** ja, aber erst absenden, wenn In-App-Löschung und öffentliche
   Produktions-Löschseite aus dem finalen Store-Build nachgewiesen sind.

Nicht auswählen: **Files and docs**. Alle serverseitigen Uploads des Kandidaten
2026081303 akzeptieren ausschließlich JPEG, PNG oder WebP; Chat, Inserate,
Meldungen sowie Übergabe/Rückgabe bieten nur Bildauswahl. Lokal erzeugte
Rechnungs-PDFs werden auf Nutzerwunsch heruntergeladen, aber nicht von der App
erhoben oder an ShareItToo übertragen. Video- und Audio-Uploads sind ebenfalls
nicht Teil dieses Kandidaten.

Google verlangt die Data-Safety-Erklärung auch für Closed/Open/Production;
ein ausschließlich interner Track ist ausgenommen. ShareItToo bereitet die
vollständige Erklärung trotzdem vor, weil B11 in einen geschlossenen Test und
späteren Pilot übergeht.

## 5. Apple-App-Privacy-Arbeitsantworten

- Alle oben als erhoben markierten Daten werden als **Data Linked to You**
  behandelt, wenn sie Konto, Buchung, Nachricht, Installation oder Gerät
  zugeordnet werden können.
- **Data Used to Track You:** nein für sämtliche Typen.
- Hauptzweck: **App Functionality**. Für Sicherheits-/Betriebsdaten ebenfalls
  App Functionality; Apple schließt Betrugsprävention, Sicherheit, Stabilität
  und Support in diese Zweckdefinition ein.
- **Product Personalization** nur dann auswählen, wenn der finale Release
  tatsächlich personalisierte Ergebnisse aus Nutzerdaten erzeugt. Eine bloße
  Nutzersuche nach Ort/Filter reicht nicht automatisch als dauerhafte
  Profilpersonalisierung.
- **Analytics** für Crash Data und zugehörige Diagnostik, nicht für allgemeine
  Nutzungsdaten, solange kein Analytics-SDK oder entsprechender Zweck aktiv ist.
- **Payment Info** nicht auswählen, wenn Zahlungsdaten ausschließlich in einer
  Stripe-hosted Oberfläche eingegeben werden und ShareItToo niemals Zugriff
  darauf erhält. Buchungs-/Transaktionshistorie bleibt als Purchase History
  deklariert.
- Private In-App-Nachrichten sind nach Apples ausdrücklicher Anleitung als
  Emails or Text Messages zu deklarieren.
- Wenn präzise Position sofort technisch und dauerhaft auf grobe Koordinaten
  reduziert wird, kann nur Coarse Location passen. Die aktuellen optionalen
  Standortfreigabe-/Übergabefunktionen erfordern bis zum Gegenbeweis jedoch
  die konservative Deklaration von Precise Location.

## 6. SDK-spezifische Pflichtprüfung

Vor jedem Store-Upload wird aus dem finalen AAB/IPA beziehungsweise dessen
Lockfiles und Privacy Manifests geprüft:

- Firebase Core, Messaging, Installations, Sessions und Crashlytics;
- Google Maps Platform für adressbezogene Autovervollständigung,
  Ortsauflösung und Kartenbilder; eingegebene Adresse sowie Standortbezug als
  Datenfluss zum Serviceanbieter berücksichtigen;
- Anwendungs- und API-Beschränkungen des im Client technisch notwendigen
  Google-Maps-Schlüssels in der Google-Cloud-Konsole nachweisen, ohne den
  Schlüssel in Evidenz oder Store-Unterlagen zu kopieren;
- keine unbeabsichtigte Firebase-Analytics-, Performance-, AdMob- oder
  Advertising-ID-Abhängigkeit;
- FCM erfasst Installations-/Push-IDs und Geräte-/App-Metadaten;
- Crashlytics erfasst Crash-Stacktraces, relevanten App-Zustand, Geräte-/OS-
  Informationen und Installationskennungen;
- ShareItToo setzt keinen freien User-Identifier, keine E-Mail und keine
  Nachrichten-, Adress-, Token- oder Zahlungswerte in Crash-Berichte;
- Apple Privacy Manifests der eingebundenen SDKs sind vorhanden und aktuell;
- Google-Play-SDK-Index-Warnungen sind geprüft und dokumentiert.

Firebase Analytics bleibt ausgeschlossen. Wird später ein Analytics-,
  Attribution-, Werbe-, weitere Karten-, Identitäts- oder KYC-SDK ergänzt, ist diese
Matrix vor dem nächsten Build vollständig neu zu bewerten.

## 7. Offene Datenschutz-/Rechtsgates

1. Anbieter/Verantwortlicher, Gesellschaftsform und ladungsfähige Anschrift
   fachlich bestätigen.
2. Support- und Datenschutzkontakt festlegen und Zustellung testen.
3. Auftragsverarbeiter, Standorte, Drittlandtransfermechanismen und
   Lösch-/Aufbewahrungsfristen je Datengruppe final dokumentieren.
4. Finale AGB, Datenschutzerklärung, Storno-/Refundlogik, die verbindliche
   Regel „keine Kaution/kein Schutz“ und Nutzerinhaltsregeln veröffentlichen.
5. Einwilligungs-/Rechtsgrundlage für optionale Standort-, Medien-, Push- und
   Crash-Diagnostik festlegen; Laufzeittexte angleichen.
6. Produktions-Löschseite mit verständlichem Umfang und Identitätsprüfung
   bereitstellen; kein reines Freeze/Deaktivieren als Löschung ausgeben.
7. Stripe-Datenfluss und Webhooks im Testmodus prüfen, bevor Payment Info im
   Store final beantwortet wird.
8. Store-Formulare erst absenden, nachdem exakt der hochgeladene Binärbuild
   gegen diese Matrix verglichen wurde.

### 7.1 Technische Aufbewahrungs- und Löschbereitschaft

Der maschinenlesbare Entwurf `store/retention-deletion-readiness.json` bindet
den Löschumfang an die tatsächlichen Backend-, Datenbank-, Backup- und
App-Quellen. Die Kontolöschung anonymisiert die Nutzeridentität, widerruft
Zugangsdaten und entfernt oder bereinigt direkte Inhalte sowie verbleibende
Benachrichtigungsdaten, Lesestatus, Blockbeziehungen und Push-Payloads. Eine
PostgreSQL-Integrationsprüfung deckt diese Restdaten explizit ab.

Technisch erhalten bleiben nur die ausgewiesenen pseudonymen Buchungs-,
Finanz-, Zustell- und Auditnachweise. Deren konkrete Rechtsfristen sind noch
nicht festgelegt. Ebenfalls offen bleiben der allgemeine Kategorien-Purge,
abgelaufene Datenbankzeilen, Legal Hold, kontospezifische Löschung aus bereits
erzeugten Backups sowie die durch den Betreiber bestätigte Aufbewahrung/Löschung
bei Firebase und Google Maps. Die offiziellen Anbieterinformationen wurden
inzwischen in
`docs/evidence/b11/privacy-provider-retention-sources-20260812.json` geprüft;
Vertragseinstellungen, Löschverfahren und Rechtsfreigabe bleiben offen. Die
vorhandene Backup-Rotation löscht betriebliche Sicherungen nach 14 Tagen; das
ist keine bereits freigegebene Rechtsfrist. Das zugehörige, bewusst noch nicht
freigegebene Entscheidungsblatt ist
`docs/operations/B11_LEGAL_PRIVACY_OWNER_DECISION_PACKET_2026-08-12.md`.

Der Validator akzeptiert diesen ehrlichen Entwurf, verweigert jedoch
`--require-approved`, solange die neun Eigentümer-/Rechtsentscheidungen und
der gekoppelte Datenschutz-Gate offen sind. Dadurch können erfundene Fristen
oder bloßes Umschalten eines Store-Gates keine Freigabe erzeugen.

## 8. Verifikation und Nachweis

Der exakte Android-Kandidat 1.0.0 (2026081201) ist an App-Commit
`c6ec80002cf664f513afc768c1b643ac0d1d19fb` und die kanonisch geprüften AAB-,
APK-, Signatur- und Datenschutzberichte gebunden. Das Release-Manifest
deaktiviert Backup, Geräteübertragung, Klartextverkehr und Legacy-Speichermodus;
alte Speicherberechtigungen sind auf die dokumentierten älteren API-Stufen
begrenzt. Der finale Android-Binärscan bestätigt die erwarteten
Firebase-Messaging-/Crashlytics-Komponenten, den aktivierten Google-Maps-
Dienst, kein Analytics-/Werbe-SDK, keine aktive KI-Verbindung und keine
bekannten Platzhalter-, direkten OpenAI- oder lokalen Laufzeitursprünge. Die
Maps-Anwendungs-/API-Beschränkung bleibt ein offener Console-Nachweis.

Firebase ist auf genau diesem Kandidaten konfiguriert. Kontrolliertes
Staging-FCM ist auf dem physischen Pixel 7 Pro unter Android 16 im Vordergrund,
im Hintergrund und bei zuvor beendetem App-Prozess bestanden. Ebenso bestanden
sind die angemeldete Kaltstartsitzung ohne Internet, die direkte
Gast-App-Link-Diagnose sowie Abmeldung, Gastzustand nach Kaltstart und
Push-Unterdrückung nach Abmeldung. Auch die kontrollierte
Offline-/Realtime-Wiederherstellung desselben laufenden Chat-Prozesses ist nach
15 Sekunden ohne Netz und anschließender Wiederherstellung bestanden.
Die authentifizierten Links zu Angebot, abgeschlossener Buchung und gemeinsamem
Chat sind in einer isolierten Zwei-Rollen-Prüfung ebenfalls bestanden; das
geschützte Prüfkonto und seine aktive Buchung wurden danach vollständig
wiederhergestellt. Store-Installation und die vollständige
Geräte-/Accessibility-Matrix bleiben offen. Der aktuelle
maschinenlesbare Datenschutzentwurf liegt in
`store/privacy-disclosures.json`; er bindet 17 bewertete Datentypen (16 davon
tatsächlich erhoben), neun Dienste,
Quellhashes und den erneuerten Binärscan an denselben Kandidaten. Die
Original-R8-Zuordnung des exakten AAB wurde erfolgreich zu Crashlytics
übertragen; die drei nativen Symbolgruppen sind vollständig im AAB und im
privaten Release-Archiv gebunden und wurden als erzeugte Breakpad-Symbole
erfolgreich zu Crashlytics übertragen. Die lesende Konsolenprüfung zeigt als
neuesten Release weiterhin einen älteren Build; Ausgabezahlen wurden nicht als
Kandidatennachweis verwendet. Die exakte Konsolenzuordnung und ein bereinigtes
Testereignis sind für diesen Kandidaten
noch nicht final nachgewiesen. Die bereinigten
Kandidatennachweise liegen unter `docs/evidence/b11/`.

Der ergänzende Aufbewahrungs-/Löschentwurf liegt in
`store/retention-deletion-readiness.json`. Er ist fail-closed, enthält keine
Kontodaten oder Zugangsdaten, prüft die offiziellen Anbieterquellen inhaltlich
und wird im Release-Preflight immer geprüft. Die erweiterte öffentliche
Datenschutzfassung ist technisch vorbereitet, bleibt aber vor Anbieter-,
Aufbewahrungs- und Rechtsfreigabe weiter gesperrt.

Dies ist noch nicht der abschließende plattformübergreifende Store-Nachweis:
Ein IPA liegt nicht vor, Xcode und Apple-Developer-Zugang fehlen, die gezählte
WLAN-/Hotspot-/TalkBack-/VoiceOver-Matrix ist offen und die Google-/Apple-
Datenschutzformulare wurden nicht abgesendet. Öffentliche Support-, Datenschutz-
und Löschseiten bleiben bis zur fachlichen Freigabe ebenfalls offene Gates.

Der abschließende Datenschutz-Nachweis enthält mindestens:

- Paket/Bundle ID, Version, Buildnummer, Commit und Artefakthash;
- finale Abhängigkeitsliste und SDK-/Privacy-Manifest-Scan;
- Netzwerkbeobachtung für Registrierung, Login, Inserat, Standort, Medien,
  Buchung, Zahlungstest, Chat, Push, Export und Löschung;
- Datenbank-/Objektspeicher-Stichprobe nur mit synthetischen Konten;
- bestätigte öffentliche Datenschutz-, Support- und Lösch-URLs;
- Screenshots der gespeicherten Google- und Apple-Datenschutzantworten;
- Bestätigung, dass keine Secrets oder privaten Testdaten in der Evidenz liegen.

## 9. Offizielle Referenzen

- [Google Play: Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play: Nutzer- und sensible Daten](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Google Play: Kontolöschung](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Apple: App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Firebase für Apple: Store-Datenerklärung](https://firebase.google.com/docs/ios/app-store-data-collection)
- [Firebase für Android: Play-Datenerklärung](https://firebase.google.com/docs/android/play-data-disclosure)
- [Firebase: Datenschutz und Aufbewahrung](https://firebase.google.com/support/privacy)
