import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/models/user.dart';
import 'package:provider/provider.dart';
import 'package:lendify/screens/profile_info_screen.dart';
import 'package:lendify/screens/contact_data_screen.dart';
import 'package:lendify/screens/security_screen.dart';
import 'package:lendify/screens/payment_methods_screen.dart';
import 'package:lendify/screens/stripe_payout_account_screen.dart';
import 'package:lendify/screens/invoices_screen.dart';
import 'package:lendify/screens/notification_settings_screen.dart';
import 'package:lendify/screens/privacy_info_screen.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/screens/account_deleted_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/services/account_deletion_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/account_deletion_dialog.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';
import 'package:lendify/screens/background_settings_screen.dart';
import 'package:lendify/screens/blocked_users_screen.dart';
import 'package:lendify/screens/moderation_admin_screen.dart';

class AccountSettingsScreen extends StatefulWidget {
  final AccountDeletionService? accountDeletionService;

  const AccountSettingsScreen({
    super.key,
    this.accountDeletionService,
  });
  @override
  State<AccountSettingsScreen> createState() => _AccountSettingsScreenState();
}

class _AccountSettingsScreenState extends State<AccountSettingsScreen> {
  late final AccountDeletionService _accountDeletionService;
  StreamSubscription<String>? _accountStateSubscription;
  AccountDeletionContext? _deletionContext;
  User? _user;
  bool _loading = true;
  bool _deleteBusy = false;
  int _loadRevision = 0;
  int _accountEpoch = 0;
  Object? _activeDeletionDialogIdentity;
  void Function()? _dismissActiveDeletionDialog;

  @override
  void initState() {
    super.initState();
    _accountDeletionService =
        widget.accountDeletionService ?? const AccountDeletionService();
    _accountStateSubscription =
        SharedPersistenceSync.changes.listen(_handleAccountStateChange);
    unawaited(_load());
  }

  @override
  void dispose() {
    _loadRevision += 1;
    _accountEpoch += 1;
    _accountStateSubscription?.cancel();
    _dismissActiveDeletionDialog?.call();
    super.dispose();
  }

  void _handleAccountStateChange(String key) {
    if (key != SharedPersistenceSync.accountSecurityStateKey) return;
    _accountEpoch += 1;
    _loadRevision += 1;
    _dismissActiveDeletionDialog?.call();
    if (!mounted) return;
    setState(() {
      _deletionContext = null;
      _user = null;
      _loading = true;
      _deleteBusy = false;
    });
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    try {
      final deletionContext =
          await _accountDeletionService.loadCurrentContext();
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _deletionContext = deletionContext;
        _user = deletionContext?.user;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _deletionContext = null;
        _user = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text(l10n.t('profile.menu.accountSettings')),
        centerTitle: true,
        leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).maybePop()),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding:
                  const EdgeInsets.fromLTRB(16, kToolbarHeight + 16, 16, 24),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _GroupTitle('PROFIL'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.badge_outlined,
                        label: l10n.t('Profilinformationen'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const ProfileInfoScreen())),
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.mail_outline,
                        label: l10n.t('account.item.contactData'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const ContactDataScreen())),
                      ),
                    ]),
                    const SizedBox(height: 28),
                    const _GroupTitle('SICHERHEIT'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.verified_user_outlined,
                        label: 'Identitätsprüfung',
                        subtitle:
                            'Noch nicht verfügbar – ein geprüfter Anbieter wird vor dem Produktionsstart angebunden.',
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.lock_outline,
                        label: l10n.t('account.item.changePassword'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const SecurityScreen())),
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.phonelink_lock_outlined,
                        label: 'Zwei‑Faktor‑Authentifizierung',
                        subtitle:
                            'Noch nicht verfügbar – die sichere Server-Anbindung folgt vor dem Produktionsstart.',
                      ),
                    ]),
                    const SizedBox(height: 28),
                    const _GroupTitle('ZAHLUNGEN'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.credit_card,
                        label: l10n.t('account.item.paymentMethods'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const PaymentMethodsScreen())),
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.account_balance_wallet_outlined,
                        label: l10n.t('account.item.payoutMethods'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) =>
                                    const StripePayoutAccountScreen())),
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.receipt_long_outlined,
                        label: l10n.t('account.item.invoices'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const InvoicesScreen())),
                      ),
                    ]),
                    const SizedBox(height: 28),
                    const _GroupTitle('BENACHRICHTIGUNGEN'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.notifications_active_outlined,
                        label: l10n.t('account.item.notifications'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) =>
                                    const NotificationSettingsScreen())),
                      ),
                    ]),
                    const SizedBox(height: 28),
                    const _GroupTitle('DESIGN'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.wallpaper_outlined,
                        label: 'Hintergrund',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const BackgroundSettingsScreen()),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 28),
                    if (const {'support', 'admin'}.contains(_user?.role)) ...[
                      const _GroupTitle('BETRIEB'),
                      _SectionCard(children: [
                        _RowTile(
                          icon: Icons.admin_panel_settings_outlined,
                          label: _user?.role == 'admin'
                              ? 'Administration & Moderation'
                              : 'Support & Moderation',
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ModerationAdminScreen(
                                role: _user?.role ?? 'support',
                              ),
                            ),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 28),
                    ],
                    const _GroupTitle('DATENSCHUTZ'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.block_outlined,
                        label: 'Blockierte Nutzer',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const BlockedUsersScreen(),
                          ),
                        ),
                      ),
                      const _Divider(),
                      _RowTile(
                        icon: Icons.shield_outlined,
                        label: l10n.t('account.item.dataPrivacyInfo'),
                        onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                                builder: (_) => const PrivacyInfoScreen())),
                      ),
                    ]),
                    const SizedBox(height: 28),
                    const _GroupTitle('KONTO'),
                    _SectionCard(children: [
                      _RowTile(
                        icon: Icons.delete_outline,
                        label: l10n.t('account.item.deleteAccount'),
                        isDestructive: true,
                        onTap: () => _confirmDeleteAccount(context),
                      ),
                    ]),
                  ]),
            ),
    );
  }

  _AccountDeletionInteractionOwner? _captureDeletionOwner() {
    final deletionContext = _deletionContext;
    if (_loading || _deleteBusy || deletionContext == null) return null;
    return _AccountDeletionInteractionOwner(
      context: deletionContext,
      epoch: _accountEpoch,
    );
  }

  bool _isDeletionOwnerSynchronouslyCurrent(
    _AccountDeletionInteractionOwner owner,
  ) =>
      mounted &&
      owner.epoch == _accountEpoch &&
      identical(owner.context, _deletionContext);

  Future<bool> _isDeletionOwnerCurrent(
    _AccountDeletionInteractionOwner owner,
  ) async {
    if (!_isDeletionOwnerSynchronouslyCurrent(owner)) return false;
    final current =
        await _accountDeletionService.isContextCurrent(owner.context);
    return current && _isDeletionOwnerSynchronouslyCurrent(owner);
  }

  Future<T?> _showOwnedDeletionDialog<T>({
    required String barrierLabel,
    required Widget Function(
      BuildContext context,
      TrackedDialogRouteHandle<T> handle,
    ) builder,
    bool barrierDismissible = true,
    Duration transitionDuration = const Duration(milliseconds: 220),
  }) async {
    final handle = TrackedDialogRouteHandle<T>();
    _activeDeletionDialogIdentity = handle;
    _dismissActiveDeletionDialog = () => handle.dismiss();
    try {
      return await showTrackedGeneralDialog<T>(
        context: context,
        handle: handle,
        barrierDismissible: barrierDismissible,
        barrierLabel: barrierLabel,
        barrierColor: Colors.transparent,
        transitionDuration: transitionDuration,
        pageBuilder: (dialogContext, _, __) => builder(dialogContext, handle),
        transitionBuilder: (dialogContext, animation, secondary, child) {
          final value = Curves.easeOutCubic.transform(animation.value);
          return Opacity(
            opacity: animation.value,
            child: Transform.scale(
              scale: 0.96 + (0.04 * value),
              child: child,
            ),
          );
        },
      );
    } finally {
      if (identical(_activeDeletionDialogIdentity, handle)) {
        _activeDeletionDialogIdentity = null;
        _dismissActiveDeletionDialog = null;
      }
    }
  }

  void _confirmDeleteAccount(BuildContext context) {
    final owner = _captureDeletionOwner();
    if (owner == null) return;
    unawaited(_showDeleteDialogStep1(owner));
  }

  Future<void> _showDeleteDialogStep1(
    _AccountDeletionInteractionOwner owner,
  ) async {
    if (!_isDeletionOwnerSynchronouslyCurrent(owner)) return;
    final confirmed = await _showOwnedDeletionDialog<bool>(
          barrierLabel: 'Konto wirklich löschen?',
          builder: (dialogContext, handle) => AccountDeletionDialog(
            icon: Icons.delete_outline,
            title: 'Konto wirklich löschen?',
            body: const _DeleteAccountStep1Body(),
            leftAction: AccountDeletionDialogAction(
              label: 'Abbrechen',
              onPressed: () => handle.dismiss(false),
            ),
            rightAction: AccountDeletionDialogAction(
              label: 'Konto endgültig löschen',
              isDestructive: true,
              onPressed: () => handle.dismiss(true),
            ),
          ),
        ) ??
        false;
    if (!confirmed || !await _isDeletionOwnerCurrent(owner)) return;
    await _showDeleteDialogStep2(owner);
  }

  Future<void> _showDeleteDialogStep2(
    _AccountDeletionInteractionOwner owner,
  ) async {
    if (!await _isDeletionOwnerCurrent(owner)) return;
    final confirmationController = TextEditingController();
    final passwordController = TextEditingController();
    _DeleteConfirmation? confirmation;
    try {
      confirmation = await _showOwnedDeletionDialog<_DeleteConfirmation>(
        barrierLabel: 'Bist du sicher?',
        builder: (dialogContext, handle) => StatefulBuilder(
          builder: (dialogContext, setLocalState) => AccountDeletionDialog(
            icon: Icons.warning_amber_rounded,
            title: 'Bist du sicher?',
            body: _DeleteAccountStep2Body(
              controller: confirmationController,
              passwordController: passwordController,
              onChanged: (_) => setLocalState(() {}),
            ),
            leftAction: AccountDeletionDialogAction(
              label: 'Zurück',
              onPressed: () => handle.dismiss(),
            ),
            rightAction: AccountDeletionDialogAction(
              label: 'Ja, Konto endgültig löschen',
              isDestructive: true,
              onPressed: confirmationController.text.trim().toUpperCase() ==
                          'LÖSCHEN' &&
                      passwordController.text.isNotEmpty
                  ? () => handle.dismiss(
                        _DeleteConfirmation(passwordController.text),
                      )
                  : null,
            ),
          ),
        ),
      );
    } finally {
      confirmationController.dispose();
      passwordController.dispose();
    }
    if (confirmation == null || !await _isDeletionOwnerCurrent(owner)) return;
    await _runPreflightAndDelete(owner, confirmation.password);
  }

  Future<void> _runPreflightAndDelete(
    _AccountDeletionInteractionOwner owner,
    String currentPassword,
  ) async {
    if (!await _isDeletionOwnerCurrent(owner)) return;
    final operationEpoch = owner.epoch;
    setState(() => _deleteBusy = true);
    try {
      AccountDeletionPreflightResult preflight;
      try {
        if (!await _isDeletionOwnerCurrent(owner)) return;
        preflight = await _accountDeletionService.preflightCheck(owner.context);
      } on AccountDeletionPreflightFailure catch (error) {
        if (!await _isDeletionOwnerCurrent(owner)) return;
        final message = switch (error.kind) {
          AccountDeletionPreflightFailureKind.unavailable =>
            'Die serverseitige Löschprüfung ist derzeit nicht erreichbar. '
                'Es wurde nichts gelöscht.',
          AccountDeletionPreflightFailureKind.invalidResponse =>
            'Die serverseitige Löschprüfung lieferte keinen verlässlichen '
                'Status. Es wurde nichts gelöscht.',
        };
        await _showDeletionOutcome(
          title: 'Löschprüfung nicht möglich',
          message: message,
        );
        return;
      } on AccountDeletionPrincipalChanged {
        return;
      } catch (_) {
        if (!await _isDeletionOwnerCurrent(owner)) return;
        await _showDeletionOutcome(
          title: 'Löschprüfung nicht möglich',
          message: 'Die Anfrage wurde vor einer verlässlichen Prüfung '
              'abgebrochen. Es wurde nichts gelöscht.',
        );
        return;
      }
      if (!await _isDeletionOwnerCurrent(owner)) return;

      if (!preflight.canDelete) {
        await _showDeleteBlockedDialog(owner, preflight.blockers);
        return;
      }

      if (preflight.retainedRecords.isNotEmpty) {
        final confirmed = await _showRetainedRecordsConfirmation(
          owner,
          preflight.retainedRecords,
        );
        if (!confirmed || !await _isDeletionOwnerCurrent(owner)) return;
      }

      AccountDeletionCompletion completion;
      try {
        if (!await _isDeletionOwnerCurrent(owner)) return;
        completion = await _accountDeletionService.deleteAccount(
          context: owner.context,
          currentPassword: currentPassword,
        );
      } on AccountDeletionFailure catch (error) {
        await _handleDeletionFailure(owner, error);
        return;
      } on AccountDeletionPrincipalChanged {
        return;
      } catch (_) {
        if (!await _isDeletionOwnerCurrent(owner)) return;
        await _showDeletionOutcome(
          title: 'Kontolöschung nicht gestartet',
          message: 'Die Anfrage wurde vor einer Serverbestätigung '
              'abgebrochen. Bitte prüfe deine Sitzung und versuche es erneut.',
        );
        return;
      }

      final successEpoch = _accountEpoch;
      if (!await _accountDeletionService.isCompletionCurrent(completion) ||
          !mounted ||
          successEpoch != _accountEpoch) {
        return;
      }
      context.read<MainNavController>().setIndex(0);
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const AccountDeletedScreen()),
        (_) => false,
      );
    } finally {
      if (mounted && operationEpoch == _accountEpoch) {
        setState(() => _deleteBusy = false);
      }
    }
  }

  Future<void> _handleDeletionFailure(
    _AccountDeletionInteractionOwner owner,
    AccountDeletionFailure error,
  ) async {
    final localCompletion = error.localCompletion;
    if (localCompletion != null) {
      if (!await _accountDeletionService.isCompletionCurrent(
        localCompletion,
      )) {
        return;
      }
    } else if (!await _isDeletionOwnerCurrent(owner)) {
      return;
    }
    final outcomeEpoch = _accountEpoch;
    final (title, message) = switch (error.kind) {
      AccountDeletionFailureKind.rejected => (
          'Konto nicht gelöscht',
          'Der Server hat die Löschung eindeutig abgelehnt. '
              'Bitte prüfe dein Passwort und mögliche offene Vorgänge.',
        ),
      AccountDeletionFailureKind.localFinalizationFailed => (
          'Lokale Kontolöschung unvollständig',
          'Die lokale Löschung konnte nicht vollständig bestätigt werden. '
              'Prüfe den Kontostatus, bevor du sie erneut startest.',
        ),
      AccountDeletionFailureKind.confirmedLocalFinalizationFailed => (
          'Konto serverseitig gelöscht',
          'Der Server hat das Konto gelöscht, aber die lokale Bereinigung '
              'konnte nicht vollständig bestätigt werden. Schließe die App '
              'und melde dich nicht erneut mit diesem Konto an.',
        ),
      AccountDeletionFailureKind.outcomeUnknown => (
          'Ergebnis der Kontolöschung unklar',
          'Die Serverantwort ist nicht angekommen. Prüfe den Kontostatus, '
              'bevor du die Löschung erneut sendest.',
        ),
    };
    await _showDeletionOutcome(title: title, message: message);
    if (!mounted || outcomeEpoch != _accountEpoch || localCompletion == null) {
      return;
    }
    if (!await _accountDeletionService.isCompletionCurrent(localCompletion) ||
        !mounted ||
        outcomeEpoch != _accountEpoch) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  Future<void> _showDeletionOutcome({
    required String title,
    required String message,
  }) =>
      _showOwnedDeletionDialog<void>(
        barrierLabel: title,
        transitionDuration: const Duration(milliseconds: 180),
        builder: (dialogContext, handle) => AccountDeletionDialog(
          icon: Icons.error_outline,
          title: title,
          body: Text(
            message,
            style: const TextStyle(color: Colors.white70, height: 1.5),
          ),
          leftAction: AccountDeletionDialogAction(
            label: 'OK',
            onPressed: handle.dismiss,
          ),
          rightAction: AccountDeletionDialogAction(
            label: 'Schließen',
            onPressed: handle.dismiss,
          ),
        ),
      );

  Future<void> _showDeleteBlockedDialog(
    _AccountDeletionInteractionOwner owner,
    List<AccountDeletionBlocker> blockers,
  ) async {
    if (!await _isDeletionOwnerCurrent(owner)) return;
    final action = await _showOwnedDeletionDialog<_DeleteBlockedAction>(
      barrierLabel: 'Konto kann aktuell nicht gelöscht werden',
      builder: (dialogContext, handle) => AccountDeletionDialog(
        icon: Icons.info_outline,
        title: 'Konto kann aktuell nicht gelöscht werden',
        body: _DeleteBlockedBody(blockers: blockers),
        leftAction: AccountDeletionDialogAction(
          label: 'Schließen',
          onPressed: () => handle.dismiss(_DeleteBlockedAction.close),
        ),
        rightAction: AccountDeletionDialogAction(
          label: 'Zu meinen Buchungen',
          onPressed: () => handle.dismiss(_DeleteBlockedAction.bookings),
        ),
      ),
    );
    if (action != _DeleteBlockedAction.bookings ||
        !await _isDeletionOwnerCurrent(owner)) {
      return;
    }
    if (!mounted) return;
    context.read<MainNavController>().setIndex(2);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<bool> _showRetainedRecordsConfirmation(
    _AccountDeletionInteractionOwner owner,
    List<AccountDeletionRetainedRecord> retainedRecords,
  ) async {
    if (!await _isDeletionOwnerCurrent(owner)) return false;
    final confirmed = await _showOwnedDeletionDialog<bool>(
          barrierDismissible: false,
          barrierLabel: 'Kontrollierte Aufbewahrung bestätigen',
          builder: (dialogContext, handle) => AccountDeletionDialog(
            icon: Icons.inventory_2_outlined,
            title: 'Supportakte bleibt gespeichert',
            body: _DeleteRetainedRecordsBody(
              retainedRecords: retainedRecords,
            ),
            leftAction: AccountDeletionDialogAction(
              label: 'Abbrechen',
              onPressed: () => handle.dismiss(false),
            ),
            rightAction: AccountDeletionDialogAction(
              label: 'Verstanden, Konto löschen',
              isDestructive: true,
              onPressed: () => handle.dismiss(true),
            ),
          ),
        ) ??
        false;
    return confirmed && await _isDeletionOwnerCurrent(owner);
  }
}

class _AccountDeletionInteractionOwner {
  final AccountDeletionContext context;
  final int epoch;

  const _AccountDeletionInteractionOwner({
    required this.context,
    required this.epoch,
  });
}

class _DeleteConfirmation {
  final String password;

  const _DeleteConfirmation(this.password);
}

enum _DeleteBlockedAction { close, bookings }

class _DeleteAccountStep1Body extends StatelessWidget {
  const _DeleteAccountStep1Body();
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final style =
        t.textTheme.bodyMedium?.copyWith(color: Colors.white70, height: 1.5);
    final bulletStyle = t.textTheme.bodyMedium?.copyWith(
        color: Colors.white, height: 1.5, fontWeight: FontWeight.w700);

    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Du kannst dein Konto nur löschen, wenn:',
            style: style,
          ),
          const SizedBox(height: 10),
          _Bullet(
              text: 'keine laufenden Buchungen bestehen', style: bulletStyle),
          _Bullet(
              text: 'keine kommenden Buchungen geplant sind',
              style: bulletStyle),
          _Bullet(
              text: 'keine laufenden Anmietungen bestehen', style: bulletStyle),
          _Bullet(
              text: 'keine offenen Zahlungen oder Auszahlungen vorhanden sind',
              style: bulletStyle),
          const SizedBox(height: 12),
          Text(
            'Nach der Löschung wird dein Konto dauerhaft deaktiviert. Deine personenbezogenen Daten werden gemäß unseren Datenschutzrichtlinien gelöscht oder anonymisiert, sofern keine Pflichten oder berechtigten Fallzwecke entgegenstehen. Offene Supportakten können kontrolliert erhalten bleiben; dein Nutzerzugang endet.\n\nDiese Aktion kann nicht rückgängig gemacht werden.',
            style: style,
          ),
        ]);
  }
}

class _DeleteAccountStep2Body extends StatelessWidget {
  final TextEditingController controller;
  final TextEditingController passwordController;
  final ValueChanged<String> onChanged;
  const _DeleteAccountStep2Body(
      {required this.controller,
      required this.passwordController,
      required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final style =
        t.textTheme.bodyMedium?.copyWith(color: Colors.white70, height: 1.5);
    final bulletStyle = t.textTheme.bodyMedium?.copyWith(
        color: Colors.white, height: 1.5, fontWeight: FontWeight.w700);
    final enabled = controller.text.trim().toUpperCase() == 'LÖSCHEN';

    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Wenn du dein Konto löschst:', style: style),
          const SizedBox(height: 10),
          _Bullet(text: 'wird dein Profil deaktiviert', style: bulletStyle),
          _Bullet(
              text: 'deine aktiven Angebote werden entfernt',
              style: bulletStyle),
          _Bullet(
              text: 'du kannst dich nicht mehr einloggen', style: bulletStyle),
          _Bullet(
              text: 'Bewertungen bleiben anonymisiert erhalten',
              style: bulletStyle),
          const SizedBox(height: 12),
          Text('Diese Aktion ist endgültig.', style: style),
          const SizedBox(height: 14),
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w800),
              decoration: InputDecoration(
                hintText: 'Zum Bestätigen „LÖSCHEN“ eingeben',
                hintStyle: const TextStyle(
                    color: Colors.white60, fontWeight: FontWeight.w600),
                prefixIcon: Icon(enabled ? Icons.check : Icons.lock_outline,
                    color: enabled ? t.colorScheme.primary : Colors.white70),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none),
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.02),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: TextField(
              controller: passwordController,
              onChanged: onChanged,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                hintText: 'Aktuelles Passwort',
                prefixIcon: const Icon(Icons.password_outlined),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.02),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
              'Das Passwort schützt vor einer Löschung durch eine fremde Person mit offenem Gerät.',
              style: t.textTheme.labelSmall
                  ?.copyWith(color: Colors.white60, height: 1.4)),
        ]);
  }
}

class _DeleteBlockedBody extends StatelessWidget {
  final List<AccountDeletionBlocker> blockers;
  const _DeleteBlockedBody({required this.blockers});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final style =
        t.textTheme.bodyMedium?.copyWith(color: Colors.white70, height: 1.5);
    final bulletStyle = t.textTheme.bodyMedium?.copyWith(
        color: Colors.white, height: 1.5, fontWeight: FontWeight.w700);
    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Du hast noch aktive Aktivitäten auf ShareItToo:', style: style),
          const SizedBox(height: 10),
          for (final b in blockers.take(6))
            _Bullet(text: b.label, style: bulletStyle),
          if (blockers.length > 6)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('… und weitere',
                  style:
                      t.textTheme.labelSmall?.copyWith(color: Colors.white60)),
            ),
          const SizedBox(height: 12),
          Text('Bitte schließe diese zuerst ab.', style: style),
        ]);
  }
}

class _DeleteRetainedRecordsBody extends StatelessWidget {
  final List<AccountDeletionRetainedRecord> retainedRecords;
  const _DeleteRetainedRecordsBody({required this.retainedRecords});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final style =
        t.textTheme.bodyMedium?.copyWith(color: Colors.white70, height: 1.5);
    final bulletStyle = t.textTheme.bodyMedium?.copyWith(
        color: Colors.white, height: 1.5, fontWeight: FontWeight.w700);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Die Kontolöschung ist möglich. Folgende Daten bleiben soweit nötig für die Fallbearbeitung oder Aufbewahrung kontrolliert gespeichert:',
          style: style,
        ),
        const SizedBox(height: 10),
        for (final record in retainedRecords.take(6))
          _Bullet(text: record.label, style: bulletStyle),
        const SizedBox(height: 12),
        Text(
          'Dein Konto wird trotzdem geschlossen. Du kannst dich danach nicht mehr anmelden und erhältst keine neuen In-App-Supportnachrichten.',
          style: style,
        ),
      ],
    );
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  final TextStyle? style;
  const _Bullet({required this.text, required this.style});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(
          padding: EdgeInsets.only(top: 7),
          child: SizedBox(
              width: 6,
              height: 6,
              child: DecoratedBox(
                  decoration: BoxDecoration(
                      color: Colors.white70, shape: BoxShape.circle))),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: style)),
      ]),
    );
  }
}

class _GroupTitle extends StatelessWidget {
  final String title;
  const _GroupTitle(this.title);

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelSmall;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
      child: Text(
        title,
        style: style?.copyWith(
          color: Colors.white70,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final List<Widget> children;
  const _SectionCard({required this.children});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.30),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08))),
      child: Column(children: children),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, thickness: 1, color: Colors.white24);
}

class _RowTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? subtitle;
  final bool isDestructive;
  final VoidCallback? onTap;
  const _RowTile(
      {required this.icon,
      required this.label,
      this.subtitle,
      this.onTap,
      this.isDestructive = false});
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading:
          Icon(icon, color: isDestructive ? Colors.redAccent : Colors.white70),
      title: Text(label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: isDestructive
                  ? Colors.redAccent
                  : (onTap == null ? Colors.white60 : Colors.white))),
      subtitle: subtitle == null
          ? null
          : Text(
              subtitle!,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Colors.white54),
            ),
      trailing: onTap == null
          ? const Icon(Icons.info_outline, color: Colors.white38)
          : const Icon(Icons.chevron_right, color: Colors.white38),
      onTap: onTap,
    );
  }
}
