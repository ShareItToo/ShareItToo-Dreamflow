# ShareItToo AI-Rechtsvorprüfung für Deutschland-Privatpilot und G3

Paket: `P0B-L2-AI-PREASSESSMENT-2026-09-14.1`

Status: **AI-VORPRÜFUNG; UNABHÄNGIGER ASTRA-ABGLEICH AUSSTEHEND; KEINE
PROFESSIONELLE RECHTSFREIGABE.**

## Ergebnis in einem Satz

Die technische Grundarchitektur ist für einen strikt deutschen Privatpilot
grundsätzlich tragfähig, wenn der Plattformvertrag, der private Mietvertrag und
der Stripe-Zahlungsfluss getrennt behandelt werden; eine öffentliche oder
echte entgeltliche Nutzung bleibt aber gesperrt, bis die unten benannten Text-
und Systemänderungen umgesetzt sowie Betreiber-, Steuer- und PSP-Fakten
belegt sind.

## Einordnung und Grenzen

Diese Ausarbeitung ist eine quellengebundene KI-Vorprüfung für die interne
Produktentscheidung. Sie ist keine Rechtsberatung durch eine in Deutschland
zugelassene Person oder Organisation, ersetzt keine steuerliche Beratung und
setzt `professionalLegalApproval` nicht auf `true`. Die Entscheidungen im
professionellen P0B-L1-Schema bleiben `open`.

Untersucht wurden der historische V5.2-Satz, der inaktive V5.3-
Einzelunternehmerentwurf, G3A Variante A, G3B bis G3L, die Checkout-,
Widerrufs-, Retention-, DSA- und Payment-Implementierung sowie die am
14.09.2026 erreichbaren amtlichen DE/EU-Quellen. Nicht als wahr angenommen
wurden Register-, Steuer-, Gewerbe-, Beschäftigten-, Providervertrags- oder
KYC-Fakten, die nicht durch belastbare aktuelle Unterlagen belegt sind.

## Tragfähiges Zielmodell

1. **SIT-Plattformvertrag:** eigener Verbrauchervertrag zwischen Betreiber und
   Nutzer über die entgeltliche Plattformleistung. Er braucht eigene
   Pflichtinformationen, eindeutige Zahlungserklärung, Widerrufsbelehrung,
   Widerrufsfunktion und dauerhafte Bestätigung.
2. **Privater Mietvertrag:** Vertrag ausschließlich zwischen demselben privaten
   Vermieter und Mieter. Bei mehreren Artikeln desselben Vermieters ist ein
   Gruppenvertrag mit geordneter Positionsanlage vertretbar, sofern Preis,
   Leistung, Beweise und Rechtsfolgen je Position erhalten bleiben.
3. **Zahlungsabwicklung:** lizenzierter PSP als Zahlungsdienstleister. SIT darf
   aus technischer Vermittlung und eigener Gebührenforderung nicht in einen
   unbelegten erlaubnispflichtigen Geldtransfer kippen. Der konkrete Stripe-
   Vertrag, die Kontokonfiguration und der reale Geldfluss bleiben hierfür
   zwingende externe Fakten.

Der private Deutschland-Pilot muss Anbieter, die geschäftlich, selbständig
oder beruflich vermieten, technisch blockieren. Ein späterer Business- oder
B2C-Betrieb benötigt eigene Texte, Statusprüfung, Prozesse und Freigaben.

## 1. `operatorIdentityAndImprint`

**decision:** `ai_hold_external_fact`

**reasoning:** § 5 DDG verlangt leicht erkennbare, unmittelbar erreichbare und
ständig verfügbare Angaben zu Name, Anschrift, Kontakt sowie gegebenenfalls
Rechtsform, Vertretung, Register und Identifikationsnummern. Der V5.3-Entwurf
enthält eine Einzelunternehmerfassung, doch die tatsächliche Gewerbe-, Steuer-
und Registerlage ist in den gebundenen Unterlagen nicht abschließend belegt.
Vor Eintragung darf keine UG oder Registernummer behauptet werden; nach einer
Gründung muss eine neue, zeitlich klar getrennte Rechtsversion entstehen.

**requiredTextChanges:** V5.3 erst nach dokumentierter Betreiberprüfung als
neue operative Version ableiten; identische Betreiberangaben in Impressum,
Datenschutz, Checkout, Bestätigung, Gebührenbeleg und Supportkontakt; nur
tatsächlich vorhandene Register-, USt- oder Wirtschafts-ID angeben.

**requiredSystemChanges:** ein einziges versionsgebundenes Betreiberprofil als
Quelle aller öffentlichen Ausgaben; Aktivierung nur bei vollständig belegtem
Status; atomarer Versionswechsel ohne rückwirkliche Änderung alter Snapshots.

**assumptions:** Deutschland; natürliche Person oder bereits wirksam
bestehendes Unternehmen; keine erlaubnispflichtige eigene Zahlungsleistung.

**residualRisks:** Gewerbeanmeldung, Steuerstatus, ladungsfähige Anschrift,
Registerstand und Namensführung sind externe Tatsachen.

**sourceCitations:** [S1], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 2. `groupPrivateRentalContractModel`

**decision:** `ai_recommended_with_changes`

**reasoning:** Für mehrere Gegenstände desselben privaten Vermieters ist G3A
Variante A – ein privater Gruppen-Mietvertrag mit unveränderlicher,
positionsgenauer Anlage – das klarste Modell. Es wahrt einen gemeinsamen
Parteien-, Zeitraum- und Terminkontext, ohne die gesetzlichen Folgen einer
Nichtleistung oder eines Mangels auf einen unbeteiligten Gegenstand zu
übertragen. Eine Komplettauflösung darf nur aus ausdrücklicher Vereinbarung
oder dann folgen, wenn die verbleibende Teilleistung für den Mieter objektiv
kein Interesse mehr hat.

**requiredTextChanges:** Gruppe, jede Position, Einzelpreis, Zeitraum und
Gesamtpreis ausdrücklich benennen; positionsbezogene Mangel-, Nichtübergabe-,
Rückgabe-, Schaden- und Stornofolgen; klarer Ausnahmefall für die Auflösung der
gesamten Gruppe.

**requiredSystemChanges:** ein Vertragssnapshot je Gruppe mit geordneter
Positionsanlage; jede Position behält Quote, Evidence, Status und Ledger;
Gruppensumme nur als Ableitung.

**assumptions:** identische Parteien, Währung, Zeitraum, Land,
Zahlungsempfänger und kompatible Übergabe-/Rückgaberegeln.

**residualRisks:** Die Wirksamkeit konkreter AGB-Klauseln hängt vom finalen
Wortlaut und dem tatsächlichen Nutzerstatus ab.

**sourceCitations:** [S7], [S8], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 3. `groupPlatformContractScope`

**decision:** `ai_recommended_with_changes`

**reasoning:** Die Plattformleistung kann gruppenbezogen angeboten werden,
wenn die eigene SIT-Gebühr transparent je Position allokiert und als eigener
Vertrag von der privaten Miete getrennt wird. SIT schuldet die beschriebenen
digitalen Vermittlungs-, Dokumentations- und Supportfunktionen, nicht
Eigentum, Übergabe, Beschaffenheit, Versicherung oder Vertragserfüllung des
Vermieters.

**requiredTextChanges:** geschuldete Plattformleistung, Leistungsbeginn,
Gebühr, Dauer, Kündigung/Widerruf und Haftungsgrenze konkret beschreiben;
private Mietforderung und SIT-Gebühr getrennt ausweisen.

**requiredSystemChanges:** eigener Plattformvertragssnapshot und eigene
Gebührenallokation je Position; kein impliziter Wechsel der SIT-Rolle durch
Checkout, Moderation oder Payment.

**assumptions:** SIT bleibt technischer Marktplatzbetreiber und wird weder
Vermieter noch Versicherer oder Zahlungsinstitut.

**residualRisks:** Zu weitgehende Garantien, Inkasso- oder
Entscheidungsbefugnisse könnten die Rolle faktisch verändern.

**sourceCitations:** [S2], [S3], [S4], [S9].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 4. `completeOfferAndCounterOfferSemantics`

**decision:** `ai_recommended_with_changes`

**reasoning:** Das Inserat sollte eine Einladung zur Abgabe eines Angebots
bleiben. Der Mieter gibt nach vollständiger Quote und Vertragsschau ein bis zu
einem bestimmten Zeitpunkt bindendes Angebot ab; die unveränderte Annahme des
Vermieters schließt den Mietvertrag. Jede Änderung an Positionen, Preis,
Zeitraum, Partei, Leistung oder Dokumentversion ist Ablehnung plus neues
Angebot und erfordert neue ausdrückliche Zustimmung des Mieters. Eine bloße
Eingangsbestätigung ist keine Annahme.

**requiredTextChanges:** Rechtsnatur von Inserat, Anfrage, Annahme,
Gegenangebot, Ablauf und Eingangsbestätigung mit eindeutigen Zeitpunkten
beschreiben.

**requiredSystemChanges:** Angebot an Quote-ID/-Hash, Parteien,
Positionsreihenfolge, Zeitraum und Dokumentversion binden; serverseitiger
Ablauf; geänderte oder verspätete Annahme erzeugt neue Revision; keine
Zahlungsbelastung auf bloße Gegenofferte.

**assumptions:** Die UI und E-Mail-Texte verwenden dieselben Zustandsbegriffe.

**residualRisks:** Abweichende Push-, Support- oder Fehlertexte könnten
unbeabsichtigt einen anderen Vertragsschluss behaupten.

**sourceCitations:** [S4], [S6], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 5. `checkoutAndDurableConfirmation`

**decision:** `ai_recommended_with_changes`

**reasoning:** Unmittelbar vor der zahlungspflichtigen Erklärung müssen die
wesentlichen Leistungen, Einzel- und Gesamtpreise, Parteien, Zeitraum,
Mindestdauer und alle Zusatzkosten hervorgehoben stehen. Der Button muss die
Zahlungspflicht eindeutig ausdrücken. Der Zugang der Bestellung ist sofort
elektronisch zu bestätigen; nach Vertragsschluss ist der vollständige Inhalt
rechtzeitig auf einem dauerhaften Datenträger bereitzustellen. SIT besitzt
bereits servergebundene Quotes und hashgebundene Belege, die operative
Ausspielung ist aber nicht freigegeben.

**requiredTextChanges:** finalen Buttonwortlaut, Korrekturmöglichkeit,
Bindungsfrist, Zahlungszeitpunkt und getrennte Vertragspartner eindeutig
festlegen; keine Sammelzustimmung zu unabhängigen Erklärungen.

**requiredSystemChanges:** letzte Checkoutansicht aus serverautoritativem
Snapshot; Eingabekorrektur; eindeutiger Button; Eingangsbestätigung getrennt
von Annahme; unveränderliche Vertragsbestätigung mit Hash, Zeitpunkt und
Version zum Speichern.

**assumptions:** Der Plattformvertrag ist ein zahlungspflichtiger
Verbrauchervertrag; der private Mietvertrag bleibt C2C.

**residualRisks:** Mobile Deep Links, E-Mail-Ausfall und asynchrone
Paymentantworten dürfen Bestellzugang und Vertragsschluss nicht vermischen.

**sourceCitations:** [S3], [S4], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 6. `withdrawalAndFixedPeriodRental`

**decision:** `ai_recommended_with_changes`

**reasoning:** Für die entgeltliche SIT-Plattformleistung besteht grundsätzlich
ein 14-tägiges Widerrufsrecht. Es erlischt bei einer entgeltlichen
Dienstleistung nicht schon mit dem Beginn, sondern erst nach vollständiger
Leistung und nur bei vorheriger ausdrücklicher Zustimmung zum frühen Beginn
und bestätigter Kenntnis. Wertersatz setzt ein ausdrückliches Verlangen und
ordnungsgemäße Information voraus. Ein fester Mietzeitraum beseitigt bei der
Vermietung allgemeiner beweglicher Gegenstände kein Widerrufsrecht eines
Verbrauchers gegenüber einem unternehmerischen Vermieter; die Ausnahme nennt
insbesondere Kraftfahrzeugvermietung und bestimmte termingebundene
Freizeitleistungen. Beim strikt privaten C2C-Vermieter besteht dagegen kein
gesetzliches Verbraucherwiderrufsrecht aus diesen Vorschriften.

Seit der aktuellen §-356a-Fassung braucht der online geschlossene widerrufliche
Vertrag während der Widerrufsfrist einen ständig verfügbaren, hervorgehobenen
Einstieg „Vertrag widerrufen“, eine Bestätigungsfunktion und eine
unverzügliche Eingangsbestätigung auf dauerhaftem Datenträger. Der bestehende
SIT-Ablauf ist zweistufig und erzeugt einen hashgeprüften Beleg; die allein im
Rechtsmenü belegte Platzierung und der V5.2-Platzhalter reichen für die
Aktivierungsbehauptung nicht.

**requiredTextChanges:** Plattform- und Mietwiderruf strikt trennen; C2C-
Hinweis; exakte Belehrung und Musterformular; frühes Leistungsverlangen und
Kenntnis getrennt, freiwillig und nicht vorausgewählt; keine pauschale
„Festzeit“-Ausnahme.

**requiredSystemChanges:** §-356a-Einstieg ständig und hervorgehoben in App/Web;
zweistufige Auswahl von Vertrag oder Teilvertrag; dauerhafte unverzügliche
Bestätigung; Frist auf Kalenderbasis; Anbieterstatus-Gate blockiert B2C-
Vermietung ohne eigenen Flow.

**assumptions:** allgemeine bewegliche Gegenstände, keine Fahrzeuge,
Unterkünfte, Beförderung oder gesondert geprüfte Freizeitdienstleistungen.

**residualRisks:** Der konkrete Leistungsgegenstand und Zeitpunkt der
vollständigen SIT-Leistung müssen im finalen Vertrag belastbar definiert sein.

**sourceCitations:** [S3], [S5], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 7. `partialPerformanceAndDivisibilityConsequences`

**decision:** `ai_recommended_with_changes`

**reasoning:** Ein Gruppenvertrag darf die positionsbezogene Gegenleistung
nicht verdecken. Nichtübergabe oder Unmöglichkeit einer Position lässt deren
Gegenleistung grundsätzlich entfallen; ein Mangel mindert den Mietpreis dieser
Position. Ein Rücktritt vom gesamten Gruppenvertrag ist nur gerechtfertigt,
wenn an der verbleibenden Leistung kein Interesse besteht oder ein anderer
gesetzlicher Grund vorliegt.

**requiredTextChanges:** Matrix für Nichtverfügbarkeit, Nichtübergabe, Mangel,
verspätete Übergabe, frühe Rückgabe und No-Show; Gesamtauflösung nicht als
Automatik.

**requiredSystemChanges:** Zustände und Beträge je Position; Nutzerentscheidung
bei wesentlich entwerteter Restgruppe; unveränderte unbetroffene Positionen;
keine aus Gruppenstatus abgeleitete Geldfolge.

**assumptions:** Positionspreise sind objektiv nachvollziehbar und nicht nur
nachträglich aufgeteilt.

**residualRisks:** Ob die Restleistung wertlos ist, kann eine Einzelfallprüfung
erfordern.

**sourceCitations:** [S7], [S8].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 8. `groupAndPositionCancellationRefundRules`

**decision:** `ai_recommended_with_changes`

**reasoning:** Vertraglicher Storno, gesetzlicher Widerruf, Rücktritt,
Minderung, No-Show und Refund sind verschiedene Rechtsgründe. Jede Aktion muss
ihren Scope und Schuldner ausweisen. Pauschale Strafbeträge oder doppelte
Belastungen sind zu vermeiden; bei persönlicher Verhinderung des Mieters sind
ersparte Aufwendungen und eine Ersatzvermietung anzurechnen.

**requiredTextChanges:** vollständige, verständliche Matrix mit Auslöser,
Frist, Scope, Mietpreisfolge, SIT-Gebührenfolge, tatsächlichem Schaden und
Beispielrechnung.

**requiredSystemChanges:** getrennte Refundpflichten `owner` und `sit`;
append-only Berechnungsgrund; Position vor Gruppe; Restgruppenentscheidung;
Providerstatus darf rechtliche Anspruchsentstehung nicht ersetzen.

**assumptions:** keine Kaution, Versicherung oder automatisierte
Schadensbelastung.

**residualRisks:** Die AGB-Kontrolle des finalen Stornomodells und die
steuerliche Behandlung der Gebühr bleiben vom genauen Text abhängig.

**sourceCitations:** [S5], [S7], [S8], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 9. `sharedAppointmentAndPositionEvidenceEffect`

**decision:** `ai_recommended`

**reasoning:** Ein gemeinsamer Termin darf nur die Organisation korrelieren.
Er beweist nicht automatisch Übergabe, Zustand, Zubehör oder Rückgabe jeder
Position. Die vorhandene G3D-Trennung ist deshalb sachgerecht.

**requiredTextChanges:** ausdrücklich erklären, dass Terminbestätigung und
Positionsbestätigung unterschiedliche Erklärungen sind und Fotos keine
abschließende Beweislastentscheidung vorwegnehmen.

**requiredSystemChanges:** Evidence, Zubehör, Abweichung und Gegenbestätigung je
Position; gemeinsame Challenge nur als Zugang zum Termin; revisionsfester
Zeitstempel und Partei.

**assumptions:** beide Parteien können jede Position einzeln prüfen und
Abweichungen dokumentieren.

**residualRisks:** Beweiswert bleibt einzelfallabhängig; SIT darf keine
gerichtliche Tatsachenentscheidung behaupten.

**sourceCitations:** [S7], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 10. `positionNeedsReviewAndUnrelatedRelease`

**decision:** `ai_recommended_with_changes`

**reasoning:** Ein positionsbezogener Streit rechtfertigt grundsätzlich nur
den Hold des betroffenen Betrags. Ein Gruppen- oder Konto-Hold braucht einen
eigenständigen, dokumentierten Betrugs-, Sicherheits- oder Systemgrund und
muss verhältnismäßig sein. Moderationsentscheidungen benötigen verständliche
Gründe und einen überprüfbaren Rechtsbehelf.

**requiredTextChanges:** Hold-Grund, Scope, Dauer, zulässige Beweise,
Entscheidung, Rechtsbehelf und getrennte Freigabe unstreitiger Positionen.

**requiredSystemChanges:** positionsgebundener `needsReview`; eigener
risikobasierter Gruppen-/Konto-Hold; reason code, menschliche Prüfung,
Fristen, Benachrichtigung und Appeal; fremde Positionen werden nicht allein
wegen des abgeleiteten Gruppenstatus gesperrt.

**assumptions:** kein gesetzlicher oder PSP-seitiger Gesamt-Hold greift.

**residualRisks:** Providerreserven oder Chargebacks können technisch größere
Beträge blockieren; Nutzeranspruch und Providerliquidität bleiben getrennt.

**sourceCitations:** [S10], [S11], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 11. `groupPaymentAuthorizationAndProviderContract`

**decision:** `ai_hold_external_fact`

**reasoning:** Die geplante technische Architektur – Stripe Connect, getrennte
Belastung und Transfers, keine Speicherung von Karten- oder Bankdaten bei SIT
und positionsgenaue Allokation – reduziert Risiken, beweist aber keine
aufsichtsrechtliche Ausnahme. Das ZAG erfasst unter anderem Finanztransfer;
eine Erlaubnis ist grundsätzlich erforderlich, sofern keine belegte Ausnahme
oder ein lizenzierter Dienstleister den vollständigen Zahlungsdienst erbringt.
Die technische-Dienstleister-Ausnahme setzt insbesondere voraus, dass SIT zu
keiner Zeit in den Besitz der Gelder gelangt. Ob das konkrete Connect-Produkt,
der Vertrag, die Kontorollen, Capture-/Transferbefugnisse und die Haftung dies
erfüllen, ist ohne echte Unterlagen nicht entscheidbar.

**requiredTextChanges:** PSP namentlich und rollenrichtig erst nach Vertrag
benennen; Zahler, Empfänger, SIT-Gebühr, Capture, Transfer, Refund,
Chargeback, Reserve und KYC transparent beschreiben.

**requiredSystemChanges:** ausschließlich freigegebene Connect-Konfiguration;
kein SIT-Wallet oder frei verfügbares Nutzer-Guthaben; providergebundene
Idempotenz und Reconciliation; reale Zahlung bleibt bis Vertrags- und
ZAG-Abgleich fail-closed.

**assumptions:** Stripe ist der beabsichtigte lizenzierte PSP; SIT möchte keine
eigene ZAG-Erlaubnis beantragen.

**residualRisks:** Das gewählte Charge-/Transfer-Modell kann SIT zur
Vertragspartei des PSP, zu Rückbelastungs- oder Negativsaldoverantwortung
machen; das ist nicht allein durch Code lösbar.

**sourceCitations:** [S9], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 12. `positionLedgerRefundAndChargebackAllocation`

**decision:** `ai_recommended_with_changes`

**reasoning:** Gruppenautorisierung ist nur dann vertretbar, wenn jede
finanzielle Bewegung unveränderlich auf Position, Schuldner, Gläubiger,
Rechtsgrund, Providerobjekt und Ausgangsbetrag zurückgeführt werden kann.
Refund, Transfer-Reversal und Chargeback sind getrennte Providerereignisse;
eine verlorene oder unklare Antwort darf keinen Erfolg behaupten.

**requiredTextChanges:** erklären, dass angezeigte Erstattung und Auszahlung
erst nach bestätigtem Providerstatus als ausgeführt gelten; rechtlicher Anspruch
und technischer Status getrennt.

**requiredSystemChanges:** append-only Double-Entry-Ledger; unveränderliche
Positionsallokation; exakte Metadaten/Idempotenz; uncertain/manual-review-
Zustände; serielle Konfliktkontrolle zwischen Auszahlung, Refund und Dispute;
unstreitige Positionen separat behandelbar.

**assumptions:** der PSP unterstützt die erforderlichen Referenzen und
Teilrückabwicklungen.

**residualRisks:** Providergebühren, FX und negative Salden brauchen eine
verbindliche Allokationsregel.

**sourceCitations:** [S9], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 13. `groupConfirmationAndReceiptIssuerContent`

**decision:** `ai_recommended_with_changes`

**reasoning:** Eine technische Zahlungsbestätigung oder Stripe-Quittung ist
nicht automatisch die steuerliche Rechnung über sämtliche Leistungen. SIT
kann nur die eigene Plattformleistung als eigenen Umsatz belegen. Der private
Vermieter bleibt Aussteller eines erforderlichen Belegs über seine
Mietleistung; bei rein privater Tätigkeit ist nicht ohne Weiteres eine
Unternehmerrechnung zu behaupten. Die Gruppenbestätigung kann beide Verträge
korreliert, aber klar getrennt wiedergeben.

**requiredTextChanges:** Dokumentart und Aussteller sichtbar benennen;
SIT-Gebühr, Mietpreis, Erstattung und Steuerangaben getrennt; keine fremde
Umsatzsteuer ausweisen; Stripe nicht als Leistenden darstellen.

**requiredSystemChanges:** zwei logisch getrennte Dokumentbereiche bzw.
Dokumente; hashgebundene Partei-, Positions-, Preis-, Rechtsgrund- und
Versionsdaten; Korrektur nur durch neue Belegversion, nie Überschreiben.

**assumptions:** Betreiber-Steuerstatus und private Vermieterstellung werden
vor Ausgabe verifiziert.

**residualRisks:** Rechnungs-, Kleinunternehmer- und Plattformmeldepflichten
benötigen Steuerprüfung anhand der realen Betreiber- und Umsatzdaten.

**sourceCitations:** [S3], [S4], [S14], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 14. `privacyPurposesLegalBasesAndRecipients`

**decision:** `ai_hold_external_fact`

**reasoning:** Kontoführung, Vertragsanbahnung und Buchung können auf Art. 6
Abs. 1 Buchst. b DSGVO gestützt werden; gesetzlich vorgeschriebene
Aufbewahrung auf Buchst. c; Betrugsabwehr, Sicherheit und Rechtsverteidigung
gegebenenfalls auf Buchst. f nach dokumentierter Interessenabwägung.
Freiwillige Crashdiagnose, Marketinganalyse oder ähnliche optionale Zwecke
dürfen nicht in die Vertragserforderlichkeit gezogen werden. Für jeden
Empfänger sind Rolle, Datenfelder, Region, DPA, Unterauftragsverarbeiter,
Transfergrundlage und Löschung zu belegen. Diese externen Providerunterlagen
sind noch nicht vollständig gebunden.

**requiredTextChanges:** vollständige Zweck-Datenart-Rechtsgrundlage-
Empfänger-Frist-Matrix; getrennte Angaben für Hosting, Auth, Push,
Crashdiagnose, E-Mail/SMS, Karten/Orte, Support, Listing-AI und Payment;
Betroffenenrechte und Aufsicht.

**requiredSystemChanges:** Zweckbindung und Datenminimierung; optionale
Einwilligungen granular, freiwillig und widerrufbar; DPA-/Transfer-Gate;
Rollen- und Principal-Isolation; Logging ohne Secrets.

**assumptions:** Verantwortlicher sitzt in Deutschland; keine Verarbeitung
besonderer Kategorien als Produktzweck.

**residualRisks:** Reale Providerregionen, SCC/DPF-Einordnung, Telemetrie und
Subprozessoren können nur gegen aktuelle Verträge abschließend bewertet werden.

**sourceCitations:** [S10], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 15. `accountExportCompletenessAndCounterpartyProtection`

**decision:** `ai_recommended_with_changes`

**reasoning:** Auskunft und Datenkopie nach Art. 15 sowie Portabilität nach
Art. 20 sind nicht identisch. Der Export soll eigene Konto-, Inserats-,
Buchungs-, Vertrags-, Nachrichten-, Evidence-, Support- und Finanzdaten mit
Gruppen-/Positionskorrelation verständlich enthalten. Rechte und Freiheiten
anderer Personen begrenzen die Ausgabe; interne Sicherheitsmerkmale,
Zugangsdaten und nicht erforderliche Gegenparteidaten gehören nicht hinein.

**requiredTextChanges:** Umfang, Format, Identitätsprüfung, Ausschlüsse und
Beschwerdeweg getrennt für Art. 15 und Art. 20 erläutern.

**requiredSystemChanges:** serverseitige Principal-Prüfung; nur eigene oder
rechtmäßig empfangene Inhalte; Gegenparteidaten minimieren; exakte Adressen,
interne IDs, Moderationssignale und Secrets redigieren; manipulationssicheres
Exportprotokoll.

**assumptions:** Nachrichten zwischen den beiden Parteien dürfen im eigenen
Konversationskontext ausgegeben werden, ohne verdeckte Drittinformationen.

**residualRisks:** Beweis- und Moderationsunterlagen können eine individuelle
Abwägung erfordern.

**sourceCitations:** [S10], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 16. `retentionDeletionLegalHoldPeriodsAndTriggers`

**decision:** `ai_recommended_with_changes`

**reasoning:** Es gibt keine einheitliche SIT-Aufbewahrungsfrist. Operative
Daten sind nach Zweckfortfall zu löschen oder zu anonymisieren; gesetzliche
Belege bleiben zweckgebunden. Die regelmäßige zivilrechtliche Verjährung
beträgt drei Jahre ab Jahresende bei Kenntnis, kann gehemmt sein und kennt
längere Höchst- oder titulierte Fristen. Rechnungsdoppel sind derzeit acht
Jahre ab Jahresende aufzubewahren; andere Buchführungsunterlagen können
abweichende Fristen haben. Ein Legal Hold darf nur konkrete Datensätze und
einen dokumentierten Anspruch/Sicherheitsgrund erfassen und muss überprüft
werden.

**requiredTextChanges:** finale Kategorie-Matrix mit Rechtsgrundlage,
Startpunkt, Frist, Lösch-/Anonymisierungsaktion, Backupwirkung und Hold-
Ausnahme; keine pauschale Speicherung „für rechtliche Zwecke“.

**requiredSystemChanges:** Ausführung erst nach validierter Matrix;
ereignisbasierte Friststarts; scoped Holds mit Owner, Grund, Review- und
Enddatum; Löschbestätigung; Backups rotieren und werden nicht zur operativen
Wiederherstellung gelöschter Profile genutzt.

**assumptions:** SIT ist kein geldwäscherechtlich Verpflichteter für vom PSP
erhobene KYC-Daten und übernimmt diese Daten nicht unnötig.

**residualRisks:** Steuer-/Handelsstatus, konkrete Belegarten, anhängige
Streitigkeiten und Providerfristen sind externe Fakten; die bestehende
Retention-Ausführung bleibt zu Recht blockiert.

**sourceCitations:** [S10], [S14], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 17. `marketplaceTransparencyDsaAndModeration`

**decision:** `ai_recommended_with_changes`

**reasoning:** SIT ist voraussichtlich Hostingdienst und Online-Plattform, weil
Nutzer Inserate potenziell einer unbestimmten Zahl anderer Nutzer zugänglich
machen. Damit sind jedenfalls transparente Bedingungen, Nutzerkontakt,
Notice-and-Action und begründete Moderationsentscheidungen zu prüfen. Zusätzliche
Onlineplattform- und Trader-Marktplatzpflichten können für Kleinst- oder kleine
Unternehmen teilweise ausgenommen sein; diese Einstufung ist zu dokumentieren
und regelmäßig neu zu prüfen. Unabhängig davon verlangt Art. 246d EGBGB vor
Vertragsschluss Informationen zu Ranking, Anbieterstatus und den Folgen eines
privaten Anbieters. Wird später ein Händler zugelassen, kommen unter anderem
Traceability- und Compliance-by-design-Pflichten hinzu, soweit keine
Unternehmensgrößen-Ausnahme greift.

**requiredTextChanges:** Rankingparameter und relative Gewichtung; Erklärung
des privaten/unternehmerischen Anbieterstatus; DSA-Bedingungen,
Kontaktstellen, Meldeweg, Begründung und Rechtsbehelf; keine veraltete
EU-OS-Plattform verlinken; VSBG-Erklärungen nach tatsächlicher
Beschäftigtenzahl und Teilnahmeentscheidung.

**requiredSystemChanges:** statusgebundenes Onboarding pro Angebot;
private-only Gate; präziser Locator im Notice-Flow; reason codes, Mitteilung,
Appeal und Audit; Art.-18-Eskalation bei konkretem Verdacht auf Straftaten mit
Lebens-/Sicherheitsgefahr; regelmäßige Größen- und Pflichtenprüfung.

**assumptions:** SIT ist in der EU niedergelassen und zunächst Kleinst- oder
kleines Unternehmen; keine VLOP-Einstufung.

**residualRisks:** Unternehmensgröße, Nutzerzahl, konkrete Dienstkategorie und
gewerbliche Anbieterzulassung sind veränderliche Fakten. Freiwillig
implementierte Schutzprozesse dürfen nicht als falsche Pflichtbehauptung
formuliert werden.

**sourceCitations:** [S2], [S11], [S12], [S13], [S15].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## 18. `businessGlobalConsumerAndTraderVariants`

**decision:** `ai_hold_external_fact`

**reasoning:** Der private Deutschland-Pilot kann nicht unverändert auf
gewerbliche Vermieter, andere Länder, Sprachen, Währungen oder PSP-
Konfigurationen übertragen werden. Anbieterstatus verändert
Verbraucherwiderruf, Pflichtinformationen, DSA-/P2B-Pflichten, Rechnung,
Steuern, Gewährleistung und Identitätsprüfung. Land und Währung verändern
zwingend Recht, Steuer, Zahlungs- und Beschwerdeprozesse.

**requiredTextChanges:** je Variante eigener Rechts- und Preissatz; klare
Geltungsgrenze des Deutschland-Privatpiloten; keine automatische Übersetzung
als Freigabe.

**requiredSystemChanges:** immutable Konfiguration aus Land, Sprache, Währung,
Anbieterstatus, PSP-Konto, Legal-Version, Storno- und Steuerprofil; Wechsel
erzeugt neue Gruppe und neue Zustimmung; unbekannte Kombinationen fail-closed.

**assumptions:** Pilot bleibt Deutschland, EUR, volljährige Privatpersonen,
lokale Übergabe, keine Fahrzeuge, Lieferung, Kaution, Versicherung oder
Echtgeldfreigabe durch dieses Paket.

**residualRisks:** Jede neue Variante erfordert eigene fachliche Prüfung und
Providerzulässigkeit.

**sourceCitations:** [S2], [S3], [S9], [S10], [S11].

**reviewerInitials:** `AI-SOL-SELF-CHECK-2026-09-14`

## Priorisierte Korrekturen vor einem echten entgeltlichen Pilot

1. Betreiber-, Gewerbe-, Steuer- und Registerstatus belegen und daraus eine
   neue operative Legal-Version ableiten.
2. §-356a-Widerrufsfunktion ständig hervorgehoben in App und Web platzieren;
   V5.2-Platzhalter entfernen; unverzügliche dauerhafte Bestätigung beweisen.
3. Gruppenvertrag, Plattformvertrag, Quote, Angebot/Gegenangebot und Belege in
   einer neuen Legal-Version vollständig synchronisieren.
4. Private-only Anbieterstatus pro Angebot beweisen und B2C/Business
   fail-closed halten.
5. DSA-/Art.-246d-Texte, Rankingdarstellung, Notice, Begründung und Appeal
   gegen den tatsächlichen öffentlichen Dienst schließen.
6. Zweck-/Empfänger-/DPA-/Transfer- und Retention-Matrix mit realen Providern
   vervollständigen.
7. Echten Stripe-Connect-Vertrag und Kontoflow gegen ZAG, Vertragsrollen,
   Gebühren, Rückbelastungen, KYC und Datenschutz prüfen; erst danach
   Sandbox-E2E und später ein separates Echtgeld-Gate.

## Abschlusskriterien dieser Vorprüfung

Diese Vorprüfung ist erst fachlich konsolidiert, wenn ein unabhängiger
Astra-Ultra-Abgleich alle 18 Schlüssel einzeln bestätigt, korrigiert oder mit
abweichender Begründung markiert hat. Danach werden nur die geprüften
Korrekturen in eine neue, weiterhin inaktive Legal-Version übernommen. Eine
KI-Konsolidierung darf niemals `professionalLegalApproval=true` setzen.

## Quellen

- **[S1]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 5
  DDG](https://www.gesetze-im-internet.de/ddg/__5.html), Abruf 14.09.2026.
- **[S2]** Bundesministerium der Justiz/Bundesamt für Justiz, [Art. 246d § 1
  EGBGB](https://www.gesetze-im-internet.de/bgbeg/art_246d__1.html) und
  [§ 2](https://www.gesetze-im-internet.de/bgbeg/art_246d__2.html), Abruf
  14.09.2026.
- **[S3]** Bundesministerium der Justiz/Bundesamt für Justiz, [Art. 246a § 1
  EGBGB](https://www.gesetze-im-internet.de/bgbeg/art_246a__1.html), Abruf
  14.09.2026.
- **[S4]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 312
  BGB](https://www.gesetze-im-internet.de/bgb/__312.html), [§ 312f](https://www.gesetze-im-internet.de/bgb/__312f.html),
  [§ 312i](https://www.gesetze-im-internet.de/bgb/__312i.html) und
  [§ 312j](https://www.gesetze-im-internet.de/bgb/__312j.html), Abruf
  14.09.2026.
- **[S5]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 355 bis
  § 357a BGB](https://www.gesetze-im-internet.de/bgb/BJNR001950896.html#BJNR001950896BJNG031100377),
  insbesondere aktuelle elektronische Widerrufsfunktion § 356a, Abruf
  14.09.2026.
- **[S6]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 145
  BGB](https://www.gesetze-im-internet.de/bgb/__145.html), [§ 147](https://www.gesetze-im-internet.de/bgb/__147.html) und
  [§ 150](https://www.gesetze-im-internet.de/bgb/__150.html), Abruf 14.09.2026.
- **[S7]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 323
  BGB](https://www.gesetze-im-internet.de/bgb/__323.html), [§ 326](https://www.gesetze-im-internet.de/bgb/__326.html),
  [§ 536](https://www.gesetze-im-internet.de/bgb/__536.html), [§ 536a](https://www.gesetze-im-internet.de/bgb/__536a.html) und
  [§ 537](https://www.gesetze-im-internet.de/bgb/__537.html), Abruf 14.09.2026.
- **[S8]** Bundesministerium der Justiz/Bundesamt für Justiz, [§§ 305 bis 310
  BGB](https://www.gesetze-im-internet.de/bgb/BJNR001950896.html#BJNR001950896BJNG029802377), Abruf 14.09.2026.
- **[S9]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 1
  ZAG](https://www.gesetze-im-internet.de/zag_2018/__1.html), [§ 2](https://www.gesetze-im-internet.de/zag_2018/__2.html) und
  [§ 10](https://www.gesetze-im-internet.de/zag_2018/__10.html), Stand mit
  Änderung vom 25.03.2026, Abruf 14.09.2026.
- **[S10]** Europäische Union, [DSGVO, Verordnung (EU)
  2016/679](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679),
  insbesondere Art. 5, 6, 12–15, 17, 20, 28, 32 und 44 ff., Abruf 14.09.2026.
- **[S11]** Europäische Union, [Digital Services Act, Verordnung (EU)
  2022/2065](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32022R2065),
  insbesondere Art. 11–20, 24 und 29–32, Abruf 14.09.2026.
- **[S12]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 36
  VSBG](https://www.gesetze-im-internet.de/vsbg/__36.html) und
  [§ 37](https://www.gesetze-im-internet.de/vsbg/__37.html), Stand mit Änderung
  vom 08.12.2025, Abruf 14.09.2026.
- **[S13]** Europäische Union, [Verordnung (EU)
  2024/3228](https://eur-lex.europa.eu/eli/reg/2024/3228/oj) zur Einstellung der
  ODR-Plattform und Aufhebung der Verordnung (EU) Nr. 524/2013 mit Wirkung zum
  20.07.2025, Abruf 14.09.2026.
- **[S14]** Bundesministerium der Justiz/Bundesamt für Justiz, [§ 195
  BGB](https://www.gesetze-im-internet.de/bgb/__195.html), [§ 199](https://www.gesetze-im-internet.de/bgb/__199.html),
  [§ 203](https://www.gesetze-im-internet.de/bgb/__203.html), [§ 14b
  UStG](https://www.gesetze-im-internet.de/ustg_1980/__14b.html), [§ 147
  AO](https://www.gesetze-im-internet.de/ao_1977/__147.html) und [§ 257
  HGB](https://www.gesetze-im-internet.de/hgb/__257.html), Abruf 14.09.2026.
- **[S15]** ShareItToo Repository: V5.2/V5.3-Manifeste, P0B-L1-Intake, G3A–G3L,
  `private_pilot_checkout_screen.dart`, `platform_withdrawal_screen.dart`,
  Payment-, DSA- und Retention-Workflows; gebunden im Paketmanifest.
