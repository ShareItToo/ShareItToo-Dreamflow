# SIT Aufbewahrungs- und Löschmatrix – Entscheidungsentwurf

Stand: 22. August 2026
Status: **Entscheidungsvorbereitung; nicht freigegeben**

## Ergebnis

Alle zehn Entscheidungen bleiben formal offen. Dieses Dokument macht sie einzeln entscheidbar, ohne eine Rechtsfrist oder Freigabe vorzutäuschen. Solange eine Entscheidung offen ist, berechnet SIT dafür keine löschbaren Datensätze und führt keine kategorieweise Löschung aus.

Die V5.1-Unterlagen verlangen eine dokumentierte Löschmatrix, enthalten aber keine vollständigen Aufbewahrungsfristen. Deshalb werden technische Tatsachen, Anbieterfristen und echte Betreiber-/Rechtsentscheidungen getrennt.

## Entscheidungsmatrix

| Entscheidung | Vorbereitung | Empfehlung | Aktueller technischer Stand |
|---|---|---|---|
| Inaktive Konten | Betreiber + Recht nötig | Im Privatpilot keine automatische Inaktivitätslöschung. Vor öffentlichem Start Auslöser, Vorwarnung, Widerspruch und Ausnahmen für offene Vorgänge beschließen. | Kontolöschung funktioniert; Inaktivitätsroutine fehlt bewusst. |
| Transaktionsdaten | Rechtliche Klassifikation nötig | Buchungsbelege, Handelskorrespondenz, gewöhnliche Buchungsdaten und Anspruchsnachweise getrennt behandeln; keine pauschale Einheitsfrist. | Unveränderliche Vertrags-, Refund-, Nachweis- und Finanzdokumente vorhanden; Löschung gesperrt. |
| Kommunikation | Betreiber + Recht nötig | Normalen Chat von rechtserheblichen Erklärungen, Support, Streitfällen und Handelskorrespondenz trennen. | Kontolöschung bereinigt direkte Inhalte; kategorieweise Löschung fehlt bewusst. |
| Datenschutz-Betroffenenrechte | Betreiber + Recht nötig | Anfragen, Identitätsprüfungen, Fristverlängerungen und Abschlussnachweise zweckgebunden und getrennt von normaler Supportkommunikation behandeln; nur notwendige Rechenschafts- und Anspruchsnachweise erhalten. | Intake, Fristkontrolle und Identitätsprüfung vorhanden; Frist/Purge und fallgenaue Legal-Hold-Freigabe bleiben offen. |
| Moderationsnachweise | Betreiber + Recht nötig | Nur für aktive Meldung, Beschwerde, Sicherheitsprüfung, Legal Hold oder Anspruchszweck; Nachprüfung nach Fallabschluss. | Moderation und Legal Hold vorhanden; Frist/Purge offen. |
| Sicherheits-/Auditlogs | Risiko + Recht nötig | Auth-, Admin-, Buchungs-, Zustell- und Lösch-Audit getrennt bewerten; kürzeste zweckerfüllende Frist. | Append-only Nachweise vorhanden; Frist/Purge offen. |
| Abgelaufene Zugangsdaten | Technisch entscheidungsreif | Bei Ablauf/Verbrauch löschen oder Challenge-Digest unbrauchbar machen; Startlauf + alle 6 Stunden, maximal 24 Stunden nach Löschreife. | Implementiert und getestet. |
| Backups | Betrieblich entscheidungsreif | 14 Tage Rotation bestätigen; Primärdaten sofort bereinigen, alte Backups rotieren aus und dürfen nur kontrolliert zur Wiederherstellung dienen. | 14-Tage-Rotation vorhanden; keine Einzellöschung in bestehenden Backups. |
| Externe Anbieter | Produktaufnahme für FCM, Crashlytics, Firebase Auth und Maps strukturiert; Anbieter-/Transfer-/Retention-Entscheidung offen | FCM und Crashlytics verbindlich erhalten; Firebase Auth und Maps mit eigener Löschgrenze fail-closed halten. Lokale Deaktivierung, Anbieterabschluss und anbietergesteuerte Löschung nicht vermischen. | Offizielle Quellen und vier getrennte Bereitschaftsakten geprüft; konkrete Transfer-, Aufbewahrungs- und Löschfreigaben bleiben offen. |
| Legal Hold | Betreiberprozess + Recht nötig | Admin-only, fallgebunden, begrenzter Umfang, Grund, regelmäßige Erforderlichkeitsprüfung und dokumentierte Freigabe. | Technische Sperre und Audit vorhanden; Prozessfreigabe offen. |

## Externe Dienste – verbindliche Produktgrenze

- Firebase Cloud Messaging bleibt Bestandteil von SIT, aber standardmäßig aus und nur nach eigener freiwilliger Aktivierung.
- Firebase Crashlytics bleibt Bestandteil von SIT, aber standardmäßig aus und nur nach einer davon getrennten freiwilligen Aktivierung.
- Push darf Crashdiagnose niemals automatisch aktivieren.
- Diese bestätigte Produktaufnahme schließt die externe Anbieterentscheidung nicht: Transfergrundlage, Region, Vertrag, Storeangaben, Anbieterfrist und lokaler Opt-out-/Löschablauf bleiben je Dienst nachzuweisen.
- Werbung, Marketingtracking, allgemeine Analytics und externe generative KI bleiben ohne gesonderte Entscheidung aus.
- Anbieterfristen werden als anbietergesteuerte Abschlusszeiten beschrieben, nicht als von SIT garantierte Sofortlöschung.

### Getrennter technischer Nachweis

- **FCM-Push:** SIT schaltet die lokale automatische Initialisierung aus, löscht bei Abmeldung beziehungsweise Kontolöschung die aktuelle Backend-Registrierung, den Messaging-Token und die Firebase-Installation und merkt fehlgeschlagene Bereinigung für einen erneuten Versuch vor. Google beschreibt den Abschluss der installationsgebundenen Löschung innerhalb von bis zu 180 Tagen nach dem Löschantrag. Vertrag, Verarbeitungsorte, Transferfreigabe und Betreiberbestätigung bleiben offen.
- **Crashlytics:** SIT schaltet die automatische Erfassung aus, aktiviert sie nur nach der getrennten Crashdiagnose-Entscheidung und löscht noch nicht gesendete lokale Berichte beim Ausschalten. Google beschreibt für bereits gespeicherte Crashberichte 90 Tage Aufbewahrung vor Beginn der Entfernung und stellt inzwischen eine benutzergebundene Löschoperation bereit. Eine standardmäßig ausgeschaltete serverseitige Löschwarteschlange mit Wiederholung und ohne SIT-Konto-ID ist vorbereitet. Die dafür nötige pseudonyme SDK-Zuordnung wird jedoch noch nicht an Firebase übermittelt, und der Provideraufruf bleibt deaktiviert, bis diese zusätzliche Datenübertragung ausdrücklich freigegeben, offengelegt und physisch geprüft ist; deshalb darf lokale Bereinigung nicht als vollständige Anbieter-Löschung ausgegeben werden.
- Ein FCM-Nachweis darf niemals die Crashlytics-Freigabe schließen und umgekehrt. Beide erhalten eigene maschinenlesbare Bereitschaftsbelege und bleiben bis zur jeweiligen Betreiber-/Vertrags-/Transfer-/Löschbestätigung `open`.
- **Firebase Authentication:** Die aktive Telefonprüfung entfernt die temporäre, ausschließlich telefongebundene Firebase-Identität nach sicherer Gegenprüfung. Persistente soziale Firebase-Identitäten werden vor der lokalen Kontolöschung transaktional in eine dauerhafte Anbieter-Löschwarteschlange aufgenommen, bei vorübergehenden Fehlern automatisch erneut angefragt und erst nach Provider-Erfolg oder `user-not-found` aus der Warteschlange entfernt. Google-, Apple- und Facebook-Anmeldung bleibt bis zu den getrennten Betreiber-, Vertrags-, Transfer- und Storefreigaben deaktiviert. Firebase nennt wenige Wochen für protokollierte IP-Adressen und bis zu 180 Tage nach kundenseitig ausgelöster Nutzerlöschung für andere Authentifizierungsdaten.
- **Google Maps Platform:** Adressvorschläge und Ortsdetails laufen authentifiziert, begrenzt und ohne eingebetteten Client-Schlüssel über den SIT-Server. Erst bei Nutzung werden eingegebene Adresse beziehungsweise Ortskennung übertragen. Google nennt keinen einheitlichen festen Log-Aufbewahrungszeitraum; Vertrag, aktivierte APIs, Logging, Schlüsselrestriktion, Transfer und ein kontobezogener Löschweg bleiben offen.

## Warum die zehn Punkte noch nicht geschlossen werden

§ 257 HGB unterscheidet derzeit zehn Jahre für bestimmte Grundunterlagen, acht Jahre für Buchungsbelege und sechs Jahre für sonstige erfasste Handelsunterlagen. § 147 AO unterscheidet ebenfalls nach Dokumentart. Die regelmäßige Verjährung nach § 195 BGB beträgt drei Jahre; ihr Beginn richtet sich regelmäßig nach § 199 BGB. Diese Regeln erlauben keine pauschale Aussage wie „alle Buchungsdaten acht Jahre“.

Das Löschkonzept der BfDI betont Datenminimierung, Speicherbegrenzung, zweckbezogene Fristen und regelmäßige Überprüfung. Daraus folgt für SIT eine datensatzbezogene Matrix statt einer einzigen globalen Dauer.

Offizielle Grundlagen:

- HGB § 257: https://www.gesetze-im-internet.de/hgb/__257.html
- AO § 147: https://www.gesetze-im-internet.de/ao_1977/__147.html
- BGB § 195: https://www.gesetze-im-internet.de/bgb/__195.html
- BGB § 199: https://www.gesetze-im-internet.de/bgb/__199.html
- BfDI-Löschkonzept: https://www.bfdi.bund.de/SharedDocs/Downloads/DE/DokumenteBfDI/AccessForAll/2023/2021_Loeschkonzept-BfDI.pdf

## Freigabereihenfolge

1. Abgelaufene Zugangsdaten und Backupfenster als bereits technisch belegte Betriebsentscheidungen bestätigen.
2. Für alle vier getrennten Google-Dienste die vorbereiteten Akten um Betreiber-, Vertrags-, Transfer-, Store-, Aufbewahrungs- und Löschbelege ergänzen; soziale Firebase-Anmeldung bleibt trotz geschlossener technischer Löschwarteschlange bis zu diesen externen Freigaben aus.
3. Transaktionen, Kommunikation, Moderation und Audit datensatzweise rechtlich klassifizieren.
4. Inaktivitäts- und Legal-Hold-Prozess organisatorisch festlegen.
5. Erst danach Werte in `store/retention-deletion-readiness.json` schließen.
6. Danach Cutoff-Berechnung implementieren, Staging trocken prüfen und erst mit separater Freigabe eine produktive Löschroutine ermöglichen.

Die technische Ausführungsvorprüfung ist bereits fail-closed implementiert.
Sie meldet im aktuellen Stand 21 ausschließlich symbolische Blocker und gibt
weder Richtlinienwerte noch Kennungen aus. Selbst vollständig freigegebene
Dokumente reichen nicht für eine Löschung: kategorieweiser Purge,
Cutoff-Anwendung, Berechnung löschbarer Zeilen und Staging-Trockenlauf müssen
zusätzlich gemeinsam bestanden sein. Ein destruktiver API-Pfad wurde nicht
angelegt.

## Harte Grenze

Dieser Entwurf ändert weder Produktion noch Store-Angaben, schaltet keine Löschroutine frei und ist keine Rechtsberatung oder Rechtsfreigabe.
