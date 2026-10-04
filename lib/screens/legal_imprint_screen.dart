import 'package:flutter/material.dart';
import 'package:lendify/config/consumer_dispute_config.dart';
import 'package:lendify/config/draft_operator_config.dart';
import 'package:lendify/config/legal_provider_config.dart';
import 'package:lendify/screens/legal_detail_scaffold.dart';

class LegalImprintScreen extends StatelessWidget {
  const LegalImprintScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final approved = LegalProviderConfig.hasCompleteApprovedIdentity;
    return LegalDetailScaffold(
      title: 'Impressum',
      intro: approved
          ? 'Hier findest du die Anbieterkennzeichnung sowie Kontaktinformationen.'
          : 'Diese interne Testversion ist nicht für öffentliche Verbrauchertransaktionen bestimmt. Die bestätigten Betreiberangaben gelten nur für den gesperrten Entwurf; die Anbieterkennzeichnung wird vor einem öffentlichen Start rechtlich geprüft und vollständig eingesetzt.',
      sections: [
        LegalSectionCard(
          icon: Icons.apartment_outlined,
          title: 'Anbieter',
          badge: approved ? null : 'Interner Test',
          children: [
            LegalParagraph(
              approved
                  ? '${LegalProviderConfig.providerName}\n${LegalProviderConfig.providerAddress}'
                  : DraftOperatorConfig.readinessText,
            ),
            if (approved) ...[
              const SizedBox(height: 12),
              LegalParagraph(
                'Vertretungsberechtigt: ${LegalProviderConfig.representative}',
              ),
            ],
          ],
        ),
        if (!approved)
          const LegalSectionCard(
            icon: Icons.lock_outline,
            title: 'Startgrenze',
            badge: 'Interne Vorbereitung',
            children: [
              LegalParagraph(DraftOperatorConfig.internalOnlyText),
              SizedBox(height: 10),
              LegalParagraph(
                'Register-, Steuer-, Rechtsprüfungs-, DSA-, Datenschutz- und '
                'Vertragsfragen bleiben offen. Es wird keine öffentliche '
                'Anbieterkennzeichnung oder kommerzielle Betriebsfreigabe '
                'behauptet.',
              ),
            ],
          ),
        LegalSectionCard(
          icon: Icons.contact_mail_outlined,
          title: 'Kontakt',
          children: [
            const CopyableLine(
              icon: Icons.mail_outline,
              label: 'E‑Mail',
              value: LegalProviderConfig.contactEmail,
              toastTitle: 'E‑Mail kopiert',
            ),
            if (approved &&
                LegalProviderConfig.contactPhone.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              const CopyableLine(
                icon: Icons.phone_outlined,
                label: 'Telefon',
                value: LegalProviderConfig.contactPhone,
                toastTitle: 'Telefonnummer kopiert',
              ),
            ],
          ],
        ),
        if (approved)
          const LegalSectionCard(
            icon: Icons.edit_document,
            title: 'Verantwortlich für den Inhalt',
            children: [
              LegalParagraph(
                'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:',
              ),
              SizedBox(height: 10),
              LegalParagraph(LegalProviderConfig.contentResponsible),
            ],
          ),
        LegalSectionCard(
          icon: Icons.balance_outlined,
          title: 'Verbraucherstreitbeilegung',
          children: [
            LegalParagraph(ConsumerDisputeConfig.generalInformationText),
          ],
        ),
      ],
    );
  }
}
