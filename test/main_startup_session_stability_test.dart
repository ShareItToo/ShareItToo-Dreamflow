import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/main.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('a parent rebuild cannot restart a pending startup session read',
      (tester) async {
    final preview = DeveloperPreviewController();
    await preview.loadFromPrefs();
    addTearDown(preview.dispose);

    final heldSession = Completer<AuthSession?>();
    var calls = 0;
    final hostKey = GlobalKey<_RebuildHostState>();

    await tester.pumpWidget(
      ChangeNotifierProvider<DeveloperPreviewController>.value(
        value: preview,
        child: MaterialApp(
          home: _RebuildHost(
            key: hostKey,
            child: AppRoot(
              sessionLoader: () {
                calls += 1;
                return heldSession.future;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(calls, 1);
    expect(find.bySemanticsLabel('ShareItToo lädt'), findsOneWidget);

    hostKey.currentState!.rebuild();
    await tester.pump();

    expect(calls, 1);
    // Keep the load deliberately pending: this test owns only the invariant
    // that a parent rebuild cannot issue a second read. Disposing the subtree
    // avoids entering the unrelated first-launch flow and its real timer.
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}

class _RebuildHost extends StatefulWidget {
  final Widget child;

  const _RebuildHost({super.key, required this.child});

  @override
  State<_RebuildHost> createState() => _RebuildHostState();
}

class _RebuildHostState extends State<_RebuildHost> {
  void rebuild() => setState(() {});

  @override
  Widget build(BuildContext context) => widget.child;
}
