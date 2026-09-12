# B11 – Entscheidungsblatt Recht, Datenschutz und Aufbewahrung

Stand: 12.08.2026
Status: **Entwurf / nicht zur Veröffentlichung freigegeben**

## Zweck und Freigabegrenze

Dieses Blatt trennt den technisch belegten Ist-Zustand von Entscheidungen, die der Anbieter beziehungsweise eine rechtliche Prüfung bestätigen muss. Es ersetzt keine Rechtsberatung. Solange die offenen Entscheidungen nicht mit Nachweis geschlossen sind, bleiben die öffentlichen Datenschutz- und Rechtstexte gesperrt, die Store-Formulare im Entwurf und ein Store-Rollout ausgeschlossen.

## Technisch belegter Ist-Zustand

| Bereich | Belegter Kandidatenstand | Grenze |
|---|---|---|
| Kontolöschung | In-App-Löschweg und öffentliche Löschseite sind implementiert; aktive Zugangsdaten und Zustellkennungen werden widerrufen beziehungsweise entfernt. | Offene Buchungen, Auszahlungen oder Streitfälle können einen Abschluss vor der Löschung erfordern. |
| Kontoinhalte | Direkte Konto-, Kontakt-, Geräte- und Inhaltsdaten werden gelöscht, bereinigt oder anonymisiert; bestimmte Buchungs-, Sicherheits- und Zustellnachweise bleiben pseudonymisiert. | Die zulässigen Fristen dieser verbleibenden Kategorien sind noch nicht freigegeben. |
| Sicherungen | Operative Sicherungen rotieren nach dem beobachteten Betriebsvertrag innerhalb von 14 Tagen. | Eine einzelne Person kann nicht aus bereits erzeugten Sicherungen herausgelöscht werden. |
| Push | Firebase Cloud Messaging verarbeitet eine Installationskennung. Nach einer Löschanforderung nennt Firebase bis zu 180 Tage bis zur Entfernung aus Live- und Sicherungssystemen. | Betreiberbestätigung des Verfahrens und rechtliche Freigabe sind offen. |
| Crashdiagnose | Crashlytics verarbeitet Installations-/Sitzungskennungen, Geräte-, App-, Crash- und Diagnosedaten; Firebase nennt 90 Tage Aufbewahrung, bevor die Entfernung beginnt. | Betreiberbestätigung und rechtliche Freigabe sind offen. |
| Karten/Standort | Adresssuche nutzt Google Maps Platform. Präziser Gerätestandort wird nur nach ausdrücklichem Start der Prüfung angefragt; keine dauerhafte Hintergrund- oder Live-Ortung. | Google veröffentlicht für Plattformprotokolle keine einheitliche feste Frist; Betreiber- und Rechtsentscheidung bleiben offen. |
| Zahlungen | Im aktuellen Store-Kandidaten ist keine Echtgeld-Übertragung an Stripe aktiviert. | Vor einer Aktivierung müssen Zahlungsfluss, Verantwortlichkeiten, Store-Angaben und Texte neu geprüft werden. |
| Werbung | Der aktuelle Store-Kandidat enthält keine Werbung und kein Werbetracking. | Eine spätere Aktivierung erfordert eine neue Datenschutz- und Store-Prüfung. |

## Entscheidungen, die der Anbieter bestätigen muss

Die folgenden Werte sind **Vorschläge, keine Freigaben**. Ein Wert wird erst in die verbindlichen Manifeste übernommen, wenn die verantwortliche Person ihn bestätigt und – wo nötig – rechtlich prüfen lässt.

### 1. Anbieterkennzeichnung

Benötigt werden:

- exakter rechtlicher Name beziehungsweise Rechtsform des tatsächlichen Anbieters;
- ladungsfähige Anschrift, die öffentlich erscheinen darf;
- vertretungsberechtigte Person, soweit erforderlich;
- öffentliche geschäftliche Kontaktwege;
- verantwortliche Person für redaktionelle Inhalte, falls anwendbar;
- Bestätigung, ob die derzeit in der App angezeigte Gesellschaft und Anschrift tatsächlich bestehen und verwendet werden dürfen.

**Release-Regel:** Keine Anbieterangabe wird aus einem App-Entwurf als rechtlich bestätigt übernommen.

### 2. Urheber- und Markeninhaber

Benötigt werden:

- Rechteinhaber an Name, Logo, App-Texten, Bildern und Store-Material;
- Bestätigung, dass verwendete Beispielbilder und Testinhalte nicht in den öffentlichen Store- oder Produktionsbestand gelangen;
- dokumentierter Umgang mit Meldungen zu fremden Inhalten.

### 3. Aufbewahrung und Löschung

| Kategorie | Technischer Vorschlag | Noch zu bestätigen |
|---|---|---|
| Inaktive Konten | Erinnerungs- und Löschprozess nach einer festgelegten Inaktivitätsdauer | Dauer, Vorwarnung, Ausnahmen |
| Buchungs-/Transaktionsnachweise | Nur erforderliche pseudonymisierte Nachweise; gesetzliche Fristen getrennt nach Dokumenttyp anwenden | Steuer-/handelsrechtliche Einordnung und genaue Fristen |
| Kommunikation | Zweckgebundene Frist nach Ende der Buchung oder des Vorgangs | Frist, Streitfall-Ausnahme |
| Moderationsnachweise | Begrenzte Aufbewahrung für Missbrauchsabwehr und Rechtsverteidigung | Frist, Zugriff, Eskalation |
| Sicherheits-/Auditprotokolle | Begrenzte, dokumentierte Sicherheitsfrist | Frist und Löschlauf |
| Abgelaufene Zugangsdaten | Automatischer technischer Bereinigungslauf | Frist und Betriebsnachweis |
| Sicherungen | 14 Tage gemäß beobachtetem Betriebsvertrag | Formelle Betreiberfreigabe |
| Externe Dienste | Firebase-/Google-Grenzen ausdrücklich berücksichtigen | Vertrags-/Kontoeinstellungen und Rechtsprüfung |
| Rechtliche Sperre | Nur dokumentierte, eng begrenzte Sperre mit Verantwortlichem und Enddatum | Verfahren und Freigabeberechtigte |

### 4. Google Maps und externe Dienstleister

Benötigt werden:

- Bestätigung der tatsächlich verwendeten Google-Cloud-Projekte und produktiven Schlüsselbeschränkungen;
- Bestätigung der Rollen von Hosting-, E-Mail-, Push-, Diagnose- und Kartendienstleistern;
- Entscheidung, wie die jeweilige Übermittlung im Google-Play-Formular als Erhebung beziehungsweise Weitergabe klassifiziert wird;
- rechtliche Prüfung internationaler Übermittlungen und anwendbarer Vertragsgrundlagen.

### 5. Alter, Verträge, Zahlungen und Vermittlerrolle

Benötigt werden:

- Entscheidung zur Altersgrenze und dazu, wer wirksam Mietverträge schließen darf;
- Festlegung, ob ShareItToo ausschließlich vermittelt oder in einzelnen Abläufen selbst Vertragspartner wird;
- konsistente Regeln für Gebühren, keine Kaution/kein Schutz, Stornierung, Erstattung, Schäden und Streitfälle;
- erneute Freigabe, sobald Echtgeld-Zahlungen, Abonnements oder Werbung technisch aktiviert werden.

## Offizielle Quellen des technischen Reviews

- [Firebase Datenschutz und Aufbewahrung](https://firebase.google.com/support/privacy/)
- [Google Maps Platform – Security and compliance](https://developers.google.com/maps/security/compliance/security-compliance)
- [Google Play – Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play – Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [HGB § 257 – Aufbewahrung von Unterlagen](https://www.gesetze-im-internet.de/hgb/__257.html)
- [BGB § 195 – Regelmäßige Verjährungsfrist](https://www.gesetze-im-internet.de/bgb/__195.html)
- [DSGVO Art. 17 – Recht auf Löschung](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/deu)

## Technische Abschlussbedingungen für diesen Gate

Der Baustein darf erst auf „freigegeben“ gesetzt werden, wenn:

1. Anbieteridentität und öffentlich zulässige Kontaktangaben belegt sind;
2. alle neun Aufbewahrungsentscheidungen einen Wert und einen Nachweis besitzen;
3. externe Dienstleister und Löschverfahren vom Betreiber bestätigt sind;
4. Rechtstexte in App und Web inhaltlich konsistent und geprüft sind;
5. öffentliche URLs nach Freigabe erreichbar und automatisiert geprüft sind;
6. Google-Play-Datensicherheit und Apple-Datenschutzangaben exakt zum Kandidaten passen;
7. keine Freigabe durch eine technische Prüfung allein vorgetäuscht werden kann.

Bis dahin bleibt der Status **draft / fail-closed**.
