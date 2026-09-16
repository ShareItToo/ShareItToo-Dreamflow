# P0B-L1 Prüfauftrag V5.2 und G3

Paketversion: `P0B-L1-LEGAL-REVIEW-2026-08-21.1`

Status: **Vorbereitet für eine unabhängige professionelle Prüfung. Keine
Rechtsfreigabe, keine Rechtsberatung durch das Projekt und keine
Aktivierungsgrundlage.**

## Auftrag

Eine in Deutschland zur Rechtsberatung befugte und für Plattform-,
Verbraucher-, Datenschutz- und Zahlungsrecht geeignete Stelle soll die
Privatlaunch-Rechtsmappe `V5.2-2026-08-16` sowie ausschließlich die prospektive
Mehrartikel-Erweiterung für mehrere Gegenstände desselben Vermieters prüfen.
Architekturgrundlage ist G3A Variante A: eine Gruppenanfrage mit geordneter
Positionsliste, positionsgenauer fachlicher Wahrheit und ohne nachträgliche
Mutation historischer V5.2-Snapshots.

Die Prüfung muss mindestens klären:

1. Betreiberidentität, Rollen und Pflichtangaben vor einer Gründung oder
   Registereintragung und nach deren Vollzug;
2. Verhältnis zwischen Plattformvertrag und privatem Mietvertrag sowie den
   genauen Zeitpunkt jedes Vertragsschlusses;
3. Anfrage, Annahme, Ablehnung, Gegenofferte, Bindungsfrist, Quote-Hash,
   Preis- und Dokumentänderung;
4. Gruppen- gegenüber Positionswirkung bei Storno, Widerruf, Unverfügbarkeit,
   No-Show, Mangel, Übergabe, Rückgabe, Schaden, Refund und `needsReview`;
5. Checkout-Pflichtinformationen, eindeutige zahlungspflichtige Schaltfläche,
   Vertragsbestätigung und dauerhafter Datenträger;
6. Trennung von privatem Mietpreis, SIT-Plattformgebühr, Belegen, Refund,
   Chargeback und Auszahlung;
7. zulässiges Marktplatz-PSP-Modell, Vertragspartner, Geldfluss, KYC und die
   ZAG-Abgrenzung ohne Besitz oder Kontrolle von Kundengeldern durch SIT;
8. Datenschutz, Auftragsverarbeitung, Empfänger, Drittlandtransfer, Export,
   Aufbewahrung, Löschung, Rechtsverteidigung und Legal Hold;
9. Markttransparenz, Anbieterstatus, Ranking, Moderation, Meldung,
   Begründung, Rechtsbehelf und sonstige DSA-/DDG-Pflichten; und
10. klare Trennung des privaten Deutschland-Piloten von späteren Business-,
    B2C-, Länder-, Währungs- und Provider-Varianten.

## Verbindliche Prüfquellen

Die prüfende Stelle erhält und bezeichnet in ihrer Antwort mindestens:

- die neun unveränderten Nutzerteile A bis I samt Manifest der V5.2;
- das G3L-DRAFT-Manifest und seine vier technischen Entwurfsunterlagen;
- die G3A-Architekturentscheidung;
- das P0B-Pilotdossier und dessen offene Gates;
- das Entscheidungsarbeitsblatt dieses Pakets;
- das Primärquellenregister mit Abrufstand 21.08.2026; und
- den tatsächlich vorgesehenen PSP-Vertrag und dessen Produkt-/Geldfluss,
  sobald diese externe Unterlage vorliegt.

## Erwartete Liefergegenstände

Die professionelle Antwort ist nur verwertbar, wenn sie alle folgenden
Bestandteile enthält:

1. Name, Organisation, Berufs-/Befugnisgrundlage, Prüfer und Datum;
2. eindeutige Liste der geprüften Quelldateien mit SHA-256 oder Drive-ID und
   Änderungszeit;
3. je Entscheidungsschlüssel ein Ergebnis `approved`, `approved_with_changes`
   oder `rejected` mit Begründung und konkreter Text-/Systemfolge;
4. vollständige final vorgeschlagene oder redigierte Texte A bis I für V5.2
   und getrennt davon die G3-Änderungen;
5. Checkout-, Annahme-, Gegenofferte-, Bestätigungs-, Refund- und
   Belegwortlaute;
6. Datenschutz-/Retention-Matrix und PSP-/ZAG-Einschätzung;
7. verbleibende Voraussetzungen, Annahmen und Ausschlüsse;
8. freigegebene finale Datei-Hashes oder eine ausdrücklich ablehnende
   Entscheidung; und
9. eine signierte oder anderweitig authentifizierbare Freigabeerklärung.

Eine pauschale E-Mail wie „sieht gut aus“, ein CI-Erfolg, ein unverbindliches
Erstgespräch oder eine Freigabe ohne Quellbindung erfüllt den Auftrag nicht.

## Nicht im Auftrag

- keine Aktivierung von Produktion, Store, Cloud, VPS, DNS oder realem Geld;
- kein produktiver Vertragsschluss und keine öffentliche Publikation;
- keine Steuerberatung und keine Entscheidung für SIT Business oder weitere
  Länder;
- keine Erfindung noch unbekannter Betreiber-, Register-, Steuer-, Provider-
  oder Versicherungsdaten; und
- keine rückwirkende Änderung historischer V5.2-Snapshots.

## Projektseitige Annahmeregel

Bis ein externer Liefergegenstand das maschinenlesbare Evidenzschema erfüllt,
bleiben `professionalLegalApproval=false`, `publicActivationAllowed=false`,
`productionProvisioningAllowed=false` und `realMoneyAllowed=false`. Auch eine
spätere professionelle Freigabe ersetzt nicht die separaten PSP-,
Operations-, Geräte-, Datenschutz- und Aktivierungsgates.
