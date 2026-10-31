import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/local_state_error_panel.dart';

void main() {
  testWidgets('retry stays a separate accessible action below live error text',
      (tester) async {
    final semantics = tester.ensureSemantics();
    var retries = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LocalStateErrorPanel(
            title: 'Synthetic load error',
            message: 'Data remains unchanged.',
            semanticLabel:
                'Synthetic load error. Data remains unchanged. Retry.',
            onRetry: () => retries += 1,
          ),
        ),
      ),
    );

    expect(
      find.bySemanticsLabel(
        'Synthetic load error. Data remains unchanged. Retry.',
      ),
      findsOneWidget,
    );
    final retry = find.bySemanticsLabel('Erneut laden');
    expect(retry, findsOneWidget);
    expect(
      tester.getSemantics(retry),
      matchesSemantics(
        label: 'Erneut laden',
        hasTapAction: true,
        hasFocusAction: true,
        hasEnabledState: true,
        isEnabled: true,
        isButton: true,
        isFocusable: true,
      ),
    );

    await tester.tap(retry);
    await tester.pump();
    expect(retries, 1);
    semantics.dispose();
  });
}
