import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/services/privacy_export_file_store.dart';

class PrivacyExportCacheLifecycleHost extends StatefulWidget {
  final Widget child;
  final PrivacyExportFileStore fileStore;

  const PrivacyExportCacheLifecycleHost({
    super.key,
    required this.child,
    this.fileStore = const PrivacyExportFileStore(),
  });

  @override
  State<PrivacyExportCacheLifecycleHost> createState() =>
      _PrivacyExportCacheLifecycleHostState();
}

class _PrivacyExportCacheLifecycleHostState
    extends State<PrivacyExportCacheLifecycleHost> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_purge());
    }
  }

  Future<void> _purge() async {
    try {
      await widget.fileStore.purgeRetainedCopies();
    } catch (_) {
      debugPrint('[PrivacyExportCache] retained-copy cleanup failed');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
