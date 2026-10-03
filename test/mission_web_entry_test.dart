import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/widgets/mission_web_entry.dart';

final copy = MissionWebEntryCopy(
  title: 'Vorhaben planen',
  synthetic: 'Synthetisches Beispiel',
  nonBinding: 'Unverbindlicher Plan',
  noReservation: 'Keine Reservierung',
  noGroupBooking: 'Keine Gesamtbuchung',
  unavailable: 'Mission-Einstieg derzeit nicht verfügbar',
  requiredUnits: 'Erforderliche Einheiten',
  optionalUnits: 'Optionale Einheiten',
  quantity: 'Anzahl',
  assigned: 'Zugeordnet',
  gap: 'Lücke',
  unknownFit: 'Eignung unbekannt',
  source: 'Quelle',
  correct: 'Korrigieren',
  reset: 'Ansicht zurücksetzen',
  statuses: {
    MissionWebEntryStatus.incomplete: 'Unvollständig',
    MissionWebEntryStatus.readbackRequired: 'Neuprüfung erforderlich',
    MissionWebEntryStatus.needsClarification: 'Klärung erforderlich',
  },
);
const requiredUnit = MissionWebUnitView(
  label: 'Beispielbehälter',
  quantity: 2,
  necessity: MissionWebUnitNecessity.required,
  assignment: MissionWebUnitAssignment.assigned,
);
const optionalUnit = MissionWebUnitView(
  label: 'Beispielwerkzeug',
  quantity: 1,
  necessity: MissionWebUnitNecessity.optional,
  assignment: MissionWebUnitAssignment.gap,
);
MissionWebEntryView model({
  String version = MissionWebEntryView.schemaVersion,
  bool synthetic = true,
  String source = 'Feste synthetische Quelle v1',
  MissionWebEntryStatus status = MissionWebEntryStatus.incomplete,
  List<MissionWebUnitView> units = const [requiredUnit, optionalUnit],
}) =>
    MissionWebEntryView(
      version: version,
      synthetic: synthetic,
      source: source,
      status: status,
      units: units,
    );
Widget host(
        {MissionWebEntryView? view,
        MissionWebEntryCopy? words,
        ValueChanged<int>? onCorrect,
        VoidCallback? onReset,
        MissionPickupPlan? pickupPlan,
        MissionPickupBinding? pickupBinding,
        MissionPickupCopy? pickupCopy,
        double scale = 1}) =>
    MaterialApp(
      theme: ThemeData(fontFamily: 'Roboto'),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
      home: MissionWebEntry(
          copy: words ?? copy,
          view: view,
          pickupPlan: pickupPlan,
          pickupBinding: pickupBinding,
          pickupCopy: pickupCopy,
          onCorrect: onCorrect,
          onReset: onReset),
    );

const pickupWindow = MissionPickupWindow(
    start: '2026-10-04T08:00:00Z',
    end: '2026-10-04T09:00:00Z',
    zone: 'Europe/Berlin');
MissionPickupEntry pickupEntry(int ordinal, int revision,
        {MissionPickupArea? area = MissionPickupArea.exampleA,
        MissionPickupValueStatus areaStatus =
            MissionPickupValueStatus.syntheticExample,
        MissionPickupWindow? window = pickupWindow,
        MissionPickupValueStatus timeStatus =
            MissionPickupValueStatus.syntheticExample}) =>
    MissionPickupEntry(
        componentOrdinal: ordinal,
        sourceRevision: revision,
        area: area,
        areaStatus: areaStatus,
        window: window,
        timeStatus: timeStatus);
MissionPickupPlan pickupPlan(
        {List<MissionPickupEntry>? entries,
        String version = MissionPickupPlan.schemaVersion,
        bool synthetic = true}) =>
    MissionPickupPlan(
        version: version,
        synthetic: synthetic,
        entries: entries ?? [pickupEntry(0, 1), pickupEntry(1, 2)]);
final pickupWords = MissionPickupCopy(
  title: 'Abholplanung',
  separate: 'Abholung je Komponente getrennt planen.',
  syntheticNotAgreed: 'Synthetische Beispiele, nicht vereinbart.',
  noDeliveryOrCombined: 'Keine Lieferung oder gemeinsame Abholung zugesagt.',
  unavailable: 'Abholplanung nicht verfügbar',
  area: 'Beispielbereich',
  time: 'Beispielzeitfenster',
  unknownArea: 'Bereich unbekannt',
  changedArea: 'Bereich geändert; neu prüfen',
  unknownTime: 'Zeit unbekannt',
  changedTime: 'Zeit geändert; neu prüfen',
  areas: {
    MissionPickupArea.exampleA: 'Bereich A',
    MissionPickupArea.exampleB: 'Bereich B'
  },
  windows: {
    MissionPickupWindowLabel.october4Morning:
        '4. Oktober 2026, 10–11 Uhr (Berlin)',
    MissionPickupWindowLabel.october5Afternoon:
        '5. Oktober 2026, 15–16 Uhr (Berlin)',
  },
);

void main() {
  setUpAll(() async {
    final font = FontLoader('Roboto')
      ..addFont(rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
    await font.load();
  });

  test(
      'D7 independently binds complete unique ordinals and exact positive source revisions',
      () {
    final view = model();
    final binding =
        MissionPickupBinding(display: view, sourceRevisions: [1, 2]);
    expect(pickupPlan().validFor(view, binding), true);
    expect(
        pickupPlan(entries: [pickupEntry(1, 2), pickupEntry(0, 1)])
            .validFor(view, binding),
        true);
    for (final plan in [
      pickupPlan(version: 'future'),
      pickupPlan(synthetic: false),
      pickupPlan(entries: []),
      pickupPlan(entries: [pickupEntry(0, 1)]),
      pickupPlan(entries: [pickupEntry(0, 1), pickupEntry(0, 1)]),
      pickupPlan(entries: [pickupEntry(1, 1), pickupEntry(0, 2)]),
      pickupPlan(entries: [pickupEntry(0, 0), pickupEntry(1, 2)]),
      pickupPlan(entries: [pickupEntry(0, 2), pickupEntry(1, 1)]),
      pickupPlan(entries: [pickupEntry(0, 1), pickupEntry(2, 2)]),
    ]) {
      expect(plan.validFor(view, binding), false);
    }
    expect(pickupPlan().validFor(model(), binding), false);
    expect(
        pickupPlan().validFor(
            view, MissionPickupBinding(display: view, sourceRevisions: [1])),
        false);
    expect(MissionWebEntryView.schemaVersion, 'D6-presentation-2026-10-03.1');
  });

  test(
      'D7 refuses stale positive values, malformed instants, wrong zone and reversed windows',
      () {
    final view = model();
    final binding =
        MissionPickupBinding(display: view, sourceRevisions: [1, 2]);
    for (final status in [
      MissionPickupValueStatus.unknown,
      MissionPickupValueStatus.changed
    ]) {
      expect(
          pickupPlan(entries: [
            pickupEntry(0, 1, areaStatus: status),
            pickupEntry(1, 2)
          ]).validFor(view, binding),
          false);
      expect(
          pickupPlan(entries: [
            pickupEntry(0, 1, timeStatus: status),
            pickupEntry(1, 2)
          ]).validFor(view, binding),
          false);
      expect(
          pickupPlan(entries: [
            pickupEntry(0, 1,
                areaStatus: status,
                area: null,
                timeStatus: status,
                window: null),
            pickupEntry(1, 2)
          ]).validFor(view, binding),
          true);
    }
    for (final window in [
      const MissionPickupWindow(
          start: '2026-10-04T09:00:00Z',
          end: '2026-10-04T10:00:00Z',
          zone: 'Europe/Berlin'),
      const MissionPickupWindow(
          start: 'private-address',
          end: '2026-10-04T09:00:00Z',
          zone: 'Europe/Berlin'),
      const MissionPickupWindow(
          start: '2026-10-04T08:00:00',
          end: '2026-10-04T09:00:00Z',
          zone: 'Europe/Berlin'),
      const MissionPickupWindow(
          start: '2026-10-04T08:00:00Z',
          end: '2026-10-04T09:00:00Z',
          zone: 'UTC'),
      const MissionPickupWindow(
          start: '2026-10-04T09:00:00Z',
          end: '2026-10-04T08:00:00Z',
          zone: 'Europe/Berlin'),
      const MissionPickupWindow(
          start: '2026-10-04T08:00:00Z',
          end: '2026-10-04T08:00:00Z',
          zone: 'Europe/Berlin'),
    ]) {
      expect(
          pickupPlan(entries: [
            pickupEntry(0, 1, window: window),
            pickupEntry(1, 2)
          ]).validFor(view, binding),
          false);
    }
    expect(
        pickupPlan(entries: [pickupEntry(0, 1, area: null), pickupEntry(1, 2)])
            .validFor(view, binding),
        false);
    expect(
        pickupPlan(
                entries: [pickupEntry(0, 1, window: null), pickupEntry(1, 2)])
            .validFor(view, binding),
        false);
  });

  testWidgets(
      'D7 same coarse area never merges components; invalid mapping hides all values, v1 stays unchanged',
      (tester) async {
    final view = model();
    final binding =
        MissionPickupBinding(display: view, sourceRevisions: [1, 2]);
    await tester.pumpWidget(host(
        view: view,
        pickupPlan: pickupPlan(),
        pickupBinding: binding,
        pickupCopy: pickupWords));
    expect(find.text('Bereich A'), findsNWidgets(2));
    expect(find.byKey(const ValueKey('mission-pickup-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('mission-pickup-1')), findsOneWidget);
    expect(find.text(pickupWords.noDeliveryOrCombined), findsOneWidget);
    expect(find.byType(OutlinedButton), findsNothing);
    await tester.pumpWidget(host(
        view: view,
        pickupPlan: pickupPlan(entries: [pickupEntry(0, 1)]),
        pickupBinding: binding,
        pickupCopy: pickupWords));
    expect(find.text(pickupWords.unavailable), findsOneWidget);
    expect(find.text('Bereich A'), findsNothing);
    expect(find.text(requiredUnit.label), findsOneWidget);
    await tester.pumpWidget(host(view: view));
    expect(find.text(pickupWords.separate), findsNothing);
    expect(find.text(requiredUnit.label), findsOneWidget);
  });

  test('D7 source collections are detached and immutable', () {
    final entries = [pickupEntry(0, 1), pickupEntry(1, 2)];
    final revisions = [1, 2];
    final view = model();
    final plan = pickupPlan(entries: entries);
    final binding =
        MissionPickupBinding(display: view, sourceRevisions: revisions);
    entries.clear();
    revisions.clear();
    expect(plan.validFor(view, binding), true);
    expect(() => plan.entries.clear(), throwsUnsupportedError);
    expect(() => binding.sourceRevisions.clear(), throwsUnsupportedError);
  });

  testWidgets('D7 unknown and changed render no stale positive values',
      (tester) async {
    final view = model();
    final binding =
        MissionPickupBinding(display: view, sourceRevisions: [1, 2]);
    for (final status in [
      MissionPickupValueStatus.unknown,
      MissionPickupValueStatus.changed
    ]) {
      final plan = pickupPlan(entries: [
        pickupEntry(0, 1,
            area: null, areaStatus: status, window: null, timeStatus: status),
        pickupEntry(1, 2,
            area: null, areaStatus: status, window: null, timeStatus: status),
      ]);
      await tester.pumpWidget(host(
          view: view,
          pickupPlan: plan,
          pickupBinding: binding,
          pickupCopy: pickupWords));
      expect(find.text('Bereich A'), findsNothing);
      expect(find.textContaining('2026-10-04'), findsNothing);
      expect(find.textContaining('Europe/Berlin'), findsNothing);
      for (final label in pickupWords.windows.values) {
        expect(find.text(label), findsNothing);
      }
      expect(
          find.text(status == MissionPickupValueStatus.unknown
              ? pickupWords.unknownArea
              : pickupWords.changedArea),
          findsNWidgets(2));
      expect(
          find.text(status == MissionPickupValueStatus.unknown
              ? pickupWords.unknownTime
              : pickupWords.changedTime),
          findsNWidgets(2));
    }
    await tester.pumpWidget(
        host(view: view, pickupPlan: pickupPlan(), pickupCopy: pickupWords));
    expect(find.text(pickupWords.unavailable), findsOneWidget);
    expect(find.text('Bereich A'), findsNothing);
  });

  testWidgets(
      'default unavailable retains disclosures and has no actions or units',
      (tester) async {
    await tester.pumpWidget(host());
    expect(find.text(copy.unavailable), findsOneWidget);
    for (final text in [
      copy.nonBinding,
      copy.noReservation,
      copy.noGroupBooking
    ]) {
      expect(find.text(text), findsOneWidget);
    }
    expect(find.text(requiredUnit.label), findsNothing);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets(
      'invalid or non-synthetic models fail closed without content or callbacks',
      (tester) async {
    var calls = 0;
    for (final invalid in [
      model(version: 'future'),
      model(synthetic: false),
      model(source: ''),
      model(units: []),
      model(units: [
        const MissionWebUnitView(
            label: '',
            quantity: 1,
            necessity: MissionWebUnitNecessity.required,
            assignment: MissionWebUnitAssignment.gap)
      ]),
      model(units: [
        const MissionWebUnitView(
            label: 'Invalid',
            quantity: 0,
            necessity: MissionWebUnitNecessity.required,
            assignment: MissionWebUnitAssignment.gap)
      ])
    ]) {
      await tester.pumpWidget(host(
          view: invalid, onCorrect: (_) => calls++, onReset: () => calls++));
      expect(find.text(copy.unavailable), findsOneWidget);
      expect(find.text('Invalid'), findsNothing);
      expect(find.byType(OutlinedButton), findsNothing);
    }
    expect(calls, 0);
  });

  testWidgets('required, optional, assigned, gap and unknown Fit stay separate',
      (tester) async {
    await tester.pumpWidget(host(view: model()));
    for (final label in [
      copy.requiredUnits,
      copy.optionalUnits,
      copy.assigned,
      copy.gap,
      model().source,
      'Unvollständig'
    ]) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text(copy.unknownFit), findsNWidgets(2));
    expect(find.text(copy.synthetic), findsOneWidget);
    for (final status in MissionWebEntryStatus.values) {
      await tester.pumpWidget(host(view: model(status: status)));
      expect(find.text(copy.statuses[status]!), findsOneWidget);
    }
  });

  testWidgets(
      'missing handlers hide actions and semantics; supplied handlers execute once',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(host(view: model()));
      expect(find.byType(OutlinedButton), findsNothing);
      expect(find.bySemanticsLabel(copy.correct), findsNothing);
      expect(find.bySemanticsLabel(copy.reset), findsNothing);
      expect(find.text(requiredUnit.label), findsOneWidget);
      final corrections = <int>[];
      await tester.pumpWidget(host(view: model(), onCorrect: corrections.add));
      expect(find.byKey(const ValueKey('mission-entry-reset')), findsNothing);
      final correct = find.byKey(const ValueKey('mission-entry-correct-0'));
      await tester.ensureVisible(correct);
      await tester.tap(correct);
      await tester.pump();
      expect(corrections, [0]);
      var resets = 0;
      await tester.pumpWidget(host(view: model(), onReset: () => resets++));
      expect(
          find.byKey(const ValueKey('mission-entry-correct-0')), findsNothing);
      expect(find.bySemanticsLabel(copy.correct), findsNothing);
      final reset = find.byKey(const ValueKey('mission-entry-reset'));
      await tester.ensureVisible(reset);
      await tester.tap(reset);
      await tester.pump();
      expect(resets, 1);
    } finally {
      semantics.dispose();
    }
  });

  test('view and copy detach caller-owned collections', () {
    final units = <MissionWebUnitView>[requiredUnit];
    final view = model(units: units);
    units.clear();
    expect(view.units, [requiredUnit]);
    expect(() => view.units.clear(), throwsUnsupportedError);
    final statuses = {...copy.statuses};
    final words = copy.copyWith(statuses: statuses);
    statuses.clear();
    expect(words.statuses, copy.statuses);
    expect(() => words.statuses.clear(), throwsUnsupportedError);
  });

  testWidgets('all visible copy is injected and incomplete copy fails closed',
      (tester) async {
    final alternate = copy.copyWith(
        title: 'Plan example',
        unavailable: 'Unavailable',
        nonBinding: 'Non-binding',
        noReservation: 'No reservation',
        noGroupBooking: 'No combined booking');
    await tester.pumpWidget(host(view: model(), words: alternate));
    expect(find.text('Plan example'), findsOneWidget);
    expect(find.text(copy.title), findsNothing);
    await tester.pumpWidget(
        host(view: model(), words: alternate.copyWith(statuses: {})));
    expect(find.text('Unavailable'), findsOneWidget);
    expect(find.text(requiredUnit.label), findsNothing);
  });

  for (final width in [390.0, 1440.0, 1920.0, 3840.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('layout and semantics at width $width scale $scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final semantics = tester.ensureSemantics();
        try {
          await tester.pumpWidget(host(
              view: model(), scale: scale, onCorrect: (_) {}, onReset: () {}));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(find.bySemanticsLabel(copy.title), findsOneWidget);
          await tester
              .ensureVisible(find.byKey(const ValueKey('mission-entry-reset')));
          for (final text in [
            copy.nonBinding,
            copy.noReservation,
            copy.noGroupBooking
          ]) {
            expect(
                tester.getRect(find.text(text)).top, greaterThanOrEqualTo(0));
          }
          expect(tester.takeException(), isNull);
          final content = tester
              .getRect(find.byKey(const ValueKey('mission-entry-content')));
          expect(content.width, lessThanOrEqualTo(960));
          expect(content.left, greaterThanOrEqualTo(0));
          expect(content.right, lessThanOrEqualTo(width));
        } finally {
          semantics.dispose();
        }
      });
    }
  }

  testWidgets(
      'keyboard correction, reset, replaced view and disposal clear only owned transient state',
      (tester) async {
    final corrections = <int>[];
    var resets = 0;
    final view = model();
    await tester.pumpWidget(
        host(view: view, onCorrect: corrections.add, onReset: () => resets++));
    final first = find.byKey(const ValueKey('mission-entry-correct-0'));
    await tester.ensureVisible(first);
    tester.widget<OutlinedButton>(first).focusNode!.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(corrections, [0]);
    expect(
        tester
            .widget<Semantics>(
                find.byKey(const ValueKey('mission-entry-unit-0')))
            .properties
            .selected,
        true);
    final reset = find.byKey(const ValueKey('mission-entry-reset'));
    await tester.ensureVisible(reset);
    tester.widget<OutlinedButton>(reset).focusNode!.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(resets, 1);
    expect(
        tester
            .widget<Semantics>(
                find.byKey(const ValueKey('mission-entry-unit-0')))
            .properties
            .selected,
        false);
    await tester.ensureVisible(first);
    await tester.tap(first);
    await tester.pump();
    await tester.pumpWidget(host(
        view: model(source: 'Feste synthetische Quelle v2'),
        onCorrect: corrections.add));
    expect(
        tester
            .widget<Semantics>(
                find.byKey(const ValueKey('mission-entry-unit-0')))
            .properties
            .selected,
        false);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(resets, 1);
    expect(view.units, [requiredUnit, optionalUnit]);
  });
}
