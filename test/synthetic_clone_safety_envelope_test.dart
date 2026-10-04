import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/config/synthetic_clone_config.dart';
import 'package:lendify/widgets/synthetic_clone_non_binding_banner.dart';

void main() {
  test(
    'synthetic clone is false by default and invalid profiles fail closed',
    () {
      expect(SyntheticCloneConfig.requested, isFalse);
      expect(isSyntheticCloneNonBinding, isFalse);
      expect(SyntheticCloneConfig.configurationError, isNull);
      expect(
        SyntheticCloneConfig.reviewActionsAvailableFor(syntheticClone: true),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.reviewActionsAvailableFor(syntheticClone: false),
        isTrue,
      );

      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: false,
          releaseChannel: 'internal',
          apiBaseUrl: 'https://clone.example.invalid/api/v1',
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'production',
          apiBaseUrl: 'https://clone.example.invalid/api/v1',
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'qa',
          apiBaseUrl: SyntheticCloneConfig.isolatedLocalQaEndpoint,
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'internal',
          apiBaseUrl: 'http://clone.example.invalid/api/v1',
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'internal',
          apiBaseUrl: 'https:///api/v1',
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'internal',
          apiBaseUrl: 'https://clone.example.invalid/api/v1',
        ),
        isFalse,
      );
      expect(
        SyntheticCloneConfig.configurationAllowed(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'internal',
          apiBaseUrl: SyntheticCloneConfig.isolatedLocalQaEndpoint,
        ),
        isTrue,
      );
      expect(
        () => SyntheticCloneConfig.validateBuild(
          requested: true,
          backendEnabled: true,
          releaseChannel: 'internal',
          apiBaseUrl: 'https://clone.example.invalid/api/v1',
        ),
        throwsStateError,
      );
    },
  );

  testWidgets('persistent banner remains visible across pushed routes', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => buildSyntheticCloneMaterialAppShell(
          child: child,
          enabledOverride: true,
        ),
        home: Scaffold(
          body: Center(
            child: Builder(
              builder: (context) => FilledButton(
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    builder: (_) => const Scaffold(
                      body: Center(child: Text('Pushed clone route')),
                    ),
                  ),
                ),
                child: const Text('Open clone route'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.text(syntheticCloneNonBindingBannerText), findsOneWidget);

    await tester.tap(find.text('Open clone route'));
    await tester.pumpAndSettle();
    expect(find.text('Pushed clone route'), findsOneWidget);
    expect(find.text(syntheticCloneNonBindingBannerText), findsOneWidget);
  });

  testWidgets('banner stays absent when the override is disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => buildSyntheticCloneMaterialAppShell(
          child: child,
          enabledOverride: false,
        ),
        home: const Scaffold(body: Text('Normal route')),
      ),
    );
    await tester.pump();
    expect(find.text('Normal route'), findsOneWidget);
    expect(find.text(syntheticCloneNonBindingBannerText), findsNothing);
  });
}
