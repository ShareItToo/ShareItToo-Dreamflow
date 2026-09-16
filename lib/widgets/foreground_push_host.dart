import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:lendify/services/backend_realtime_service.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/widgets/app_popup.dart';

class ForegroundPushHost extends StatefulWidget {
  final Widget child;
  final Stream<ForegroundPushMessage>? messages;
  final void Function(ForegroundPushMessage message)? onOpen;
  final GlobalKey<NavigatorState>? navigatorKey;
  final GlobalKey<ScaffoldMessengerState>? messengerKey;
  final Stream<void>? registrationRecoverySignals;
  final Future<bool> Function()? recoverPushRegistration;

  const ForegroundPushHost({
    super.key,
    required this.child,
    this.messages,
    this.onOpen,
    this.navigatorKey,
    this.messengerKey,
    this.registrationRecoverySignals,
    this.recoverPushRegistration,
  });

  @override
  State<ForegroundPushHost> createState() => _ForegroundPushHostState();
}

class _ForegroundPushHostState extends State<ForegroundPushHost>
    with WidgetsBindingObserver {
  StreamSubscription<ForegroundPushMessage>? _subscription;
  StreamSubscription<void>? _registrationRecoverySubscription;
  final Queue<ForegroundPushMessage> _pendingMessages = Queue();
  bool _showingMessage = false;
  bool _registrationRecoveryRunning = false;
  bool _registrationRecoveryPending = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _subscribe();
    _subscribeToRegistrationRecovery();
  }

  @override
  void didUpdateWidget(covariant ForegroundPushHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.messages != widget.messages) _subscribe();
    if (oldWidget.registrationRecoverySignals !=
        widget.registrationRecoverySignals) {
      _subscribeToRegistrationRecovery();
    }
  }

  void _subscribe() {
    unawaited(_subscription?.cancel());
    _subscription = (widget.messages ?? FirebaseRuntime.foregroundMessages)
        .listen(_showMessage);
  }

  void _subscribeToRegistrationRecovery() {
    unawaited(_registrationRecoverySubscription?.cancel());
    _registrationRecoverySubscription = (widget.registrationRecoverySignals ??
            BackendRealtimeService.authenticatedReadyEvents)
        .listen((_) => _scheduleRegistrationRecovery());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _scheduleRegistrationRecovery();
    }
  }

  void _scheduleRegistrationRecovery() {
    if (_registrationRecoveryRunning) {
      _registrationRecoveryPending = true;
      return;
    }
    _registrationRecoveryRunning = true;
    unawaited(_runRegistrationRecovery());
  }

  Future<void> _runRegistrationRecovery() async {
    try {
      do {
        _registrationRecoveryPending = false;
        final recover = widget.recoverPushRegistration;
        if (recover == null) {
          await FirebaseRuntime.syncPushRegistration();
        } else {
          await recover();
        }
      } while (mounted && _registrationRecoveryPending);
    } catch (error) {
      debugPrint('[ForegroundPushHost] registration recovery failed: $error');
    } finally {
      _registrationRecoveryRunning = false;
    }
  }

  void _showMessage(ForegroundPushMessage message) {
    _pendingMessages.add(message);
    _presentNextMessage();
  }

  void _presentNextMessage() {
    if (_showingMessage || _pendingMessages.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _showingMessage || _pendingMessages.isEmpty) return;
      final presentationContext =
          widget.navigatorKey?.currentState?.overlay?.context ??
              (Navigator.maybeOf(context) == null ? null : context);
      if (presentationContext == null) {
        _presentNextMessage();
        return;
      }
      final message = _pendingMessages.removeFirst();
      _showingMessage = true;
      unawaited(
        AppPopup.showCustom<void>(
          presentationContext,
          icon: Icons.notifications_active_outlined,
          title: message.title,
          showCloseIcon: true,
          showAccentLine: true,
          body: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Semantics(
                liveRegion: true,
                label: 'Benachrichtigung: ${message.title}. ${message.body}',
                child: Text(message.body),
              ),
              if (message.actionUri != null) ...[
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: () {
                    Navigator.of(
                      presentationContext,
                      rootNavigator: true,
                    ).maybePop();
                    (widget.onOpen ?? FirebaseRuntime.openForegroundMessage)(
                      message,
                    );
                  },
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: const Text('Öffnen'),
                ),
              ],
            ],
          ),
        ).whenComplete(() {
          _showingMessage = false;
          if (mounted) _presentNextMessage();
        }),
      );
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_subscription?.cancel());
    unawaited(_registrationRecoverySubscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
