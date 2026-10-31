import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/services/latest_search_recompute.dart';

void main() {
  testWidgets('rapid query changes execute only the latest recompute',
      (tester) async {
    final coordinator = LatestSearchRecompute(
      debounce: const Duration(milliseconds: 450),
    );
    final calls = <int>[];

    final first = coordinator.schedule((generation) async {
      calls.add(generation);
    });
    final second = coordinator.schedule((generation) async {
      calls.add(generation);
    });

    expect(coordinator.isCurrent(first), isFalse);
    expect(coordinator.isCurrent(second), isTrue);
    await tester.pump(const Duration(milliseconds: 449));
    expect(calls, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(calls, <int>[second]);

    coordinator.dispose();
  });

  testWidgets('a maximum-length field replacement still issues one recompute',
      (tester) async {
    final coordinator = LatestSearchRecompute(
      debounce: const Duration(milliseconds: 450),
    );
    final calls = <int>[];

    for (var change = 0; change < 160; change += 1) {
      coordinator.schedule((generation) async {
        calls.add(generation);
      });
    }

    await tester.pump(const Duration(milliseconds: 449));
    expect(calls, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump();
    expect(calls, hasLength(1));

    coordinator.dispose();
  });

  testWidgets('a newer request invalidates an in-flight result',
      (tester) async {
    final coordinator = LatestSearchRecompute(
      debounce: const Duration(milliseconds: 1),
    );
    late int first;
    first = coordinator.schedule((generation) async {});
    await tester.pump(const Duration(milliseconds: 1));
    final second = coordinator.beginImmediate();

    expect(coordinator.isCurrent(first), isFalse);
    expect(coordinator.isCurrent(second), isTrue);

    coordinator.dispose();
  });

  testWidgets('dispose cancels pending work and rejects reuse', (tester) async {
    final coordinator = LatestSearchRecompute(
      debounce: const Duration(milliseconds: 1),
    );
    var calls = 0;
    coordinator.schedule((_) async {
      calls += 1;
    });
    coordinator.dispose();

    await tester.pump(const Duration(milliseconds: 2));
    expect(calls, 0);
    expect(() => coordinator.beginImmediate(), throwsStateError);
  });
}
