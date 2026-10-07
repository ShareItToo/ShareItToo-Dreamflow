# G3L-DRAFT Technische Dokument- und Snapshot-Bindung

Version: `G3L-DRAFT-2026-08-20.1`

Status: **Interne technische Spezifikation; nicht freigegeben, nicht wirksam
und nicht für öffentliche oder produktive Provisionierung bestimmt.**

## Unveränderliche Elternfassung

Elternfassung ist `V5.2-2026-08-16`. Sämtliche neun V5.2-Dateien A bis I und
das V5.2-Manifest bleiben bytegenau erhalten. Bestehende V5.2-Snapshots,
Verträge, Erklärungen, Belege, Buchungen und Nachweise werden weder neu
beschriftet noch auf eine G3-Version migriert.

## Prospektiver Gruppen-Dokumentensatz

Ein später professionell freigegebener Mehrartikel-Dokumentensatz muss eine
neue Version besitzen und mindestens folgende unveränderliche Daten binden:

1. `booking_group_id`, Aggregate-/Positionsschema und Kompatibilitäts-Hash;
2. genau einen Mieter, einen Vermieter, Marktkontext, Land, Währung, Zeitraum,
   Zeitzone, Übergabe-, Storno-, Legal- und Payment-Konfiguration;
3. aktuelle Gruppen-Quote-ID, Revision, Vorgänger-Quote-ID und Quote-Hash;
4. die geordnete Liste aller aktiven Positionen mit Positions-ID, Inserat-ID,
   Einzel-Quote-ID/-Hash, Mietpreis, SIT-Gebühr, Gesamtbetrag, Auszahlungsbasis
   und Kautionsbetrag in Minor Units;
5. den mathematisch identischen Gruppengesamtbetrag als Summe der Positionen;
6. die exakten, noch professionell freizugebenden Erklärungswortlaute mit
   Nutzer, Rolle, Dokumentversion, Client-Build und Annahmezeitpunkt;
7. bei einer Gegenofferte sowohl Vorgänger- als auch aktuelle Mitgliedschaft,
   Allokationen und eine neue ausdrückliche Zustimmung des Mieters;
8. nach einem später separat freigegebenen Vertragsschluss die bestehenden
   positionsbezogenen `booking_id`, Vertrags-, Quote-, Beleg-, Refund- und
   Nachweisreferenzen; und
9. einen append-only Audit-Zusammenhang, der Gruppenvorgang und Positionen
   korreliert, ohne die Position als fachliche Wahrheit zu ersetzen.

## Bestätigung und Belege

Die spätere dauerhafte Gruppenbestätigung muss jede Position mit Gegenstand,
Parteien, Zeitraum, Einzelallokation und Dokumentversion aufführen. Mietpreis
des privaten Vermieters und eigene SIT-Plattformgebühr müssen je Position und
in der Summe getrennt bleiben. Eine SIT-Rechnung darf privaten C2C-Mietpreis
nicht als SIT-Umsatz ausweisen. Refund- und Actual-Loss-Belege bleiben nach
Schuldner, Grund, Position und Betrag nachvollziehbar.

Die Spezifikation erzeugt heute keinen Beleg und keine Zahlungs-, Refund- oder
Auszahlungsanweisung.

## Übergabe-, Rückgabe- und Schadensnachweise

Ein gemeinsamer Abhol- oder Rückgabetermin ist nur eine Gruppenkorrelation.
Pflichtfoto-Slots, Upload-/Evidence-ID, Zubehörzustand, Gegenbestätigung,
Abweichung, Rückgabestatus, Schaden, streitiger Betrag und `needsReview` bleiben
je bestehender V5.2-Positionsbuchung gespeichert und exportierbar. Eine
Gruppenzusammenfassung darf keine positionsbezogene Tatsache überschreiben.

## Datenschutz, Export und Aufbewahrung

- Der Kontoexport korreliert Gruppe, Positionen, Quotes, Entscheidungen,
  Bindungen, Termine und technische Befehle mit dem jeweiligen Nutzerbezug.
- Interne Standortschlüssel und Identifikatoren der Gegenpartei werden nicht
  unnötig als Klartext exportiert; genaue Adressen bleiben in der bisherigen
  zeit- und buchungsgebundenen Offenlegungsgrenze.
- Gruppen- und Quote-Daten gehören technisch zu Transaktionen,
  Zustandsnachweise zu Nachweisen und Befehle/Ereignisse zum Sicherheitsaudit.
- Die vorhandene Retention-Entscheidungsmatrix bleibt maßgeblich. Keine Frist,
  Löschfreigabe oder Legal-Hold-Folge wird durch G3L erfunden oder aktiviert.

## Aktivierungszustand

`G3L-DRAFT-2026-08-20.1` ist ausschließlich ein technischer Entwurfsbezeichner.
Er darf nicht als freigegebene Dokumentversion in einem öffentlichen Checkout,
einem produktiven Vertrag oder einem Store-/Release-Artefakt erscheinen.
