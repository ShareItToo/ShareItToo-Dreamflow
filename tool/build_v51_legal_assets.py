#!/usr/bin/env python3
"""Build fail-closed V5.1 legal HTML assets from the exact reviewed PDF."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pdfplumber


EXPECTED_SOURCE_SHA256 = "587bfd9e53539e5895c3d9dcb6fc437e0bf7c6e91db144841d0fe986b274b3fc"
LEGAL_VERSION = "V5.1-2026-08-16"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def clean_page(pdf: pdfplumber.PDF, page_number: int) -> str:
    text = pdf.pages[page_number - 1].extract_text() or ""
    text = text.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    lines = [line.rstrip() for line in text.splitlines()]
    if lines and lines[0].startswith("ShareItToo | Rechtsmappe Privat-Launch V5.1"):
        lines.pop(0)
    if lines and re.fullmatch(
        r"Gründungsvorhaben ShareItToo - geplante UG \(haftungsbeschränkt\) Seite \d+",
        lines[-1].strip(),
    ):
        lines.pop()
    return "\n".join(lines).strip()


def page_sections(pdf: pdfplumber.PDF, page_numbers: list[int]) -> list[tuple[int, str]]:
    return [(number, clean_page(pdf, number)) for number in page_numbers]


def clipped_sections(
    pdf: pdfplumber.PDF,
    page_numbers: list[int],
    *,
    start_marker: str | None = None,
    end_marker: str | None = None,
) -> list[tuple[int, str]]:
    sections = page_sections(pdf, page_numbers)
    joined = "\n\f\n".join(text for _, text in sections)
    if start_marker:
        start = joined.find(start_marker)
        if start < 0:
            raise ValueError(f"start marker missing: {start_marker}")
        joined = joined[start:]
    if end_marker:
        end = joined.find(end_marker)
        if end < 0:
            raise ValueError(f"end marker missing: {end_marker}")
        joined = joined[:end].rstrip()
    parts = joined.split("\n\f\n")
    first_index = 0
    if start_marker:
        for index, (_, text) in enumerate(sections):
            if start_marker in text:
                first_index = index
                break
    numbers = [number for number, _ in sections[first_index:first_index + len(parts)]]
    return list(zip(numbers, parts, strict=True))


def html_document(title: str, sections: list[tuple[int, str]]) -> str:
    rendered_sections = "\n".join(
        "<section class=\"source-page\" data-source-page=\"{}\">"
        "<div class=\"page-label\">Quelle: Seite {}</div>"
        "<pre>{}</pre></section>".format(
            page,
            page,
            html.escape(text, quote=True),
        )
        for page, text in sections
    )
    return f"""<!doctype html>
<html lang="de" data-legal-version="{LEGAL_VERSION}" data-activation-allowed="false">
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
  </style>
</head>
<body>
<main>
  <div class="draft">Interne V5.1-Entscheidungsfassung. Nicht veröffentlichen und nicht als
  produktiven Vertrag provisionieren, solange die Pflichtangaben im Manifest offen sind.</div>
  <h1>{html.escape(title)}</h1>
  <p>Version {LEGAL_VERSION}. Textquelle: ShareItToo Rechtsmappe Privat-Launch V5.1,
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
    actual_hash = sha256_bytes(source_bytes)
    if actual_hash != EXPECTED_SOURCE_SHA256:
        raise SystemExit("unexpected V5.1 source PDF hash")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(source) as pdf:
        if len(pdf.pages) != 54:
            raise SystemExit("unexpected V5.1 source PDF page count")
        documents = {
            "platform_terms_v5.html": (
                "SIT-Plattformbedingungen V5.1",
                page_sections(pdf, list(range(8, 19)) + list(range(29, 35))),
            ),
            "private_rental_terms_v5.html": (
                "Privat-Mietbedingungen V5.1",
                page_sections(pdf, list(range(19, 29))),
            ),
            "cancellation_v5.html": (
                "Storno-, No-Show- und Refund-Regelwerk V5.1",
                page_sections(pdf, [24, 25]),
            ),
            "community_moderation_v5.html": (
                "Community-, Sicherheits-, Melde- und Moderationsregeln V5.1",
                page_sections(pdf, [32, 33, 34]),
            ),
            "privacy_v5.html": (
                "Datenschutzerklärung V5.1",
                page_sections(pdf, list(range(35, 41))),
            ),
            "imprint_v5.html": (
                "Impressum V5.1",
                clipped_sections(
                    pdf,
                    [41],
                    start_marker="1. Impressum nach § 5 DDG",
                    end_marker="2. Widerrufsbelehrung für die entgeltliche Plattformleistung",
                ),
            ),
            "withdrawal_v5.html": (
                "Widerrufsbelehrung und Musterformular V5.1",
                clipped_sections(
                    pdf,
                    [41, 42, 43],
                    start_marker="2. Widerrufsbelehrung für die entgeltliche Plattformleistung",
                ),
            ),
        }

    manifest_documents = []
    for filename, (title, sections) in documents.items():
        output = args.output_dir / filename
        payload = html_document(title, sections).encode("utf-8")
        output.write_bytes(payload)
        manifest_documents.append({
            "type": filename.removesuffix("_v5.html"),
            "path": f"assets/legal/de/{filename}",
            "title": title,
            "version": LEGAL_VERSION,
            "sourcePages": [page for page, _ in sections],
            "sha256": sha256_bytes(payload),
            "publicUrl": None,
            "downloadUrl": None,
            "status": "draft-blocked",
        })

    manifest = {
        "schemaVersion": 1,
        "version": LEGAL_VERSION,
        "status": "draft-blocked",
        "activationAllowed": False,
        "productionProvisioningAllowed": False,
        "effectiveDate": None,
        "source": {
            "title": "ShareItToo Rechtsmappe Privat-Launch V5.1",
            "date": "2026-08-16",
            "pages": 54,
            "sha256": EXPECTED_SOURCE_SHA256,
        },
        "documents": manifest_documents,
        "openFacts": [
            "exactRegisteredCompany",
            "registryCourt",
            "registryNumber",
            "vatIdIfIssued",
            "economicIdentificationNumberIfIssued",
            "editorialResponsiblePersonIfApplicable",
            "withdrawalPublicUrl",
            "hostingProviderAndRegion",
            "smtpProviderAndRegion",
            "mapsProviderAndRegion",
            "licensedMarketplacePspContractAndRegion",
            "firebasePushAndCrashProviderTransferEvidence",
        ],
        "productDecisions": {
            "firebaseCloudMessaging": {
                "decision": "retained",
                "defaultEnabled": False,
                "requiresSeparateVoluntaryOptIn": True,
                "independentFromCrashlytics": True,
            },
            "firebaseCrashlytics": {
                "decision": "retained",
                "defaultEnabled": False,
                "requiresSeparateVoluntaryOptIn": True,
                "independentFromPush": True,
            },
            "adsMarketingAnalyticsAndExternalGenAi": {
                "decision": "disabled-unless-separately-approved",
            },
        },
        "knownConflicts": [
            {
                "id": "firebase-push-crash-retained-after-v51-source",
                "sourcePages": [38],
                "sourcePosition": "Teil H Nummer 15-16",
                "status": "blocks-activation",
                "successorDecisionDate": "2026-08-17",
                "resolutionRequired": (
                    "Revise the privacy text and complete provider, transfer, consent, "
                    "retention, deletion, and Store disclosure evidence before activation."
                ),
            },
        ],
        "boundaries": {
            "containsLivePlaceholders": True,
            "databaseProvisioned": False,
            "publiclyPublished": False,
            "storeActivated": False,
            "realPaymentsEnabled": False,
        },
    }
    manifest_path = args.output_dir / "legal_manifest_v5.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
