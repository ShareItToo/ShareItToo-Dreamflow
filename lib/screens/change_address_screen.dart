import 'dart:async';
import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';

class ChangeAddressScreen extends StatefulWidget {
  final ProfileMutationService profileMutationService;

  const ChangeAddressScreen({
    super.key,
    this.profileMutationService = const ProfileMutationService(),
  });
  @override
  State<ChangeAddressScreen> createState() => _ChangeAddressScreenState();
}

class _ChangeAddressScreenState extends State<ChangeAddressScreen> {
  bool _loading = true;
  String _error = '';
  final _addrCtrl = TextEditingController();
  final _profileActions = ProfileMutationInteractionController();
  StreamSubscription<String>? _persistenceSubscription;
  int _loadRevision = 0;

  ProfileMutationService get _profileMutationService =>
      widget.profileMutationService;

  @override
  void initState() {
    super.initState();
    _persistenceSubscription = SharedPersistenceSync.changes.listen((key) {
      if (key != SharedPersistenceSync.accountSecurityStateKey) return;
      _profileActions.invalidate();
      _loadRevision += 1;
      if (mounted) {
        setState(() {
          _loading = true;
          _error = '';
          _addrCtrl.clear();
        });
      }
      unawaited(_load());
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _profileActions.dispose();
    _addrCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    final profileContext = await _profileMutationService.loadCurrentContext();
    if (!mounted || revision != _loadRevision) return;
    _profileActions.replaceContext(profileContext);
    final u = profileContext?.user;
    setState(() {
      _loading = false;
      _addrCtrl.text = _addressDisplay(u) == '—' ? '' : _addressDisplay(u);
    });
  }

  String _addressDisplay(User? u) {
    if (u == null) return '—';
    final line = (u.homeLocation ?? '').trim();
    if (line.isNotEmpty) return line;
    final city = (u.city ?? '').trim();
    final country = (u.country ?? '').trim();
    if (city.isEmpty && country.isEmpty) return '—';
    if (city.isEmpty) return country;
    if (country.isEmpty) return city;
    return '$city, $country';
  }

  bool _hasStreetNumber(String input) {
    final raw = input.trim();
    if (raw.isEmpty) return false;
    final first = raw.split(',').first.trim();
    return RegExp(r"\d").hasMatch(first);
  }

  Future<void> _save() async {
    final owner = _profileActions.capture();
    final screenRoute = ModalRoute.of(context);
    if (owner == null) return;
    final line = _addrCtrl.text.trim();
    if (line.isEmpty) {
      setState(() => _error = 'Bitte gib eine Adresse ein');
      return;
    }
    if (!_hasStreetNumber(line)) {
      setState(() => _error =
          'Bitte gib Straße und Hausnummer an (z. B. Musterstraße 12)');
      return;
    }
    try {
      final derivedCity = DataService.deriveCityFromAddress(line);
      final result = await _profileMutationService.updateProfile(
        context: owner.context,
        updates: {
          CurrentUserProfileField.homeLocation: line,
          if (derivedCity.isNotEmpty) CurrentUserProfileField.city: derivedCity,
        },
      );
      if (!await _profileActions.isCurrent(
        _profileMutationService,
        owner,
      )) {
        return;
      }
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
          title: const Text('Adresse gespeichert'),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      if (!await _profileActions.isCurrent(
        _profileMutationService,
        refreshedOwner,
      )) {
        return;
      }
      _profileActions.removeOwnedNavigationRoute(screenRoute);
    } on ProfileMutationFailure catch (failure) {
      if (failure.kind == ProfileMutationFailureKind.principalChanged ||
          !await _profileActions.isCurrent(
            _profileMutationService,
            owner,
          )) {
        return;
      }
      setState(() {
        _error = failure.remoteAccepted
            ? 'Die Adresse wurde serverseitig gespeichert; der lokale Profilstand konnte noch nicht aktualisiert werden.'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Der Speicherstatus ist unklar. Lade dein Profil neu, bevor du erneut speicherst.'
                : failure.kind == ProfileMutationFailureKind.rejected
                    ? 'Die Adresse wurde vom Server abgelehnt.'
                    : 'Die Adresse konnte lokal nicht gespeichert werden.';
      });
    } catch (e) {
      debugPrint('[ChangeAddress] save failed: $e');
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        setState(() => _error = 'Speichern fehlgeschlagen');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Positioned.fill(
          child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(color: Colors.black.withValues(alpha: 0.35)))),
      Scaffold(
        extendBodyBehindAppBar: true,
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          title: const Text('Adresse ändern'),
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
                      TextField(
                        controller: _addrCtrl,
                        keyboardType: TextInputType.streetAddress,
                        autofillHints: const [
                          AutofillHints.streetAddressLine1,
                          AutofillHints.streetAddressLine2,
                          AutofillHints.postalCode,
                          AutofillHints.addressCity
                        ],
                        decoration: const InputDecoration(
                            prefixIcon: Icon(Icons.place_outlined),
                            labelText:
                                'Adresse (Straße und Hausnummer, PLZ, Stadt)',
                            hintText: 'z. B. Musterstraße 12, 12345 Berlin'),
                      ),
                      const SizedBox(height: 12),
                      Text(
                          'Nur du und deine Gegenpartei nach Annahme sehen diese Adresse.',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.white70)),
                      if (_error.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(_error,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: Colors.redAccent)),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                          onPressed: _save, child: const Text('Speichern')),
                    ]),
              ),
      ),
    ]);
  }
}
