# G3L-DRAFT Release Gate

Version: `G3L-DRAFT-2026-08-20.1`

Ergebnis: **HARD STOP vor jeder öffentlichen oder produktiven Aktivierung von
Mehrartikel-Buchungsgruppen.**

Eine spätere Aktivierung erfordert kumulativ:

1. professionell geprüfte und schriftlich freigegebene neue Dokumenttexte;
2. unveränderliche finale Version und Hashes aller betroffenen Dokumente;
3. freigegebene Checkout-/Annahme-/Gegenofferte-Texte und dauerhafte
   Bestätigung für beide Parteien;
4. freigegebene Regeln und Tests für positionsbezogene Leistungsstörung,
   Storno, Refund, Rückgabe, Schaden und `needsReview`;
5. freigegebene Datenschutz-, Export-, Aufbewahrungs-, Lösch- und
   Legal-Hold-Matrix;
6. separat freigegebene Provider-, Real-Money-, Ledger-, Refund-, Chargeback-
   und Belegkette;
7. bestandenes geschlossenes Pilot-/Geräte-/Rollback-Dossier am exakten
   Release-Commit; und
8. eine neue ausdrückliche Aktivierungsentscheidung mit enger Region,
   Kategorie, Kohorte und Rückfallplan.

Ein G3L-CI-Erfolg, Architekturentscheid A, Draft-PR, Test-Build oder technische
Feature-Flag-Fähigkeit erfüllt diese Bedingungen nicht. Bis zur späteren
Freigabe bleiben Backend und Flutter standardmäßig aus; ein Release-Build darf
den technischen G3-Pfad nicht zeigen.
