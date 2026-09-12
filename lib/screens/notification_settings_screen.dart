import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/services/firebase_runtime.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/firebase_service_preferences.dart';
import 'package:lendify/services/notification_preferences_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

class NotificationSettingsScreen extends StatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  State<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends State<NotificationSettingsScreen> {
  bool _loading = true;
  bool _loadFailed = false;
  bool _serviceBusy = false;
  NotificationPreferences _prefs = NotificationPreferences.defaults();
  FirebaseServicePreferences _servicePrefs =
      FirebaseServicePreferences.defaults;
  StreamSubscription<String>? _persistenceSubscription;
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();
  TrackedDialogRouteHandle<void>? _activeServiceDialog;
  int? _serviceDialogEpoch;

  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
    _persistenceSubscription = SharedPersistenceSync.changes.listen((key) {
      if (!mounted || key != SharedPersistenceSync.localSafetyPrivacyStateKey) {
        return;
      }
      final activeDialog = _activeServiceDialog;
      if (activeDialog != null &&
          _serviceDialogEpoch != AuthService.sessionEpoch) {
        activeDialog.dismiss();
      }
      unawaited(_refreshCoordinator.schedule(() async {
        await SharedPersistenceSync.reloadPreferences();
        if (mounted) await _load();
      }));
    });
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _refreshCoordinator.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
      _prefs = NotificationPreferences.defaults();
    });
    try {
      final prefs = await NotificationPreferencesService.get();
      final servicePrefs = await FirebaseServicePreferencesStore.read();
      if (!mounted) return;
      setState(() {
        _prefs = prefs;
        _servicePrefs = servicePrefs;
      });
    } catch (e) {
      debugPrint('[NotificationSettingsScreen] load failed: $e');
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save(NotificationPreferences next) async {
    setState(() => _prefs = next);
    await NotificationPreferencesService.set(next);
  }

  Future<bool> _confirmService({
    required IconData icon,
    required String title,
    required String message,
    required String confirmLabel,
    required int interactionEpoch,
  }) async {
    if (_activeServiceDialog != null) return false;
    var confirmed = false;
    final handle = TrackedDialogRouteHandle<void>();
    _activeServiceDialog = handle;
    _serviceDialogEpoch = interactionEpoch;
    await AppPopup.show(
      context,
      icon: icon,
      title: title,
      message: message,
      barrierDismissible: false,
      routeHandle: handle,
      actions: [
        OutlinedButton(
          onPressed: () => handle.dismiss(),
          child: const Text('Nicht aktivieren'),
        ),
        FilledButton(
          onPressed: () {
            confirmed = true;
            handle.dismiss();
          },
          child: Text(confirmLabel),
        ),
      ],
    );
    if (identical(_activeServiceDialog, handle)) {
      _activeServiceDialog = null;
      _serviceDialogEpoch = null;
    }
    return confirmed && interactionEpoch == AuthService.sessionEpoch;
  }

  Future<void> _showServiceError({
    required String title,
    required String message,
    required int interactionEpoch,
  }) async {
    if (_activeServiceDialog != null ||
        interactionEpoch != AuthService.sessionEpoch) {
      return;
    }
    final handle = TrackedDialogRouteHandle<void>();
    _activeServiceDialog = handle;
    _serviceDialogEpoch = interactionEpoch;
    await AppPopup.error(
      context,
      title: title,
      message: message,
      routeHandle: handle,
    );
    if (identical(_activeServiceDialog, handle)) {
      _activeServiceDialog = null;
      _serviceDialogEpoch = null;
    }
  }

  Future<void> _setPushEnabled(bool enabled) async {
    if (_serviceBusy) return;
    final interactionEpoch = AuthService.sessionEpoch;
    if (enabled) {
      final confirmed = await _confirmService(
        icon: Icons.notifications_active_outlined,
        title: 'Push-Mitteilungen aktivieren?',
        message:
            'Firebase Cloud Messaging von Google verarbeitet eine technische Installationskennung und den Geräte-Token, damit SIT dir wichtige Buchungs- und Nachrichtenhinweise zustellen kann. Die Verarbeitung kann weltweit erfolgen. Du kannst Push hier jederzeit wieder ausschalten.',
        confirmLabel: 'Push aktivieren',
        interactionEpoch: interactionEpoch,
      );
      if (!confirmed || !mounted) return;
    }
    if (interactionEpoch != AuthService.sessionEpoch) return;
    setState(() => _serviceBusy = true);
    final success = await FirebaseRuntime.setPushEnabled(
      enabled,
      expectedSessionEpoch: interactionEpoch,
    );
    if (!mounted) return;
    if (interactionEpoch != AuthService.sessionEpoch) {
      setState(() => _serviceBusy = false);
      return;
    }
    if (enabled && !success) {
      await _showServiceError(
        title: 'Push noch nicht verbunden',
        message:
            'Deine Einwilligung ist gespeichert. Die Zustellung konnte noch nicht sicher eingerichtet werden. ShareItToo versucht es bei einer bestätigten Verbindung oder beim nächsten Öffnen der App erneut.',
        interactionEpoch: interactionEpoch,
      );
    }
    if (!mounted) return;
    if (interactionEpoch != AuthService.sessionEpoch) {
      setState(() => _serviceBusy = false);
      return;
    }
    await _load();
    if (mounted) setState(() => _serviceBusy = false);
  }

  Future<void> _setCrashDiagnosticsEnabled(bool enabled) async {
    if (_serviceBusy) return;
    final interactionEpoch = AuthService.sessionEpoch;
    if (enabled) {
      final confirmed = await _confirmService(
        icon: Icons.bug_report_outlined,
        title: 'Freiwillige Crashdiagnose aktivieren?',
        message:
            'Firebase Crashlytics von Google erhält technische Installations-, Sitzungs-, Geräte-, App-, Absturz- und Diagnosedaten, damit SIT Fehler beheben kann. Es werden keine Werbe-ID und keine SIT-Nutzerkennung übermittelt. Beim Ausschalten oder bei einer Kontolöschung löscht SIT ungesendete Berichte auf diesem Gerät und fordert die Löschung der Firebase-Installation an. Bereits gesendete Crashdaten bleiben nach Angaben des Anbieters 90 Tage gespeichert, bevor deren Entfernung beginnt; SIT kann sie ohne übermittelte SIT-Nutzerkennung keinem Konto zuordnen und nicht kontobezogen vorzeitig löschen. Die Verarbeitung kann weltweit erfolgen. Du kannst die Diagnose hier jederzeit wieder ausschalten.',
        confirmLabel: 'Crashdiagnose aktivieren',
        interactionEpoch: interactionEpoch,
      );
      if (!confirmed || !mounted) return;
    }
    if (interactionEpoch != AuthService.sessionEpoch) return;
    setState(() => _serviceBusy = true);
    await FirebaseRuntime.setCrashDiagnosticsEnabled(enabled);
    if (!mounted) return;
    await _load();
    if (mounted) setState(() => _serviceBusy = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final titleStyle =
        theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800);
    final bodyStyle =
        theme.textTheme.bodyMedium?.copyWith(color: AppTheme.textBody(context));
    final captionStyle = theme.textTheme.labelSmall
        ?.copyWith(color: AppTheme.textSecondary(context), height: 1.35);
    final topInset = MediaQuery.paddingOf(context).top;

    return Stack(
      children: [
        Positioned.fill(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(color: Colors.black.withValues(alpha: 0.35)),
          ),
        ),
        Scaffold(
          extendBodyBehindAppBar: true,
          backgroundColor: Colors.transparent,
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            surfaceTintColor: Colors.transparent,
            title: const SizedBox.shrink(),
            centerTitle: true,
            leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back, size: 22),
              color: Colors.white.withValues(alpha: 0.92),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            actions: [
              IconButton(
                tooltip: 'Zurücksetzen',
                icon: Icon(Icons.refresh_rounded,
                    size: 20, color: Colors.white.withValues(alpha: 0.82)),
                onPressed: () async {
                  await NotificationPreferencesService.reset();
                  if (!mounted) return;
                  await _load();
                },
              ),
              const SizedBox(width: 6),
            ],
          ),
          body: _loading
              ? const Center(child: CircularProgressIndicator())
              : _loadFailed
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.gpp_maybe_outlined, size: 42),
                            const SizedBox(height: 12),
                            const Text(
                              'Benachrichtigungseinstellungen konnten nicht sicher geladen werden.',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              height: 48,
                              child: FilledButton.icon(
                                onPressed: _load,
                                icon: const Icon(Icons.refresh),
                                label: const Text('Erneut versuchen'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView(
                      padding: EdgeInsets.fromLTRB(
                          16, topInset + kToolbarHeight - 2, 16, 20),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(4, 2, 4, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Benachrichtigungseinstellungen',
                                  style: theme.textTheme.titleLarge
                                      ?.copyWith(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 6),
                              Text(
                                  'Bestimme, welche Ereignisse in deinem Benachrichtigungs‑Feed angezeigt werden.',
                                  style: bodyStyle),
                              const SizedBox(height: 8),
                              Text(
                                  'Wichtig/Sicherheit bleiben immer sichtbar. Buchungen filtern Anfragen, Annahmen sowie Übergabe- und Rückgabe-Updates. Nachrichten filtern normale Chats, Support-Fälle nur Support-Updates, Zahlungen Zahlungs-/Erstattungsinfos, Bewertungen Review-Updates und System Produkt-/Wartungshinweise.',
                                  style: captionStyle),
                            ],
                          ),
                        ),
                        _Section(
                          title: 'Feed steuern',
                          description:
                              'Wähle, welche Kategorien im Benachrichtigungsfeed angezeigt werden.',
                          child: Column(
                            children: [
                              _SettingToggleTile(
                                icon: Icons.error_outline,
                                title: 'Wichtig',
                                description:
                                    'Zeigt dringende Hinweise und wichtige Ereignisse.',
                                value: true,
                                enabled: false,
                                onChanged: null,
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.calendar_month_outlined,
                                title: 'Buchungen',
                                description:
                                    'Anfragen, Annahmen, Stornierungen und Statusänderungen.',
                                value: _prefs.showBookings,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showBookings: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.swap_horiz_rounded,
                                title: 'Übergabe & Rückgabe',
                                description:
                                    'Erinnerungen, Zeitbestätigungen, QR-Code und Rückgabehinweise.',
                                value: _prefs.showBookings,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showBookings: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.chat_bubble_outline,
                                title: 'Nachrichten',
                                description:
                                    'Neue Chat-Nachrichten und Antworten.',
                                value: _prefs.showMessages,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showMessages: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.support_agent_outlined,
                                title: 'Support-Fälle',
                                description:
                                    'Updates zu gemeldeten Problemen und Support-Anfragen.',
                                value: _prefs.showSupport,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showSupport: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.payments_outlined,
                                title: 'Zahlungen',
                                description:
                                    'Zahlungen, Rückerstattungen, Auszahlungen und Gebühren.',
                                value: _prefs.showPayments,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showPayments: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.star_outline,
                                title: 'Bewertungen',
                                description:
                                    'Neue Bewertungen und Erinnerungen zur Bewertung.',
                                value: _prefs.showReviews,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showReviews: v)),
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.verified_user_outlined,
                                title: 'Sicherheit & Verifizierung',
                                description:
                                    'Verifizierung, Sicherheitschecks und wichtige Schutz-Hinweise.',
                                value: true,
                                enabled: false,
                                onChanged: null,
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.info_outline,
                                title: 'System',
                                description:
                                    'Plattform-Updates und Wartungshinweise.',
                                value: _prefs.showSystem,
                                enabled: true,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(showSystem: v)),
                                accent: accent,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _Section(
                          title: 'Darstellung',
                          child: Column(
                            children: [
                              _SimpleToggleRow(
                                icon: Icons.view_agenda_outlined,
                                title: 'Nach Kategorien gruppieren',
                                subtitle:
                                    'Sortiert Benachrichtigungen nach Themen.',
                                value: _prefs.groupByCategory,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(groupByCategory: v)),
                                accent: accent,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _Section(
                          title: 'Sortierung',
                          child: Column(
                            children: [
                              _SimpleToggleRow(
                                icon: Icons.low_priority,
                                title: 'Ungelesene zuerst anzeigen',
                                subtitle:
                                    'Zeigt neue Benachrichtigungen zuerst.',
                                value: _prefs.unreadFirst,
                                onChanged: (v) =>
                                    _save(_prefs.copyWith(unreadFirst: v)),
                                accent: accent,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _Section(
                          title: 'Gerätedienste',
                          description:
                              'Diese freiwilligen Einstellungen steuern echte externe Gerätedienste und sind von den Filtern im In-App-Feed getrennt.',
                          child: Column(
                            children: [
                              _SettingToggleTile(
                                icon: Icons.notifications_active_outlined,
                                title: 'Push-Mitteilungen auf diesem Gerät',
                                description:
                                    'Wichtige Buchungs-, Nachrichten- und Sicherheitsupdates über Firebase Cloud Messaging.',
                                value: _servicePrefs.pushEnabled,
                                enabled: !_serviceBusy,
                                onChanged: _setPushEnabled,
                                accent: accent,
                              ),
                              const _Divider(),
                              _SettingToggleTile(
                                icon: Icons.bug_report_outlined,
                                title: 'Freiwillige Crashdiagnose',
                                description:
                                    'Hilft SIT, Abstürze technisch zu erkennen und zu beheben. Keine Werbung und kein Marketing-Tracking.',
                                value: _servicePrefs.crashDiagnosticsEnabled,
                                enabled: !_serviceBusy,
                                onChanged: _setCrashDiagnosticsEnabled,
                                accent: accent,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _HintCard(
                          title: 'Datenschutz-Hinweis',
                          lines: const [
                            'Feed-Filter ändern nur die Darstellung innerhalb der App. Push und Crashdiagnose werden ausschließlich über die beiden Gerätedienst-Schalter oben aktiviert oder widerrufen.',
                            'Mehr Informationen findest du unter Profil > Rechtliches > Datenschutz.',
                          ],
                          accent: accent,
                          titleStyle: titleStyle,
                          captionStyle: captionStyle,
                        ),
                      ],
                    ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String? description;
  final Widget child;
  const _Section({required this.title, this.description, required this.child});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surfaceSecondary(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.glassStroke(context)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 24,
              offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: theme.colorScheme.primary)),
                if (description != null && description!.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(description!,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: AppTheme.textBody(context))),
                ],
              ],
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _SettingToggleTile extends StatelessWidget {
  const _SettingToggleTile({
    required this.icon,
    required this.title,
    required this.description,
    required this.value,
    required this.enabled,
    required this.onChanged,
    required this.accent,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool value;
  final bool enabled;
  final ValueChanged<bool>? onChanged;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = value;
    final locked = !enabled;

    final titleColor = active
        ? AppTheme.textPrimary(context)
        : AppTheme.textSecondary(context);
    final bodyColor =
        active ? AppTheme.textBody(context) : AppTheme.textDisabled(context);

    final badgeBorder =
        active ? accent.withValues(alpha: 0.24) : AppTheme.glassStroke(context);
    final badgeGradient = active
        ? [accent.withValues(alpha: 0.28), accent.withValues(alpha: 0.10)]
        : [AppTheme.surfaceMuted(context), AppTheme.surfacePrimary(context)];
    final badgeIconColor = active ? accent : AppTheme.textSecondary(context);

    final switchInactiveTrack = AppTheme.surfaceMuted(context);
    final switchInactiveThumb = AppTheme.textPrimary(context);
    final switchOutline = AppTheme.glassStroke(context);

    return Opacity(
      opacity: locked ? 0.82 : 1,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: badgeGradient),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: badgeBorder),
              ),
              child: Stack(children: [
                Positioned.fill(
                    child: Icon(icon, color: badgeIconColor, size: 19)),
                if (locked)
                  Positioned(
                    right: 6,
                    bottom: 6,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                          color: AppTheme.surfacePrimary(context),
                          borderRadius: BorderRadius.circular(6)),
                      child: Icon(Icons.lock_outline,
                          size: 12, color: AppTheme.textPrimary(context)),
                    ),
                  ),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    softWrap: true,
                    style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800, color: titleColor),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    softWrap: true,
                    style: theme.textTheme.bodyMedium
                        ?.copyWith(color: bodyColor, height: 1.30),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Switch.adaptive(
                value: value,
                thumbColor: WidgetStateProperty.resolveWith((states) {
                  if (states.contains(WidgetState.selected)) {
                    return Colors.white;
                  }
                  return switchInactiveThumb;
                }),
                trackColor: WidgetStateProperty.resolveWith((states) {
                  if (states.contains(WidgetState.selected)) {
                    return accent.withValues(alpha: 0.55);
                  }
                  return switchInactiveTrack;
                }),
                trackOutlineColor: WidgetStateProperty.resolveWith((states) {
                  if (states.contains(WidgetState.selected)) {
                    return Colors.transparent;
                  }
                  return switchOutline;
                }),
                onChanged: enabled ? onChanged : null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SimpleToggleRow extends StatelessWidget {
  const _SimpleToggleRow(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.value,
      required this.onChanged,
      required this.accent});
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final switchInactiveTrack = Colors.white.withValues(alpha: 0.12);
    final switchInactiveThumb = Colors.white.withValues(alpha: 0.86);
    final switchOutline = Colors.white.withValues(alpha: 0.14);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    accent.withValues(alpha: 0.34),
                    accent.withValues(alpha: 0.10)
                  ]),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.glassStroke(context)),
            ),
            child: Icon(icon, color: AppTheme.textPrimary(context), size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    softWrap: true,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                Text(subtitle,
                    softWrap: true,
                    style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppTheme.textBody(context), height: 1.30)),
              ],
            ),
          ),
          Switch.adaptive(
            value: value,
            thumbColor: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.selected)) return Colors.white;
              return switchInactiveThumb;
            }),
            trackColor: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.selected)) {
                return accent.withValues(alpha: 0.55);
              }
              return switchInactiveTrack;
            }),
            trackOutlineColor: WidgetStateProperty.resolveWith((states) {
              if (states.contains(WidgetState.selected)) {
                return Colors.transparent;
              }
              return switchOutline;
            }),
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) =>
      Divider(height: 1, thickness: 1, color: AppTheme.glassStroke(context));
}

class _HintCard extends StatelessWidget {
  const _HintCard(
      {required this.title,
      required this.lines,
      required this.accent,
      required this.titleStyle,
      required this.captionStyle});
  final String title;
  final List<String> lines;
  final Color accent;
  final TextStyle? titleStyle;
  final TextStyle? captionStyle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          accent.withValues(alpha: 0.14),
          Colors.white.withValues(alpha: 0.06)
        ]),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.glassStroke(context)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 24,
              offset: const Offset(0, 10))
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    accent.withValues(alpha: 0.90),
                    accent.withValues(alpha: 0.28)
                  ]),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.info_outline,
                color: AppTheme.textPrimary(context), size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: titleStyle),
                const SizedBox(height: 6),
                for (final line in lines) ...[
                  Text(line, style: captionStyle),
                  const SizedBox(height: 4),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
