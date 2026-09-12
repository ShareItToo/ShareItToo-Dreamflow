import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/screens/v52_legal_document_screen.dart';

void main() {
  testWidgets('bundled V5.2 legal text is readable and visibly draft-blocked',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: V52LegalDocumentScreen(
          title: 'Plattformbedingungen',
          documents: [
            V52LegalAsset(
              part: 'A',
              title: 'Plattform-Nutzungsbedingungen',
              assetPath: 'assets/legal/de/v52/part_a_platform_terms.html',
            ),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('V5.2-Entwurf'), findsOneWidget);
    expect(
      find.text('Teil A – Plattform-Nutzungsbedingungen'),
      findsOneWidget,
    );
    expect(find.byType(SelectableText), findsOneWidget);
    expect(
      find.textContaining('Buchungsanfrage und Vertragsschluss'),
      findsOneWidget,
    );
  });
}
