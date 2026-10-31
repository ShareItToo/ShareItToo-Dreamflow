# G2A - Navigation und Gemerkt-Migration

Stand: 20.08.2026

Branch: `codex/master-workflow-20260808`

Implementierungscommit:
`335eb8999d79aa33159ca3c0498d515947040833`

GitHub Actions:
[`32380693921`](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/32380693921)
ist fuer genau diesen Commit GREEN.

## Ergebnis

**G2A ist technisch GREEN.** Die Hauptnavigation verwendet jetzt exakt
`Entdecken`, `Mietkorb`, `Buchungen`, `Nachrichten`, `Mein SIT`. Der bestehende
Wishlist-Bestand ist unter `Mietkorb` > `Gemerkt` erreichbar und wird sichtbar
als unverbindlich sowie nicht reservierend gekennzeichnet.

Die vorhandenen gespeicherten Daten wurden weder umgeschrieben noch geloescht.
G2A fuehrt keinen persistenten Miet- oder Projektkorb, keine neue
Verfuegbarkeitspruefung und keine neue Buchungs-, Preis-, Vertrags- oder
Paymentlogik ein.

## Verbindliche Quellen und Grenzen

- Drive `01_CONTROL_V2.3_AUTONOMOUS.md` und
  `02_CODEX_WORK_PACKAGES_SIT_V2.3.md`.
- Drive `02_SIT_GROWTH_PRODUCT_PROJEKTKORB_UND_PLANER.pdf`, Version 2.0 vom
  18.08.2026.
- Bestehende V5.2-Preis-, Vertrags-, Buchungs-, Privacy- und Release-Regeln
  behalten ihren hoeheren fachlichen Rang.
- Keine Produktions-, VPS/OpenClaw-/Maximus-, SSH-, DNS-, Cloud-, Payment-,
  Store-, Provider-, Account- oder oeffentliche Aktion.

## Implementiertes Verhalten

- Fuenf Hauptziele in der freigegebenen Reihenfolge; der bestehende
  Bookings-Asset-Icon und die Profilbild-Navigation bleiben erhalten.
- Der zweite Tab ist ein begrenzter `Mietkorb`-Shell und zeigt nur den bereits
  vorhandenen Bereich `Gemerkt`.
- Toasts, Auswahlfenster, Listenverwaltung, Gast-Hinweis, Hilfetexte und
  Screenreader-Beschriftungen verwenden die neue sichtbare Terminologie.
- Die Kennzeichnung lautet sinngemaess: unverbindlich gespeichert, keine
  Reservierung; Verfuegbarkeit und Mietanfrage werden erst beim direkten
  Buchen geprueft.
- Direkte Einzelmiete, Gast-/Auth-Gates, Tab-Index und Back-Navigation bleiben
  im bestehenden Verhalten.

## Daten, Kompatibilitaet und Deep Links

- Zum G2A-Abschluss waren `wishlists_meta_v1` und `wishlist_assign_v1` die
  einzigen Persistenzschluessel fuer diesen Bestand. RW3 fuehrte
  `wishlist_state_v2` als atomare unscoped Quelle ein. RW4 ersetzt die aktuelle
  Laufzeitquelle durch das principal-scoped `wishlist_state_v3`; V2 und die
  beiden V1-Werte bleiben ausschliesslich Gast-Kompatibilitaetsspiegel und ein
  angemeldetes Konto wird nie in diese geraeteweiten Werte kopiert.
- Ein Regressionstest liest bestehende Metadaten und Zuordnungen und weist
  nach, dass beide gespeicherten Werte bytegleich bleiben.
- Es wurden weder `rental_cart_v1` noch `project_cart_v1` oder entsprechende
  Serverdaten eingefuehrt.
- `WishlistsScreen` bleibt als kompatibler interner Einstieg erhalten und
  fuehrt auf dieselbe `RentalCartScreen`-Implementierung.
- Der Audit fand keinen bestehenden Wishlist-/Favorites-App-Link. Deshalb
  wurde kein neuer Deep Link erfunden. Der bestehende Parser fuer Listing,
  Profil, Booking, Chat, Auth, Payment und Notifications blieb unveraendert
  und seine vorhandenen Regressionen sind gruen.
- Historische Localization-Keys bleiben fuer Rollback und alte interne
  Aufrufer bestehen; die aktuelle sichtbare Oberflaeche nutzt `Gemerkt`.

## Verifikation

- Fokussierte G2A-Fluttertests: Navigation, unveraenderte Persistenz sowie
  nicht bindende und barrierearme `Mietkorb`/`Gemerkt`-Darstellung PASS.
- G2A-Wiring- und aktualisierte Android-Diagnosetests PASS; historische
  Navigationslabels werden nur fuer alte Diagnosekandidaten akzeptiert.
- Vollstaendige lokale technische Regression auf dem finalen Baum: 301
  Flutter-Tests PASS, ein dokumentierter Skip, zusaetzlicher Google-only-
  Profiltest PASS, Analyzer exakt auf der akzeptierten 223er-Baseline,
  Web-Debug-Build und Android-Debug-APK PASS.
- Der lokale Lauf nutzte `CI=true` nur fuer den erlaubten metadata-only
  Handoff, weil das private historische Kandidatenarchiv auf diesem Mac mini
  nicht vorhanden ist. Daraus wird kein Store-, Signier- oder Device-Pass
  abgeleitet.
- Exakte GitHub-CI: Backend- und Flutter-Regression PASS. Der signierte
  Android-Releasekandidat und `publish-api-image` wurden uebersprungen.
- `git diff --check` und der gestagte Integritaetscheck waren sauber.

## Risiken, Rollback und fortbestehende Gates

- G2A hat keine Datenmigration. Ein App-Rollback liest weiterhin dieselben
  Wishlist-Schluessel; die Kompatibilitaetsklasse bleibt vorhanden.
- Ein Code-Rollback kann durch einen normalen spaeteren Revert erfolgen; kein
  Reset, Rebase, Force-Push oder History Rewrite ist erforderlich.
- Es gibt keinen neuen physischen Pixel-/Store-/signierten Kandidatennachweis.
  Die C1I-HOLDs bleiben unveraendert.
- Privacy, Retention und Legal bleiben draft/fail-closed. G2A selbst hat weder
  deren Text noch Versionen, Hashes oder Freigabestatus veraendert.
- Persistenter Mietkorb, Projektkorb, Login-Rueckkehr, Server-Quote-Recheck und
  gruppierte Anfragen bleiben ausserhalb von G2A.

## Naechster Schritt

Das aktive Folgepaket ist **G2L - Legal/Privacy-Delta fuer G2**. Es versioniert
nur die tatsaechlich betroffene aktuelle Terminologie und legt Export-,
Loeschungs- und Retention-Vertraege fuer die spaetere Korbdaten-Topologie
fail-closed fest. Historische Snapshots bleiben unveraendert. Eine nicht aus
V5.2 oder den aktuellen Entscheidungen ableitbare materielle Rechts- oder
Privacy-Entscheidung ist ein HARD STOP vor G2B.

## Aktueller Nachfolger RW4

RW4 aendert keine G2A-Navigation oder Bindungswirkung. Es ordnet den lokalen
Bestand einem opaken Konto- oder Gast-Prinzipal zu, migriert unscoped Altbestand
nur zum Gast und isoliert fehlerhafte Einzel-Buckets. Export und bestaetigte
Loeschung wirken nur auf den aktiven Prinzipal. Diese technische
Datenschutzhaertung erteilt keine Legal-, Pilot- oder Release-Freigabe.
