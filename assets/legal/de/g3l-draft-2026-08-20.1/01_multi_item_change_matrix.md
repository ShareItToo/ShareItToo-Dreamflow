# G3L-DRAFT Änderungsmatrix Mehrartikel-Miete

Version: `G3L-DRAFT-2026-08-20.1`

Status: **Interner technischer Entwurf. Nicht veröffentlichen, nicht als
Rechtsfreigabe verwenden und nicht als Vertragsinhalt provisionieren.**

Die Matrix beschreibt den Änderungsbedarf gegenüber der unveränderten
Rechtsmappe `V5.2-2026-08-16`. Sie entscheidet keine Rechtsfrage. Endgültige
Formulierungen, Rechtsfolgen und Pflichtinformationen müssen professionell
geprüft und danach als neue, separat freigegebene Version erstellt werden.

| Bereich | V5.2-Ausgangspunkt | Technisch vorgesehene Mehrartikel-Struktur | Offene professionelle Entscheidung |
| --- | --- | --- | --- |
| Teil A: Plattformbedingungen und Checkout | Eine Buchungsanfrage, ein Gegenstand, ein Gesamtbetrag und ein buchungsbezogener Plattformvertrag. | Eine Gruppenanfrage referenziert eine geordnete, unveränderliche Positionsliste, einen Gruppen-Quote-Hash und die exakte Summe aller Positionen. Jede Mitgliedschafts- oder Preisänderung ist eine neue Quote. | Vertragsgegenstand und Leistungsumfang des SIT-Plattformvertrags; Darstellung von Parteien, Positionen, Einzelpreisen, Gesamtpreis, Bindungsfrist und Schaltflächentext; Wirkung einer Gegenofferte. |
| Teil B: Privat-Mietbedingungen | Mietgegenstand und Zubehör werden im Singular durch Buchungsübersicht, Inserat und Bestätigung bestimmt. | Variante A sieht einen Gruppen-Mietvorgang mit einzeln bezeichneten Positionen und positionsgebundenen Inserat-, Quote-, Zubehör- und Zustands-Snapshots vor. | Ob und wie ein einheitlicher privater Mietvertrag mit Positionsanhang formuliert wird; Teilbarkeit und Rechtsfolgen bei nur einer betroffenen Position; Abgrenzung zu mehreren Einzelverträgen. |
| Teil C: Storno, No-Show und Refund | Pflichten und Erstattungen sind buchungsbezogen. | Jeder Befehl benennt `complete_group` oder konkrete aktive Positionen. Mietpreis und SIT-Gebühr bleiben je Position und Schuldner getrennt; die Gruppe zeigt nur die Summe. | Voraussetzungen und Folgen vollständiger oder positionsbezogener Lösung; Wechselwirkungen bei Unverfügbarkeit, No-Show, gescheiterter Übergabe, Mangel, früher Rückgabe oder Gegenofferte. |
| Teil D: Übergabe, Rückgabe und Schaden | Ein Gegenstand besitzt Fotos, Zubehör, Bestätigungen, Abweichungen und Schadennachweise. | Ein gemeinsamer Termin ist zulässig, aber Pflichtfotos, Zubehör, Bestätigung, Abweichung, Schaden und `needsReview` bleiben je Position. Eine Position darf andere nicht automatisch sperren. | Rechtswirkung gemeinsamer Terminbestätigung; Folgen fehlender oder abgelehnter Einzelpositionen; Beweiswert der Gruppen- und Positionsbestätigungen; Grenzen einer positionsbezogenen Prüfung. |
| Teil E: Zahlung, Auszahlung und Belege | Ein Buchungsbetrag wird in Mietpreis und SIT-Gebühr getrennt; Belege bleiben leistungserbringerbezogen. | Eine spätere Gruppenoperation ist nur bei gleichem Empfänger, Währung und Provider-Setup denkbar. Unveränderliche Allokationen je Position bleiben Ledger-, Refund- und Chargeback-Grundlage. | Zulässigkeit und Pflichtinformationen einer Gruppenautorisierung; Teilrefunds und Chargebacks; Auszahlungsfreigabe unstreitiger Positionen; Form und Aussteller der gruppierten Bestätigung/Belege. Real Money bleibt aus. |
| Teil F/G: Sicherheit, Meldung und Überprüfung | Maßnahmen und Überprüfung sind fall- beziehungsweise kontobezogen. | Ein Positionsfall erzeugt nur eine abgeleitete Gruppenzusammenfassung. Eine gesamte Gruppe wird ausschließlich bei einer separat belegten Account-/Systemrisikoregel gehalten. | Verständliche Begründung, Zuständigkeit und Rechtsbehelf bei Positions- gegenüber Gruppeneffekt. |
| Teil H: Datenschutz | Buchungs-, Preis-, Dokument-, Übergabe-, Zahlungs- und Nachweisdaten werden buchungsbezogen beschrieben. | Zusätzlich entstehen Gruppen-ID, Kompatibilitätsbindung, geordnete Positions- und Quote-Hashes, Gruppenereignisse, technische Befehle und ein gemeinsamer Termin. Der Kontoexport enthält Gruppen- und Positionsbezüge; Nachweisbilder bleiben in den V5.2-Positionsdatensätzen. | Zwecke, Rechtsgrundlagen, Empfänger und Transparenztext für Gruppierung; datensparsame Sichtbarkeit von Gruppenmetadaten; ob weitere Betroffeneninformation erforderlich ist. |
| Export | Der technische Kontoexport liefert die vorhandenen personenbezogenen Buchungs- und Nachweisdaten. | Export muss Gruppe, Rollenbezug, Positionen, Quote-Historie, Entscheidungen, Bindungen, Termine und Befehle verständlich korrelieren, ohne interne Adressschlüssel oder fremde Identifikatoren offenzulegen. | Professionelle Prüfung von Vollständigkeit, Verständlichkeit und Drittpersonen-Schutz. |
| Aufbewahrung/Löschung | Fristen und Ausführung bleiben in der vorhandenen Retention-Matrix offen und fail-closed. | Gruppen- und Positionsdaten werden den bestehenden Kategorien Transaktion, Nachweis und Sicherheitsaudit zugeordnet. Es wird keine neue Frist erfunden und keine Löschung aktiviert. | Freigabe der Fristen und Startpunkte; Behandlung abhängiger Gruppenereignisse, Vertrags-/Belegnachweise, Rechtsverteidigung und Legal Hold. |
| Dokumente und Audit | V5.2 bindet unveränderliche Dokument-Snapshots, Erklärungen, Quotes, Zeitstempel und Belege je Buchung. | Eine neue Gruppenfassung muss Gruppen-ID, Quote-ID/-Hash, geordnete Positionen, Allokationen, Dokumentversion und Erklärungen dauerhaft binden. V5.2-Snapshots bleiben unverändert. | Erforderliche Erklärungen von Mieter und Vermieter, Zeitpunkt der Vertragsschlüsse, dauerhafter Datenträger, Nachweisumfang und Aufbewahrung. |

## Technische Nichtentscheidungen

- Dieser Entwurf wählt keine gesetzliche Rechtsgrundlage und keine
  Aufbewahrungsfrist neu aus.
- Er aktiviert weder Vertragsschluss noch Zahlung, Refund, Auszahlung,
  Veröffentlichung oder Store-Verteilung.
- Er ersetzt keine professionelle Prüfung der Teile A bis I, der Checkout-
  Texte oder der Verbraucher-/Unternehmer-Zweige einer späteren Skalierung.
- Ein Projekt mit mehreren Eigentümern, Ländern, Währungen, Rechtsversionen
  oder Payment-Konfigurationen bleibt außerhalb einer Buchungsgruppe.
