#!/usr/bin/env python3
"""Build fail-closed V5.2 A-I legal HTML assets from the reviewed PDF."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pdfplumber


EXPECTED_SOURCE_SHA256 = "aa6f631457c9b73fdae3c5d4415ba6681b86f63b51df3fd5937c50f80a27b8a8"
EXPECTED_SOURCE_BYTES = 285180
EXPECTED_SOURCE_PAGES = 55
LEGAL_VERSION = "V5.2-2026-08-16"
SOURCE_HEADER = (
    "ShareItToo | Rechtsmappe Privat-Launch V5.2 Entscheidungsfassung | "
    "Pflichtdaten vor Veröffentlichung einsetzen"
)
SOURCE_FOOTER = re.compile(
    r"Gründungsvorhaben ShareItToo - geplante UG \(haftungsbeschränkt\) Seite (\d+)"
)

DOCUMENTS = (
    {
        "part": "A",
        "type": "platform_terms",
        "filename": "part_a_platform_terms.html",
        "title": "Teil A - Plattform-Nutzungsbedingungen",
        "pages": list(range(8, 19)),
        "contractRole": "platform-contract",
    },
    {
        "part": "B",
        "type": "private_rental_terms",
        "filename": "part_b_private_rental_terms.html",
        "title": "Teil B - Privat-Mietbedingungen zwischen Nutzern",
        "pages": list(range(19, 24)),
        "contractRole": "private-rental-contract",
    },
    {
        "part": "C",
        "type": "cancellation_refund",
        "filename": "part_c_cancellation_refund.html",
        "title": "Teil C - Storno-, No-Show- und Refund-Regelwerk",
        "pages": list(range(24, 26)),
        "contractRole": "private-rental-contract",
    },
    {
        "part": "D",
        "type": "handover_return_damage",
        "filename": "part_d_handover_return_damage.html",
        "title": "Teil D - Übergabe-, Rückgabe- und Schadenregeln",
        "pages": list(range(26, 29)),
        "contractRole": "private-rental-contract",
    },
    {
        "part": "E",
        "type": "payment_payout",
        "filename": "part_e_payment_payout.html",
        "title": "Teil E - Zahlungs- und Auszahlungsbedingungen",
        "pages": list(range(29, 32)),
        "contractRole": "platform-contract",
    },
    {
        "part": "F",
        "type": "community_safety",
        "filename": "part_f_community_safety.html",
        "title": "Teil F - Community-, Sicherheits- und Verbotsregeln",
        "pages": [32],
        "contractRole": "platform-contract",
    },
    {
        "part": "G",
        "type": "reporting_moderation_review",
        "filename": "part_g_reporting_moderation_review.html",
        "title": "Teil G - Melde-, Moderations- und Überprüfungsverfahren",
        "pages": list(range(33, 35)),
        "contractRole": "platform-contract",
    },
    {
        "part": "H",
        "type": "privacy",
        "filename": "part_h_privacy.html",
        "title": "Teil H - Datenschutzerklärung für ShareItToo",
        "pages": list(range(35, 42)),
        "contractRole": "statutory-information",
    },
    {
        "part": "I",
        "type": "imprint_withdrawal_shorttexts",
        "filename": "part_i_imprint_withdrawal_shorttexts.html",
        "title": "Teil I - Impressum, Widerruf und In-App-Kurztexte",
        "pages": list(range(42, 46)),
        "contractRole": "statutory-information",
    },
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def clean_page(pdf: pdfplumber.PDF, page_number: int) -> str:
    text = pdf.pages[page_number - 1].extract_text() or ""
    lines = [line.rstrip() for line in text.splitlines()]
    if not lines or lines.pop(0) != SOURCE_HEADER:
        raise ValueError(f"unexpected or missing V5.2 source header on page {page_number}")
    if not lines:
        raise ValueError(f"empty V5.2 source page {page_number}")
    footer = SOURCE_FOOTER.fullmatch(lines[-1].strip())
    if footer is None or int(footer.group(1)) != page_number:
        raise ValueError(f"unexpected or missing V5.2 source footer on page {page_number}")
    lines.pop()
    cleaned = "\n".join(lines).strip()
    if not cleaned:
        raise ValueError(f"empty V5.2 legal content on page {page_number}")
    return cleaned


def page_sections(pdf: pdfplumber.PDF, page_numbers: list[int]) -> list[tuple[int, str]]:
    return [(number, clean_page(pdf, number)) for number in page_numbers]


def html_document(
    *,
    part: str,
    title: str,
    sections: list[tuple[int, str]],
) -> str:
    rendered_sections = "\n".join(
        "<section class=\"source-page\" data-source-page=\"{}\" "
        "aria-label=\"Quellseite {}\">"
        "<div class=\"page-label\">Quelle: Seite {}</div>"
        "<pre>{}</pre></section>".format(
            page,
            page,
            page,
            html.escape(text, quote=True),
        )
        for page, text in sections
    )
    return f"""<!doctype html>
<html lang="de" data-legal-version="{LEGAL_VERSION}" data-legal-part="{part}" data-activation-allowed="false">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="sit-source-sha256" content="{EXPECTED_SOURCE_SHA256}">
  <title>{html.escape(title)}</title>
  <style>
    :root {{ color-scheme: light; font-family: Arial, Helvetica, sans-serif; }}
    body {{ margin: 0; color: #18324d; background: #f5f8fc; }}
    main {{ max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }}
    .draft {{ border: 2px solid #b42318; background: #fff1f0; color: #7a271a;
      border-radius: 12px; padding: 16px; margin-bottom: 24px; font-weight: 700; }}
    h1 {{ color: #102a43; font-size: clamp(1.7rem, 4vw, 2.5rem); }}
    .source-page {{ background: white; border: 1px solid #d8e2ee; border-radius: 12px;
      padding: 20px; margin: 18px 0; box-shadow: 0 4px 18px rgba(16, 42, 67, .06); }}
    .page-label {{ color: #526b84; font-size: .82rem; margin-bottom: 12px; }}
    pre {{ margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit;
      line-height: 1.55; }}
    @media (max-width: 520px) {{ main {{ padding: 20px 12px 40px; }}
      .source-page {{ padding: 14px; }} }}
  </style>
</head>
<body>
<main>
  <div class="draft" role="status">Interne V5.2-Entscheidungsfassung. Nicht veröffentlichen und
  nicht als produktiven Vertrag provisionieren. Pflichtdaten, URLs und Freigaben sind offen.</div>
  <h1>{html.escape(title)}</h1>
  <p>Version {LEGAL_VERSION}. Textquelle: ShareItToo Rechtsmappe Privat-Launch V5.2,
  SHA-256 {EXPECTED_SOURCE_SHA256}.</p>
  {rendered_sections}
</main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_pdf", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    source = args.source_pdf.resolve()
    source_bytes = source.read_bytes()
    if sha256_bytes(source_bytes) != EXPECTED_SOURCE_SHA256:
        raise SystemExit("unexpected V5.2 source PDF hash")
    if len(source_bytes) != EXPECTED_SOURCE_BYTES:
        raise SystemExit("unexpected V5.2 source PDF byte size")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages) != EXPECTED_SOURCE_PAGES:
            raise SystemExit("unexpected V5.2 source PDF page count")
        rendered_documents = []
        for document in DOCUMENTS:
            sections = page_sections(pdf, document["pages"])
            combined = "\n".join(text for _, text in sections)
            normalized_combined = re.sub(r"\s+", " ", combined)
            if document["title"] not in normalized_combined:
                raise SystemExit(f"missing V5.2 part heading {document['part']}")
            if any(marker in combined for marker in ("Teil J -", "Teil K -", "Teil L -")):
                raise SystemExit(f"internal source part leaked into user part {document['part']}")
            payload = html_document(
                part=document["part"],
                title=document["title"],
                sections=sections,
            ).encode("utf-8")
            output = args.output_dir / document["filename"]
            output.write_bytes(payload)
            rendered_documents.append({
                "part": document["part"],
                "type": document["type"],
                "path": f"assets/legal/de/v52/{document['filename']}",
                "title": document["title"],
                "version": LEGAL_VERSION,
                "contractRole": document["contractRole"],
                "sourcePages": document["pages"],
                "sha256": sha256_bytes(payload),
                "publicUrl": None,
                "downloadUrl": None,
                "status": "draft-blocked",
            })

    manifest = {
        "schemaVersion": 2,
        "version": LEGAL_VERSION,
        "status": "draft-blocked",
        "activationAllowed": False,
        "productionProvisioningAllowed": False,
        "effectiveDate": None,
        "source": {
            "title": "ShareItToo Rechtsmappe Privat-Launch V5.2",
            "fileName": "02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf",
            "date": "2026-08-16",
            "driveFileId": "1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2",
            "driveUrl": "https://drive.google.com/file/d/1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2/view",
            "createdTime": "2026-08-18T17:23:13.235Z",
            "modifiedTime": "2026-08-18T17:51:36.056Z",
            "mediaType": "application/pdf",
            "bytes": EXPECTED_SOURCE_BYTES,
            "pages": EXPECTED_SOURCE_PAGES,
            "sha256": EXPECTED_SOURCE_SHA256,
        },
        "sourceTopology": {
            "userParts": ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
            "internalPartsExcluded": ["J", "K", "L"],
        },
        "documents": rendered_documents,
        "openFacts": [
            "exactRegisteredCompany",
            "registryCourt",
            "registryNumber",
            "registeredBusinessAddressAndContact",
            "authorizedLegalRepresentative",
            "vatIdIfIssuedOrLineRemoved",
            "economicIdentificationNumberIfIssuedOrLineRemoved",
            "editorialResponsiblePersonIfApplicableOrLineRemoved",
            "withdrawalPublicUrlOrExactInAppPlacement",
            "marketplacePspNameAddressAndTermsLink",
            "marketplacePspContractRegionAndActivationEvidence",
            "smtpProviderSeatPrivacyNoticeAndSendingRegion",
            "hostingDatabaseStorageProviderSeatAndRegion",
            "googlePlacesActivationProviderAndTransferConfiguration",
            "mapsProviderDpaRegionAndTransferEvidence",
            "firebaseAuthenticationContractEntityDpaRegionAndTransferEvidence",
            "firebaseCloudMessagingContractEntityDpaRegionTransferAndRetentionEvidence",
            "firebaseCrashlyticsContractEntityDpaRegionTransferAndRetentionEvidence",
            "privacySupervisoryAuthorityConfirmedAgainstRegisteredSeat",
            "dsaContactPointOperationalEvidence",
            "publicLegalUrlsAndDownloadDelivery",
        ],
        "productDecisions": {
            "firebaseCloudMessaging": {
                "decision": "retained-transactional-only",
                "defaultEnabled": False,
                "devicePermissionRequired": True,
                "marketingPushAllowed": False,
                "shortestEventRelatedTtlRequired": True,
                "independentFromCrashlytics": True,
            },
            "firebaseCrashlytics": {
                "decision": "retained-voluntary",
                "defaultEnabled": False,
                "requiresSeparateVoluntaryOptIn": True,
                "independentFromPush": True,
                "userIdAllowed": False,
            },
            "adsMarketingAnalyticsAndExternalGenAi": {
                "decision": "disabled-unless-separately-approved",
            },
        },
        "legalReview": {
            "status": "not-professionally-reviewed",
            "professionalApprovalClaimAllowed": False,
            "preLaunchReviewRequiredBySource": False,
            "futureTriggerImplementationStatus": "open-c1h",
            "sourceDisclosure": "Entschiedene Launchfassung - keine anwaltliche Freigabe",
        },
        "boundaries": {
            "containsLivePlaceholders": True,
            "sourcePartsJToLInternalOnly": True,
            "databaseProvisioned": False,
            "publiclyPublished": False,
            "storeActivated": False,
            "realPaymentsEnabled": False,
        },
    }
    manifest_path = args.output_dir.parent / "legal_manifest_v52.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
