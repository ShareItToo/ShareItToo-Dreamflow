import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/owner_acceptance_deadline_policy.dart';
import 'package:lendify/widgets/owner_request_inline_actions.dart';

import 'support/test_builders.dart';

void main() {
  final now = DateTime.utc(2026, 10, 26, 12);

  group('remote owner acceptance deadline', () {
    test('missing, expired and exact-deadline values fail closed', () {
      expect(
        OwnerAcceptanceDeadlinePolicy.isValid(
          simulationOnly: false,
          requiresRemoteDeadline: true,
          deadline: null,
          now: now,
        ),
        isFalse,
      );
      for (final deadline in [
        now.subtract(const Duration(microseconds: 1)),
        now,
      ]) {
        expect(
          OwnerAcceptanceDeadlinePolicy.isValid(
            simulationOnly: false,
            requiresRemoteDeadline: true,
            deadline: deadline,
            now: now,
          ),
          isFalse,
        );
      }
    });

    test('future deadline stays valid; simulation and QA keep their local rule',
        () {
      expect(
        OwnerAcceptanceDeadlinePolicy.isValid(
          simulationOnly: false,
          requiresRemoteDeadline: true,
          deadline: now.add(const Duration(microseconds: 1)),
          now: now,
        ),
        isTrue,
      );
      expect(
        OwnerAcceptanceDeadlinePolicy.isValid(
          simulationOnly: true,
          requiresRemoteDeadline: true,
          deadline: null,
          now: now,
        ),
        isTrue,
      );
      expect(
        OwnerAcceptanceDeadlinePolicy.isValid(
          simulationOnly: false,
          requiresRemoteDeadline: false,
          deadline: null,
          now: now,
        ),
        isTrue,
      );
    });
  });

  testWidgets('blocked acceptance explains why while decline stays usable',
      (tester) async {
    for (final scenario in [
      (
        deadline: null,
        message:
            'Die verbindliche Annahmefrist fehlt. Diese Anfrage kann nicht angenommen werden; bitte lade die Ansicht neu.',
      ),
      (
        deadline: now.subtract(const Duration(seconds: 1)),
        message:
            'Die 30-Minuten-Annahmefrist ist abgelaufen. Diese Anfrage kann nicht mehr angenommen werden.',
      ),
    ]) {
      var accepts = 0;
      var declines = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OwnerRequestInlineActions(
              request: buildTestRequest(
                id: 'request-deadline',
                itemId: 'item-deadline',
                ownerId: 'owner',
                renterId: 'renter',
                status: 'pending',
              ).copyWith(bindingExpiresAt: scenario.deadline),
              requiresRemoteDeadline: true,
              now: now,
              onAccept: () => accepts += 1,
              onDecline: () => declines += 1,
            ),
          ),
        ),
      );

      final acceptButton = tester.widget<TextButton>(
        find.byKey(const ValueKey('owner-request-accept')),
      );
      final declineButton = tester.widget<TextButton>(
        find.byKey(const ValueKey('owner-request-decline')),
      );
      expect(acceptButton.onPressed, isNull);
      expect(declineButton.onPressed, isNotNull);
      expect(find.text(scenario.message), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('owner-request-decline')));
      await tester.pump();
      expect(declines, 1);
      expect(accepts, 0);
    }
  });

  testWidgets('valid and simulated requests keep inline acceptance active',
      (tester) async {
    for (final scenario in [
      (
        id: 'valid',
        simulationOnly: false,
        requiresRemoteDeadline: true,
        deadline: now.add(const Duration(minutes: 1)),
      ),
      (
        id: 'simulation',
        simulationOnly: true,
        requiresRemoteDeadline: true,
        deadline: null,
      ),
      (
        id: 'qa',
        simulationOnly: false,
        requiresRemoteDeadline: false,
        deadline: null,
      ),
    ]) {
      var accepts = 0;
      var declines = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: OwnerRequestInlineActions(
              request: buildTestRequest(
                id: scenario.id,
                itemId: 'item-${scenario.id}',
                ownerId: 'owner',
                renterId: 'renter',
                status: 'pending',
              ).copyWith(
                bindingExpiresAt: scenario.deadline,
                simulationOnly: scenario.simulationOnly,
              ),
              requiresRemoteDeadline: scenario.requiresRemoteDeadline,
              now: now,
              onAccept: () => accepts += 1,
              onDecline: () => declines += 1,
            ),
          ),
        ),
      );

      expect(
        tester
            .widget<TextButton>(
              find.byKey(const ValueKey('owner-request-accept')),
            )
            .onPressed,
        isNotNull,
      );
      await tester.tap(find.byKey(const ValueKey('owner-request-accept')));
      await tester.pump();
      expect(accepts, 1);
      expect(declines, 0);
    }
  });
}
