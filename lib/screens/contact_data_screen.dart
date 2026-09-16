import 'dart:async';
import 'dart:math';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/contact_verification_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/approx_location_map.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';
import 'package:lendify/widgets/tracked_dialog_route.dart';

class ContactDataScreen extends StatefulWidget {
  final ContactVerificationService? contactVerificationService;
  final ProfileMutationService? profileMutationService;

  const ContactDataScreen({
    super.key,
    this.contactVerificationService,
    this.profileMutationService,
  });

  @override
  State<ContactDataScreen> createState() => _ContactDataScreenState();
}

class _ContactDataScreenState extends State<ContactDataScreen> {
  final _formKey = GlobalKey<FormState>();

  late final ContactVerificationService _contactVerificationService;
  late final ProfileMutationService _profileMutationService;
  final _profileActions = ProfileMutationInteractionController();
  StreamSubscription<String>? _accountStateSubscription;
  ContactVerificationContext? _contactContext;
  User? _user;
  bool _loading = true;
  bool _saving = false;
  int _loadRevision = 0;
  int _contactEpoch = 0;
  Object? _activeContactRouteIdentity;
  void Function()? _dismissActiveContactRoute;

  late final TextEditingController _phoneCtrl;
  late final TextEditingController _emailCtrl;

  late final TextEditingController _streetCtrl;
  late final TextEditingController _houseNumberCtrl;
  late final TextEditingController _postalCodeCtrl;
  late final TextEditingController _cityCtrl;
  late final TextEditingController _countryCtrl;
  late final TextEditingController _extraCtrl;

  String _generalError = '';

  @override
  void initState() {
    super.initState();
    _contactVerificationService =
        widget.contactVerificationService ?? const ContactVerificationService();
    _profileMutationService =
        widget.profileMutationService ?? const ProfileMutationService();
    _accountStateSubscription =
        SharedPersistenceSync.changes.listen(_handleAccountStateChange);
    _phoneCtrl = TextEditingController();
    _emailCtrl = TextEditingController();
    _streetCtrl = TextEditingController();
    _houseNumberCtrl = TextEditingController();
    _postalCodeCtrl = TextEditingController();
    _cityCtrl = TextEditingController();
    _countryCtrl = TextEditingController();
    _extraCtrl = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _loadRevision += 1;
    _contactEpoch += 1;
    _accountStateSubscription?.cancel();
    _dismissActiveContactRoute?.call();
    _profileActions.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _streetCtrl.dispose();
    _houseNumberCtrl.dispose();
    _postalCodeCtrl.dispose();
    _cityCtrl.dispose();
    _countryCtrl.dispose();
    _extraCtrl.dispose();
    super.dispose();
  }

  void _handleAccountStateChange(String key) {
    if (key != SharedPersistenceSync.accountSecurityStateKey) return;
    _contactEpoch += 1;
    _loadRevision += 1;
    _dismissActiveContactRoute?.call();
    _profileActions.invalidate();
    if (!mounted) return;
    setState(() {
      _contactContext = null;
      _user = null;
      _loading = true;
      _saving = false;
      _generalError = '';
    });
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    try {
      final contactContext =
          await _contactVerificationService.loadCurrentContext();
      final profileContext = widget.profileMutationService == null
          ? contactContext == null
              ? null
              : ProfileMutationContext(
                  user: contactContext.user,
                  owner: contactContext.owner,
                )
          : await _profileMutationService.loadCurrentContext();
      if (!mounted || revision != _loadRevision) return;
      final u = contactContext?.user;
      final matchingProfileContext = profileContext != null &&
              u != null &&
              profileContext.user.id == u.id &&
              profileContext.user.email.trim().toLowerCase() ==
                  u.email.trim().toLowerCase()
          ? profileContext
          : null;
      _profileActions.replaceContext(matchingProfileContext);
      setState(() {
        _contactContext = contactContext;
        _user = u;
        _loading = false;
        _generalError = '';
      });
      _hydrateControllersFromUser(u);
    } catch (e) {
      debugPrint('[ContactData] load failed: $e');
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _contactContext = null;
        _profileActions.invalidate();
        _loading = false;
        _generalError = 'Laden fehlgeschlagen.';
      });
    }
  }

  _ContactInteractionOwner? _captureInteractionOwner() {
    final contactContext = _contactContext;
    if (contactContext == null || _user == null) return null;
    return _ContactInteractionOwner(
      context: contactContext,
      epoch: ++_contactEpoch,
    );
  }

  bool _isInteractionOwnerSynchronouslyCurrent(
    _ContactInteractionOwner owner,
  ) =>
      mounted &&
      owner.epoch == _contactEpoch &&
      identical(owner.context, _contactContext);

  Future<bool> _isInteractionOwnerCurrent(
    _ContactInteractionOwner owner,
  ) async {
    if (!_isInteractionOwnerSynchronouslyCurrent(owner)) return false;
    final current =
        await _contactVerificationService.isContextCurrent(owner.context);
    return current && _isInteractionOwnerSynchronouslyCurrent(owner);
  }

  void _bindContactRoute<T>(
    _ContactInteractionOwner owner,
    Object identity,
    TrackedDialogRouteHandle<T> handle,
  ) {
    if (!_isInteractionOwnerSynchronouslyCurrent(owner)) return;
    _activeContactRouteIdentity = identity;
    _dismissActiveContactRoute = handle.dismiss;
  }

  void _releaseContactRoute(Object identity) {
    if (!identical(identity, _activeContactRouteIdentity)) return;
    _activeContactRouteIdentity = null;
    _dismissActiveContactRoute = null;
  }

  Future<T?> _showOwnedDialog<T>({
    required _ContactInteractionOwner owner,
    required WidgetBuilder builder,
    bool barrierDismissible = true,
  }) async {
    if (!_isInteractionOwnerSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<T>();
    _bindContactRoute(owner, identity, handle);
    try {
      return await showTrackedDialog<T>(
        context: context,
        handle: handle,
        builder: builder,
        barrierDismissible: barrierDismissible,
        barrierLabel:
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
      );
    } finally {
      _releaseContactRoute(identity);
    }
  }

  Future<T?> _showOwnedSheet<T>({
    required _ContactInteractionOwner owner,
    required WidgetBuilder builder,
  }) async {
    if (!_isInteractionOwnerSynchronouslyCurrent(owner)) return null;
    final identity = Object();
    final handle = TrackedDialogRouteHandle<T>();
    _bindContactRoute(owner, identity, handle);
    try {
      return await showTrackedModalBottomSheet<T>(
        context: context,
        handle: handle,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: builder,
      );
    } finally {
      _releaseContactRoute(identity);
    }
  }

  void _hydrateControllersFromUser(User? u) {
    if (u == null) return;

    _phoneCtrl.text = u.phone ?? '';
    _emailCtrl.text = u.email;

    // Prefer structured fields; fall back to parsing the legacy homeLocation.
    final parsed = _parseLegacyAddress(u.homeLocation ?? '');
    _streetCtrl.text = u.addressStreet ?? parsed.street ?? '';
    _houseNumberCtrl.text = u.addressHouseNumber ?? parsed.houseNumber ?? '';
    _postalCodeCtrl.text = u.addressPostalCode ?? parsed.postalCode ?? '';
    _cityCtrl.text = u.addressCity ?? parsed.city ?? (u.city ?? '');
    _countryCtrl.text = u.addressCountry ?? (u.country ?? '');
    _extraCtrl.text = u.addressExtra ?? '';
  }

  _ParsedAddress _parseLegacyAddress(String input) {
    final raw = input.trim();
    if (raw.isEmpty) return const _ParsedAddress();

    // Very defensive: "Street 12, 12345 City".
    final parts =
        raw.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return const _ParsedAddress();

    String? street;
    String? house;
    String? postal;
    String? city;

    final line1 = parts.first;
    final m1 = RegExp(r'^(.*?)(?:\s+)(\d+[a-zA-Z]?)\s*$').firstMatch(line1);
    if (m1 != null) {
      street = m1.group(1)?.trim();
      house = m1.group(2)?.trim();
    } else {
      street = line1;
    }

    if (parts.length >= 2) {
      final line2 = parts[1];
      final m2 = RegExp(r'^(\d{4,10})\s+(.*)$').firstMatch(line2);
      if (m2 != null) {
        postal = m2.group(1)?.trim();
        city = m2.group(2)?.trim();
      } else {
        city = line2;
      }
    }

    return _ParsedAddress(
        street: street, houseNumber: house, postalCode: postal, city: city);
  }

  bool get _hasRequiredAddressFields {
    return _streetCtrl.text.trim().isNotEmpty &&
        _houseNumberCtrl.text.trim().isNotEmpty &&
        _postalCodeCtrl.text.trim().isNotEmpty &&
        _cityCtrl.text.trim().isNotEmpty &&
        _countryCtrl.text.trim().isNotEmpty;
  }

  String _composeAddressLine() {
    final street = _streetCtrl.text.trim();
    final house = _houseNumberCtrl.text.trim();
    final postal = _postalCodeCtrl.text.trim();
    final city = _cityCtrl.text.trim();
    final country = _countryCtrl.text.trim();
    final extra = _extraCtrl.text.trim();
    final line1 = '$street $house'.trim();
    final line2 = '$postal $city'.trim();
    final extraPart = extra.isNotEmpty ? ', $extra' : '';
    return '$line1$extraPart, $line2, $country';
  }

  String? _validateEmail(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Bitte gib eine E‑Mail-Adresse ein.';
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
    if (!ok) return 'Bitte gib eine gültige E‑Mail-Adresse ein.';
    return null;
  }

  String? _validatePhone(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Bitte gib eine Telefonnummer ein.';
    if (!value.startsWith('+') && !value.startsWith('00')) {
      return 'Die Ländervorwahl fehlt. Beginne die Nummer zum Beispiel mit +49.';
    }
    if (AuthService.normalizePhoneNumber(value) == null) {
      return 'Die Nummer hat eine ungültige Länge oder enthält nicht erlaubte Zeichen. Prüfe Ländervorwahl und alle Ziffern.';
    }
    return null;
  }

  String? _validatePostal(String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return 'Postleitzahl ist erforderlich.';
    final ok = RegExp(r'^[0-9A-Za-z\-\s]{4,10}$').hasMatch(value);
    if (!ok) return 'Bitte gib eine gültige Postleitzahl ein.';
    return null;
  }

  String? _required(String label, String? v) {
    final value = (v ?? '').trim();
    if (value.isEmpty) return '$label ist erforderlich.';
    return null;
  }

  Future<String?> _requestPasswordForEmailChange(
    _ContactInteractionOwner owner,
  ) async {
    final passwordController = TextEditingController();
    try {
      return await _showOwnedDialog<String>(
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: const Text('E-Mail-Änderung bestätigen'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Gib aus Sicherheitsgründen dein aktuelles Passwort ein. Die neue Adresse wird erst nach Klick auf den Bestätigungslink übernommen.',
              ),
              const SizedBox(height: 14),
              TextField(
                controller: passwordController,
                obscureText: true,
                autofocus: true,
                enableSuggestions: false,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Aktuelles Passwort',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
                onSubmitted: (value) {
                  if (value.isNotEmpty) Navigator.of(dialogContext).pop(value);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () {
                final password = passwordController.text;
                if (password.isNotEmpty) {
                  Navigator.of(dialogContext).pop(password);
                }
              },
              child: const Text('Bestätigungslink senden'),
            ),
          ],
        ),
      );
    } finally {
      passwordController.dispose();
    }
  }

  Future<void> _save() async {
    setState(() => _generalError = '');
    final current = _user;
    final owner = _captureInteractionOwner();
    final profileOwner = _profileActions.capture();
    if (current == null || owner == null || profileOwner == null) return;

    final ok = _formKey.currentState?.validate() ?? false;
    if (!ok) return;
    if (!_hasRequiredAddressFields) {
      setState(() => _generalError = 'Bitte vervollständige deine Adresse.');
      return;
    }

    final newEmail = _emailCtrl.text.trim();
    final newPhone = _phoneCtrl.text.trim();
    final addressLine = _composeAddressLine();

    final emailChanged =
        newEmail.toLowerCase() != current.email.trim().toLowerCase();

    if (!_contactVerificationService.isBackendEnabled && emailChanged) {
      setState(() {
        _generalError =
            'Die E-Mail-Adresse kann nur über den bestätigten Anmeldeweg geändert werden.';
      });
      return;
    }

    String? emailChangePassword;
    if (_contactVerificationService.isBackendEnabled && emailChanged) {
      emailChangePassword = await _requestPasswordForEmailChange(owner);
      if (emailChangePassword == null ||
          !await _isInteractionOwnerCurrent(owner) ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            profileOwner,
          )) {
        return;
      }
    }

    if (!await _isInteractionOwnerCurrent(owner) ||
        !await _profileActions.isCurrent(
          _profileMutationService,
          profileOwner,
        )) {
      return;
    }
    setState(() => _saving = true);
    var emailChangeAccepted = false;
    try {
      if (_contactVerificationService.isBackendEnabled && emailChanged) {
        await _contactVerificationService.requestEmailChange(
          context: owner.context,
          newEmail: newEmail,
          currentPassword: emailChangePassword!,
        );
        emailChangeAccepted = true;
      }

      if (!await _isInteractionOwnerCurrent(owner) ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            profileOwner,
          )) {
        return;
      }
      final mutation = await _profileMutationService.updateProfile(
        context: profileOwner.context,
        updates: {
          CurrentUserProfileField.phone: newPhone.isEmpty ? null : newPhone,
          CurrentUserProfileField.addressStreet: _streetCtrl.text.trim(),
          CurrentUserProfileField.addressHouseNumber:
              _houseNumberCtrl.text.trim(),
          CurrentUserProfileField.addressPostalCode:
              _postalCodeCtrl.text.trim(),
          CurrentUserProfileField.addressCity: _cityCtrl.text.trim(),
          CurrentUserProfileField.addressCountry: _countryCtrl.text.trim(),
          CurrentUserProfileField.addressExtra:
              _extraCtrl.text.trim().isEmpty ? null : _extraCtrl.text.trim(),
          CurrentUserProfileField.homeLocation: addressLine,
          CurrentUserProfileField.city: _cityCtrl.text.trim(),
          CurrentUserProfileField.country: _countryCtrl.text.trim(),
        },
      );
      if (!await _isInteractionOwnerCurrent(owner) ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            profileOwner,
          )) {
        return;
      }
      setState(() => _user = mutation.user);
      _profileActions.replaceContext(ProfileMutationContext(
        user: mutation.user,
        owner: profileOwner.context.owner,
      ));
      if (_contactVerificationService.isBackendEnabled && emailChanged) {
        _emailCtrl.text = current.email;
        await _showOwnedMessage(
          owner,
          icon: Icons.mark_email_read_outlined,
          title: 'Bestätigungslink gesendet',
          message:
              'Prüfe $newEmail. Nach der Bestätigung meldest du dich mit der neuen Adresse erneut an.',
        );
      } else {
        await _showOwnedMessage(
          owner,
          icon: Icons.check_circle_outline,
          title: 'Kontaktdaten gespeichert',
        );
      }
    } on ContactActionFailure catch (failure) {
      if (failure.kind == ContactActionFailureKind.principalChanged ||
          !await _isInteractionOwnerCurrent(owner)) {
        return;
      }
      final (title, message) = switch (failure.kind) {
        ContactActionFailureKind.rejected => switch (failure.code) {
            'invalid_credentials' => ('Aktuelles Passwort nicht korrekt', null),
            'email_in_use' => ('E-Mail-Adresse bereits verwendet', null),
            'invalid_email' || 'email_unchanged' => (
                'Neue E-Mail-Adresse prüfen',
                null
              ),
            'rate_limit_exceeded' => (
                'Bitte kurz warten',
                'Versuche es später erneut.'
              ),
            _ => ('E-Mail-Änderung abgelehnt', null),
          },
        ContactActionFailureKind.localUnavailable => (
            'E-Mail-Änderung nicht gestartet',
            'Melde dich erneut an und versuche es dann noch einmal.'
          ),
        ContactActionFailureKind.outcomeUnknown => (
            'Versandstatus unklar',
            'Der Bestätigungslink könnte bereits gesendet worden sein. Prüfe dein Postfach, bevor du die Anfrage wiederholst.'
          ),
        ContactActionFailureKind.principalChanged => (null, null),
      };
      if (title != null) {
        await _showOwnedMessage(
          owner,
          icon: Icons.error_outline,
          title: title,
          message: message,
        );
      }
    } on ProfileMutationFailure catch (failure) {
      if (failure.kind == ProfileMutationFailureKind.principalChanged ||
          !await _isInteractionOwnerCurrent(owner) ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            profileOwner,
          )) {
        return;
      }
      if (emailChangeAccepted) _emailCtrl.text = current.email;
      await _showOwnedMessage(
        owner,
        icon: failure.remoteAccepted || emailChangeAccepted
            ? Icons.mark_email_read_outlined
            : Icons.error_outline,
        title: failure.remoteAccepted
            ? 'Kontaktdaten serverseitig gespeichert'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Speicherstatus unklar'
                : emailChangeAccepted
                    ? 'Bestätigungslink gesendet'
                    : 'Kontaktdaten nicht gespeichert',
        message: failure.remoteAccepted
            ? 'Die Profiländerung wurde serverseitig verarbeitet, aber der lokale Stand konnte noch nicht aktualisiert werden.'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Die Profiländerung könnte verarbeitet worden sein. Lade den Profilstand neu, bevor du erneut speicherst.'
                : emailChangeAccepted
                    ? 'Der E-Mail-Wechsel wurde angefordert, aber die übrigen Kontaktdaten wurden nicht bestätigt.'
                    : null,
      );
    } catch (e) {
      debugPrint('[ContactData] save failed: $e');
      if (!await _isInteractionOwnerCurrent(owner)) return;
      if (emailChangeAccepted) {
        _emailCtrl.text = current.email;
        await _showOwnedMessage(
          owner,
          icon: Icons.mark_email_read_outlined,
          title: 'Bestätigungslink gesendet',
          message:
              'Der E-Mail-Wechsel wurde angefordert, aber die übrigen Kontaktdaten konnten nicht gespeichert werden.',
        );
      } else {
        setState(() => _generalError =
            'Speichern fehlgeschlagen. Bitte versuche es erneut.');
      }
    } finally {
      if (_isInteractionOwnerSynchronouslyCurrent(owner)) {
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _showOwnedMessage(
    _ContactInteractionOwner owner, {
    required IconData icon,
    required String title,
    String? message,
  }) async {
    if (!await _isInteractionOwnerCurrent(owner)) return;
    await _showOwnedDialog<void>(
      owner: owner,
      builder: (dialogContext) => AlertDialog(
        icon: Icon(icon),
        title: Text(title),
        content: message == null ? null : Text(message),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _verifyPhoneFlow() async {
    final owner = _captureInteractionOwner();
    if (owner == null) return;
    if (!_contactVerificationService.isBackendEnabled) {
      await _showOwnedMessage(
        owner,
        icon: Icons.lock_outline,
        title: 'Telefonprüfung nicht verfügbar',
        message:
            'Telefonverifizierung ist nur mit einem sicheren ShareItToo-Konto verfügbar.',
      );
      return;
    }
    final phoneError = _validatePhone(_phoneCtrl.text);
    if (phoneError != null) {
      await _showOwnedMessage(
        owner,
        icon: Icons.phone_disabled_outlined,
        title: 'Telefonnummer prüfen',
        message: phoneError,
      );
      return;
    }
    final phoneNumber = _phoneCtrl.text.trim();

    final approved = await _showOwnedDialog<bool>(
      owner: owner,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.sms_outlined),
        title: const Text('SMS-Code anfordern?'),
        content: const Text(
          'Zur Bestätigung wird deine Telefonnummer an Firebase Authentication (Google) übertragen. Google verwendet sie außerdem zur Spam- und Missbrauchsabwehr. ShareItToo speichert keinen SMS-Code.',
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Abbrechen'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Code senden'),
          ),
        ],
      ),
    );
    if (approved != true || !await _isInteractionOwnerCurrent(owner)) return;

    PhoneVerificationChallenge challenge;
    try {
      setState(() => _saving = true);
      challenge = await _contactVerificationService.requestPhoneVerification(
        context: owner.context,
        phoneNumber: phoneNumber,
      );
    } on ContactActionFailure catch (failure) {
      if (failure.kind == ContactActionFailureKind.principalChanged ||
          !await _isInteractionOwnerCurrent(owner)) {
        return;
      }
      final (title, message) = _phoneContactFailureCopy(failure);
      await _showOwnedMessage(
        owner,
        icon: Icons.phone_disabled_outlined,
        title: title,
        message: message,
      );
      return;
    } finally {
      if (_isInteractionOwnerSynchronouslyCurrent(owner)) {
        setState(() => _saving = false);
      }
    }

    if (!await _isInteractionOwnerCurrent(owner)) return;
    if (challenge.automaticallyVerified) {
      final refresh = await _contactVerificationService.refreshVerifiedProfile(
        owner.context,
      );
      if (!await _isInteractionOwnerCurrent(owner)) return;
      if (refresh.user case final User updated) {
        setState(() => _user = updated);
      }
      await _showOwnedMessage(
        owner,
        icon: Icons.verified_outlined,
        title: 'Telefonnummer verifiziert',
        message: refresh.kind == ContactProfileRefreshKind.refreshed
            ? 'Deine Telefonnummer wurde erfolgreich bestätigt.'
            : 'Die Nummer wurde bestätigt. Der Profilstatus wird beim nächsten Laden aktualisiert.',
      );
      return;
    }

    // Let the TextField own its controller through the route's exit animation.
    // A modal result completes before its input widgets are disposed.
    var smsCode = '';
    var sheetOpen = true;
    var confirmationAccepted = false;
    bool verifying = false;
    String? inlineErrorTitle;
    String? inlineErrorMessage;

    final refreshKind = await _showOwnedSheet<ContactProfileRefreshKind>(
      owner: owner,
      builder: (sheetContext) {
        return _SheetScaffold(
          title: 'Telefonnummer verifizieren',
          subtitle:
              'Wir haben einen sechsstelligen SMS‑Code an ${challenge.phoneNumber} gesendet.',
          child: StatefulBuilder(
            builder: (context, setLocal) {
              return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (inlineErrorTitle != null) ...[
                      _InlineError(
                        text: inlineErrorMessage == null
                            ? inlineErrorTitle!
                            : '$inlineErrorTitle\n$inlineErrorMessage',
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      onChanged: (value) => smsCode = value,
                      readOnly: confirmationAccepted,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(
                          labelText: 'SMS‑Code',
                          prefixIcon: Icon(Icons.sms_outlined)),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: verifying || confirmationAccepted
                          ? null
                          : () async {
                              final submittedCode = smsCode;
                              setLocal(() {
                                verifying = true;
                                // A prior rejection is not the result of this
                                // new, still-pending confirmation attempt.
                                inlineErrorTitle = null;
                                inlineErrorMessage = null;
                              });
                              try {
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetOpen) {
                                  return;
                                }
                                await _contactVerificationService
                                    .confirmPhoneVerification(
                                  context: owner.context,
                                  challenge: challenge,
                                  smsCode: submittedCode,
                                );
                                confirmationAccepted = true;
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetOpen ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                final refresh =
                                    await _contactVerificationService
                                        .refreshVerifiedProfile(owner.context);
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetOpen ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                if (refresh.user case final User updated) {
                                  setState(() => _user = updated);
                                }
                                Navigator.of(sheetContext).pop(refresh.kind);
                              } on ContactActionFailure catch (failure) {
                                if (failure.kind ==
                                        ContactActionFailureKind
                                            .principalChanged ||
                                    !await _isInteractionOwnerCurrent(owner) ||
                                    !sheetOpen ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                final copy = confirmationAccepted
                                    ? _confirmedPhoneRefreshFailureCopy
                                    : _phoneContactFailureCopy(failure);
                                confirmationAccepted = confirmationAccepted ||
                                    failure.remoteAcceptedOrConfirmed;
                                setLocal(() {
                                  inlineErrorTitle = copy.$1;
                                  inlineErrorMessage = copy.$2;
                                });
                              } catch (error) {
                                debugPrint(
                                  '[ContactData] verify phone failed: '
                                  '${error.runtimeType}',
                                );
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetOpen ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                setLocal(() {
                                  inlineErrorTitle = confirmationAccepted
                                      ? _confirmedPhoneRefreshFailureCopy.$1
                                      : 'Telefonprüfung nicht abgeschlossen';
                                  inlineErrorMessage = confirmationAccepted
                                      ? _confirmedPhoneRefreshFailureCopy.$2
                                      : 'Der Ergebnisstatus ist unbekannt. Lade dein Profil neu, bevor du den Vorgang wiederholst.';
                                });
                              } finally {
                                if (sheetOpen &&
                                    sheetContext.mounted &&
                                    _isInteractionOwnerSynchronouslyCurrent(
                                      owner,
                                    )) {
                                  setLocal(() => verifying = false);
                                }
                              }
                            },
                      child: verifying
                          ? const _BusyButtonLabel()
                          : const Text('Bestätigen'),
                    ),
                  ]);
            },
          ),
        );
      },
    );
    sheetOpen = false;
    smsCode = '';
    if (refreshKind == null || !await _isInteractionOwnerCurrent(owner)) {
      return;
    }
    await _showOwnedMessage(
      owner,
      icon: Icons.verified_outlined,
      title: 'Telefonnummer verifiziert',
      message: refreshKind == ContactProfileRefreshKind.refreshed
          ? 'Deine Telefonnummer wurde erfolgreich bestätigt.'
          : 'Die Nummer wurde bestätigt. Der Profilstatus wird beim nächsten Laden aktualisiert.',
    );
  }

  static const _confirmedPhoneRefreshFailureCopy = (
    'Telefonnummer bestätigt',
    'Die Nummer wurde serverseitig bestätigt. Der Profilstatus konnte noch nicht aktualisiert werden. Lade dein Profil neu; bestätige denselben Code nicht erneut.'
  );

  (String, String?) _phoneContactFailureCopy(ContactActionFailure failure) =>
      failure.remoteAcceptedOrConfirmed
          ? (
              'Telefonnummer bestätigt',
              'Die Bestätigung wurde serverseitig verarbeitet, aber die lokale Sicherheitsbereinigung ist noch nicht abgeschlossen. Melde dich erneut an, bevor du fortfährst.'
            )
          : switch (failure.kind) {
              ContactActionFailureKind.rejected => switch (failure.code) {
                  'invalidPhone' => (
                      'Telefonnummer prüfen',
                      'Prüfe Ländervorwahl und alle Ziffern.'
                    ),
                  'invalidCode' => (
                      'SMS-Code prüfen',
                      'Der Code ist falsch, abgelaufen oder gehört zu einer älteren SMS.'
                    ),
                  'phoneAlreadyVerified' => (
                      'Telefonnummer bereits verwendet',
                      'Diese Nummer ist bereits mit einem anderen Konto verifiziert.'
                    ),
                  'rateLimited' => (
                      'Bitte kurz warten',
                      'Versuche es später erneut.'
                    ),
                  'sessionExpired' => (
                      'Erneut anmelden',
                      'Die Sitzung ist abgelaufen; die Aktion wurde nicht fortgesetzt.'
                    ),
                  'invalidToken' || 'phoneMismatch' => (
                      'Telefonnummer stimmt nicht überein',
                      'Fordere einen neuen Code für die eingegebene Nummer an.'
                    ),
                  _ => ('Telefonprüfung abgelehnt', null),
                },
              ContactActionFailureKind.localUnavailable => (
                  'Telefonprüfung nicht verfügbar',
                  'Die sichere SMS-Prüfung konnte nicht gestartet werden.'
                ),
              ContactActionFailureKind.outcomeUnknown => (
                  'Ergebnisstatus unklar',
                  'SMS oder Bestätigung könnten bereits verarbeitet worden sein. Lade den Profilstatus neu, bevor du den Vorgang wiederholst.'
                ),
              ContactActionFailureKind.principalChanged => (
                  'Aktion beendet',
                  'Das aktive Konto hat gewechselt.'
                ),
            };

  Future<void> _verifyEmailFlow() async {
    final owner = _captureInteractionOwner();
    if (owner == null) return;
    final emailError = _validateEmail(_emailCtrl.text);
    if (emailError != null) {
      await _showOwnedMessage(
        owner,
        icon: Icons.error_outline,
        title: 'E-Mail-Adresse prüfen',
        message: emailError,
      );
      return;
    }

    if (!_contactVerificationService.isBackendEnabled) {
      await _showOwnedMessage(
        owner,
        icon: Icons.lock_outline,
        title: 'Bestätigung nicht verfügbar',
        message:
            'Eine E-Mail gilt erst nach Prüfung durch den unterstützten Anmeldeweg als bestätigt.',
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await _contactVerificationService.requestContactEmailVerification(
        owner.context,
      );
    } on ContactActionFailure catch (failure) {
      if (failure.kind == ContactActionFailureKind.principalChanged ||
          !await _isInteractionOwnerCurrent(owner)) {
        return;
      }
      final (title, message) = switch (failure.kind) {
        ContactActionFailureKind.rejected => (
            'Bitte kurz warten',
            'Die Anfrage wurde begrenzt. Versuche es später erneut.'
          ),
        ContactActionFailureKind.localUnavailable => (
            'Bestätigung nicht gestartet',
            'Die Bestätigungsfunktion ist derzeit nicht verfügbar.'
          ),
        ContactActionFailureKind.outcomeUnknown => (
            'Versandstatus unklar',
            'Die E-Mail könnte bereits gesendet worden sein. Prüfe dein Postfach, bevor du erneut anforderst.'
          ),
        ContactActionFailureKind.principalChanged => (null, null),
      };
      if (title != null) {
        await _showOwnedMessage(
          owner,
          icon: Icons.error_outline,
          title: title,
          message: message,
        );
      }
      return;
    } finally {
      if (_isInteractionOwnerSynchronouslyCurrent(owner)) {
        setState(() => _saving = false);
      }
    }
    if (!await _isInteractionOwnerCurrent(owner)) return;

    String? inlineStatus;
    final verified = await _showOwnedSheet<bool>(
      owner: owner,
      builder: (sheetContext) {
        bool confirming = false;
        return _SheetScaffold(
          title: 'E‑Mail bestätigen',
          subtitle:
              'Wir haben dir einen Bestätigungslink gesendet. Sobald du ihn geöffnet hast, bestätige hier.',
          child: StatefulBuilder(
            builder: (context, setLocal) {
              return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (inlineStatus != null) ...[
                      _InlineError(text: inlineStatus!),
                      const SizedBox(height: 12),
                    ],
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                            color: Colors.white.withValues(alpha: 0.10)),
                      ),
                      child: Row(children: [
                        Icon(Icons.mail_outline,
                            color: Colors.white.withValues(alpha: 0.85)),
                        const SizedBox(width: 10),
                        Expanded(
                            child: Text(owner.context.user.email,
                                style: Theme.of(context).textTheme.bodyMedium)),
                      ]),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: confirming
                          ? null
                          : () async {
                              setLocal(() => confirming = true);
                              try {
                                if (!await _isInteractionOwnerCurrent(owner)) {
                                  return;
                                }
                                final refresh =
                                    await _contactVerificationService
                                        .refreshVerifiedProfile(
                                  owner.context,
                                );
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                final updated = refresh.user;
                                if (updated != null && updated.emailVerified) {
                                  setState(() => _user = updated);
                                  Navigator.of(sheetContext).pop(true);
                                  return;
                                }
                                setLocal(() {
                                  inlineStatus = refresh.kind ==
                                          ContactProfileRefreshKind.refreshed
                                      ? 'Link noch nicht bestätigt. Öffne zuerst den neuesten Bestätigungslink.'
                                      : 'Der Serverstatus konnte nicht geladen werden. Es wird weder „bestätigt“ noch „nicht bestätigt“ angenommen.';
                                });
                              } on ContactActionFailure catch (failure) {
                                if (failure.kind ==
                                        ContactActionFailureKind
                                            .principalChanged ||
                                    !await _isInteractionOwnerCurrent(owner) ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                setLocal(() {
                                  inlineStatus = failure.kind ==
                                          ContactActionFailureKind
                                              .outcomeUnknown
                                      ? 'Der Serverstatus ist unbekannt. Lade ihn erneut, bevor du eine Bestätigung annimmst.'
                                      : 'Der Bestätigungsstatus konnte nicht geladen werden.';
                                });
                              } catch (e) {
                                debugPrint(
                                  '[ContactData] verify email failed: '
                                  '${e.runtimeType}',
                                );
                                if (!await _isInteractionOwnerCurrent(owner) ||
                                    !sheetContext.mounted) {
                                  return;
                                }
                                setLocal(() {
                                  inlineStatus =
                                      'Der Bestätigungsstatus konnte nicht geladen werden.';
                                });
                              } finally {
                                if (sheetContext.mounted &&
                                    _isInteractionOwnerSynchronouslyCurrent(
                                      owner,
                                    )) {
                                  setLocal(() => confirming = false);
                                }
                              }
                            },
                      child: confirming
                          ? const _BusyButtonLabel()
                          : const Text('Ich habe bestätigt'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.white70),
                    ),
                  ]);
            },
          ),
        );
      },
    );
    if (verified == true && await _isInteractionOwnerCurrent(owner)) {
      await _showOwnedMessage(
        owner,
        icon: Icons.verified_outlined,
        title: 'E-Mail bestätigt',
      );
    }
  }

  (double, double) _pseudoGeocode(String address) {
    // Deterministic pseudo coordinates from address hash.
    final seed =
        address.codeUnits.fold<int>(0, (a, b) => (a * 31 + b) & 0x7fffffff);
    final r = Random(seed);

    // Rough bounding box around DACH region (privacy-friendly demo).
    final lat = 46.6 + r.nextDouble() * (54.9 - 46.6);
    final lng = 5.9 + r.nextDouble() * (15.2 - 5.9);
    return (lat, lng);
  }

  Future<void> _confirmLocationOnMap() async {
    final owner = _profileActions.capture();
    if (owner == null) return;
    if (!_hasRequiredAddressFields) {
      await _profileActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Adresse noch unvollständig'),
          content: const Text('Bitte vervollständige zuerst die Adresse.'),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final u = owner.context.user;

    final address = _composeAddressLine();
    final (lat0, lng0) = u.homeLat != null && u.homeLng != null
        ? (u.homeLat!, u.homeLng!)
        : _pseudoGeocode(address);

    double lat = lat0;
    double lng = lng0;
    bool saving = false;
    String? inlineError;

    final result =
        await _profileActions.showOwnedSheet<AccountProfileMutationResult>(
      context: context,
      owner: owner,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return _SheetScaffold(
          title: 'Standort auf Karte bestätigen',
          subtitle:
              'Wir speichern optionale GPS‑Koordinaten, um Entfernungen für die lokale Suche und sichere Übergabeplanung berechnen zu können.',
          child: StatefulBuilder(
            builder: (context, setLocal) {
              return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (inlineError != null) ...[
                      _InlineError(text: inlineError!),
                      const SizedBox(height: 12),
                    ],
                    ApproxLocationMap(
                        lat: lat, lng: lng, label: 'Dein Standort (ungefähr)'),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            final (a, b) = _pseudoGeocode(
                                '${address}_${DateTime.now().microsecondsSinceEpoch}');
                            setLocal(() {
                              lat = a;
                              lng = b;
                            });
                          },
                          icon: const Icon(Icons.refresh_rounded,
                              color: Colors.white),
                          label: const Text('Neu berechnen',
                              style: TextStyle(color: Colors.white)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  setLocal(() => saving = true);
                                  try {
                                    if (!await _profileActions.isCurrent(
                                      _profileMutationService,
                                      owner,
                                    )) {
                                      return;
                                    }
                                    final mutation =
                                        await _profileMutationService
                                            .updateProfile(
                                      context: owner.context,
                                      updates: {
                                        CurrentUserProfileField.homeLat: lat,
                                        CurrentUserProfileField.homeLng: lng,
                                      },
                                    );
                                    if (!await _profileActions.isCurrent(
                                          _profileMutationService,
                                          owner,
                                        ) ||
                                        !sheetContext.mounted) {
                                      return;
                                    }
                                    Navigator.of(sheetContext).pop(mutation);
                                  } on ProfileMutationFailure catch (failure) {
                                    if (failure.kind ==
                                            ProfileMutationFailureKind
                                                .principalChanged ||
                                        !await _profileActions.isCurrent(
                                          _profileMutationService,
                                          owner,
                                        ) ||
                                        !sheetContext.mounted) {
                                      return;
                                    }
                                    setLocal(() {
                                      inlineError = failure.remoteAccepted
                                          ? 'Die Koordinaten wurden serverseitig gespeichert; der lokale Profilstand konnte noch nicht aktualisiert werden.'
                                          : failure.kind ==
                                                  ProfileMutationFailureKind
                                                      .outcomeUnknown
                                              ? 'Der Speicherstatus ist unklar. Lade dein Profil neu, bevor du erneut speicherst.'
                                              : 'Der Standort wurde nicht gespeichert.';
                                    });
                                  } catch (e) {
                                    debugPrint(
                                      '[ContactData] save coords failed: '
                                      '${e.runtimeType}',
                                    );
                                    if (!await _profileActions.isCurrent(
                                          _profileMutationService,
                                          owner,
                                        ) ||
                                        !sheetContext.mounted) {
                                      return;
                                    }
                                    setLocal(() {
                                      inlineError =
                                          'Der Standort wurde nicht gespeichert. Bitte versuche es erneut.';
                                    });
                                  } finally {
                                    if (sheetContext.mounted &&
                                        _profileActions
                                            .isSynchronouslyCurrent(owner)) {
                                      setLocal(() => saving = false);
                                    }
                                  }
                                },
                          child: saving
                              ? const _BusyButtonLabel()
                              : const Text('Speichern'),
                        ),
                      ),
                    ]),
                  ]);
            },
          ),
        );
      },
    );
    if (result == null ||
        !await _profileActions.isCurrent(_profileMutationService, owner)) {
      return;
    }
    setState(() => _user = result.user);
    _profileActions.replaceContext(ProfileMutationContext(
      user: result.user,
      owner: owner.context.owner,
    ));
    final refreshedOwner = _profileActions.capture();
    if (refreshedOwner == null || !mounted) return;
    await _profileActions.showOwnedDialog<void>(
      context: context,
      owner: refreshedOwner,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Standort gespeichert'),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    final theme = Theme.of(context);

    return Stack(children: [
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
          title: const Text('Kontaktinformationen'),
          centerTitle: true,
          leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : SafeArea(
                top: false,
                child: Column(children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(
                          16, kToolbarHeight + 18, 16, 24),
                      child: Form(
                        key: _formKey,
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('Kontaktinformationen',
                                  style: theme.textTheme.titleLarge),
                              const SizedBox(height: 8),
                              Text(
                                'Diese Informationen werden für Kommunikation, Verifizierung sowie für Übergaben und Rückgaben verwendet. Deine Daten sind nicht öffentlich sichtbar.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                    color: Colors.white70, height: 1.45),
                              ),
                              if (_generalError.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                _InlineError(text: _generalError),
                              ],
                              const SizedBox(height: 18),
                              _SectionHeader(title: 'Telefonnummer'),
                              const SizedBox(height: 10),
                              _SectionCard(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      TextFormField(
                                        controller: _phoneCtrl,
                                        keyboardType: TextInputType.phone,
                                        autofillHints: const [
                                          AutofillHints.telephoneNumber
                                        ],
                                        validator: _validatePhone,
                                        decoration: const InputDecoration(
                                          labelText: 'Telefonnummer',
                                          hintText: '+49 151 23456789',
                                          prefixIcon:
                                              Icon(Icons.phone_outlined),
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      _VerifyStatusRow(
                                        verified: user?.phoneVerified ?? false,
                                        verifiedLabel: 'Verifiziert',
                                        unverifiedLabel: 'Nicht verifiziert',
                                      ),
                                      const SizedBox(height: 12),
                                      FilledButton.icon(
                                        onPressed:
                                            (user?.phoneVerified ?? false) ||
                                                    _saving
                                                ? null
                                                : _verifyPhoneFlow,
                                        icon:
                                            const Icon(Icons.verified_outlined),
                                        label: const Text(
                                            'Telefonnummer verifizieren'),
                                      ),
                                      if (!(user?.phoneVerified ?? false)) ...[
                                        const SizedBox(height: 8),
                                        Text(
                                          'Der SMS-Code wird sicher über Firebase Authentication versendet. ShareItToo speichert den Code nicht.',
                                          style: theme.textTheme.bodySmall
                                              ?.copyWith(color: Colors.white70),
                                        ),
                                      ],
                                    ]),
                              ),
                              const SizedBox(height: 18),
                              _SectionHeader(title: 'E‑Mail‑Adresse'),
                              const SizedBox(height: 10),
                              _SectionCard(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      TextFormField(
                                        controller: _emailCtrl,
                                        readOnly: false,
                                        keyboardType:
                                            TextInputType.emailAddress,
                                        autofillHints: const [
                                          AutofillHints.email
                                        ],
                                        validator: _validateEmail,
                                        decoration: InputDecoration(
                                          labelText: 'E‑Mail‑Adresse',
                                          prefixIcon:
                                              const Icon(Icons.alternate_email),
                                          helperText: _contactVerificationService
                                                  .isBackendEnabled
                                              ? 'Eine Änderung wird erst nach Bestätigung über den Link wirksam.'
                                              : null,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      _VerifyStatusRow(
                                        verified: user?.emailVerified ?? false,
                                        verifiedLabel: 'Verifiziert',
                                        unverifiedLabel: 'Nicht verifiziert',
                                      ),
                                      const SizedBox(height: 12),
                                      FilledButton.icon(
                                        onPressed:
                                            (user?.emailVerified ?? false) ||
                                                    _saving
                                                ? null
                                                : _verifyEmailFlow,
                                        icon: const Icon(
                                            Icons.mark_email_read_outlined,
                                            color: Colors.white),
                                        label: const Text('E‑Mail bestätigen',
                                            style:
                                                TextStyle(color: Colors.white)),
                                      ),
                                    ]),
                              ),
                              const SizedBox(height: 18),
                              _SectionHeader(title: 'Adresse'),
                              const SizedBox(height: 8),
                              Text(
                                'Die Adresse ist verpflichtend, da sie für sichere Übergaben und Rückgaben benötigt wird.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                    color: Colors.white70, height: 1.45),
                              ),
                              const SizedBox(height: 10),
                              _SectionCard(
                                child: Column(children: [
                                  Row(children: [
                                    Expanded(
                                      flex: 3,
                                      child: TextFormField(
                                        controller: _streetCtrl,
                                        textInputAction: TextInputAction.next,
                                        validator: (v) =>
                                            _required('Straße', v),
                                        decoration: const InputDecoration(
                                            labelText: 'Straße',
                                            prefixIcon:
                                                Icon(Icons.signpost_outlined)),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      flex: 2,
                                      child: TextFormField(
                                        controller: _houseNumberCtrl,
                                        textInputAction: TextInputAction.next,
                                        validator: (v) =>
                                            _required('Hausnummer', v),
                                        decoration: const InputDecoration(
                                            labelText: 'Hausnummer'),
                                      ),
                                    ),
                                  ]),
                                  const SizedBox(height: 12),
                                  Row(children: [
                                    Expanded(
                                      flex: 2,
                                      child: TextFormField(
                                        controller: _postalCodeCtrl,
                                        textInputAction: TextInputAction.next,
                                        keyboardType: TextInputType.text,
                                        validator: _validatePostal,
                                        decoration: const InputDecoration(
                                            labelText: 'Postleitzahl',
                                            prefixIcon: Icon(Icons
                                                .local_post_office_outlined)),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      flex: 3,
                                      child: TextFormField(
                                        controller: _cityCtrl,
                                        textInputAction: TextInputAction.next,
                                        validator: (v) => _required('Stadt', v),
                                        decoration: const InputDecoration(
                                            labelText: 'Stadt'),
                                      ),
                                    ),
                                  ]),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _countryCtrl,
                                    textInputAction: TextInputAction.next,
                                    validator: (v) => _required('Land', v),
                                    decoration: const InputDecoration(
                                        labelText: 'Land',
                                        prefixIcon:
                                            Icon(Icons.public_outlined)),
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _extraCtrl,
                                    textInputAction: TextInputAction.done,
                                    decoration: const InputDecoration(
                                        labelText: 'Adresszusatz (optional)',
                                        prefixIcon:
                                            Icon(Icons.apartment_outlined)),
                                  ),
                                  const SizedBox(height: 14),
                                  if (_hasRequiredAddressFields)
                                    OutlinedButton.icon(
                                      onPressed: _confirmLocationOnMap,
                                      icon: const Icon(Icons.map_outlined,
                                          color: Colors.white),
                                      label: const Text(
                                          'Standort auf Karte bestätigen',
                                          style:
                                              TextStyle(color: Colors.white)),
                                    ),
                                  if (!_hasRequiredAddressFields)
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        'Standortbestätigung ist optional (verfügbar, sobald die Pflichtfelder ausgefüllt sind).',
                                        style: theme.textTheme.bodySmall
                                            ?.copyWith(color: Colors.white60),
                                      ),
                                    ),
                                ]),
                              ),
                              const SizedBox(height: 12),
                              _PrivacyNote(
                                text:
                                    'Deine Adresse wird nur für Buchungen, Übergaben und Rückgaben verwendet. Sie ist nicht öffentlich sichtbar.\n\nDie genaue Adresse wird bei Buchungen erst nach der festgelegten Zeit- und Statusregel für Übergabe oder Rückgabe angezeigt.',
                              ),
                              const SizedBox(height: 80),
                            ]),
                      ),
                    ),
                  ),
                  _BottomSaveBar(
                    saving: _saving,
                    onSave: _saving ? null : _save,
                  ),
                ]),
              ),
      ),
    ]);
  }
}

class _ParsedAddress {
  final String? street;
  final String? houseNumber;
  final String? postalCode;
  final String? city;
  const _ParsedAddress(
      {this.street, this.houseNumber, this.postalCode, this.city});
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(title,
        style: Theme.of(context)
            .textTheme
            .titleMedium
            ?.copyWith(letterSpacing: 0.2));
  }
}

class _SectionCard extends StatelessWidget {
  final Widget child;
  const _SectionCard({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: child,
    );
  }
}

class _VerifyStatusRow extends StatelessWidget {
  final bool verified;
  final String verifiedLabel;
  final String unverifiedLabel;
  const _VerifyStatusRow(
      {required this.verified,
      required this.verifiedLabel,
      required this.unverifiedLabel});

  @override
  Widget build(BuildContext context) {
    final bg = verified
        ? BrandColors.success.withValues(alpha: 0.18)
        : BrandColors.danger.withValues(alpha: 0.18);
    final border = verified
        ? BrandColors.success.withValues(alpha: 0.35)
        : BrandColors.danger.withValues(alpha: 0.35);
    final icon =
        verified ? Icons.check_circle_rounded : Icons.error_outline_rounded;
    final text = verified ? verifiedLabel : unverifiedLabel;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: border)),
      child: Row(children: [
        Icon(icon,
            size: 18,
            color: verified ? BrandColors.success : BrandColors.danger),
        const SizedBox(width: 8),
        Expanded(
            child: Text(text,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.white))),
      ]),
    );
  }
}

class _PrivacyNote extends StatelessWidget {
  final String text;
  const _PrivacyNote({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.lock_outline_rounded,
            color: Colors.white.withValues(alpha: 0.85), size: 18),
        const SizedBox(width: 10),
        Expanded(
            child: Text(text,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.white70, height: 1.45))),
      ]),
    );
  }
}

class _ContactInteractionOwner {
  final ContactVerificationContext context;
  final int epoch;

  const _ContactInteractionOwner({
    required this.context,
    required this.epoch,
  });
}

class _InlineError extends StatelessWidget {
  final String text;
  const _InlineError({required this.text});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BrandColors.danger.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.danger.withValues(alpha: 0.30)),
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, color: Colors.white, size: 18),
        const SizedBox(width: 10),
        Expanded(
            child: Text(text,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.white))),
      ]),
    );
  }
}

class _BottomSaveBar extends StatelessWidget {
  final bool saving;
  final VoidCallback? onSave;
  const _BottomSaveBar({required this.saving, required this.onSave});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        child: SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton(
            onPressed: onSave,
            child: saving
                ? const _BusyButtonLabel()
                : const Text('Änderungen speichern'),
          ),
        ),
      ),
    );
  }
}

class _BusyButtonLabel extends StatelessWidget {
  const _BusyButtonLabel();

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisAlignment: MainAxisAlignment.center, children: const [
      SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2)),
      SizedBox(width: 10),
      Text('Bitte warten…'),
    ]);
  }
}

class _SheetScaffold extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;
  const _SheetScaffold(
      {required this.title, required this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A).withValues(alpha: 0.96),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                        child: Text(title,
                            style: Theme.of(context).textTheme.titleMedium)),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                      color: Colors.white,
                      tooltip: 'Schließen',
                    ),
                  ]),
                  Text(subtitle,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.white70, height: 1.45)),
                  const SizedBox(height: 14),
                  child,
                ]),
          ),
        ),
      ),
    );
  }
}
