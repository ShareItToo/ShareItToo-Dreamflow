import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';
import 'package:lendify/widgets/profile_header_card.dart';
import 'package:lendify/widgets/user_avatar.dart';
import 'package:provider/provider.dart';

enum _ProfilePhotoChoice { camera, gallery, remove }

class ProfileInfoScreen extends StatefulWidget {
  final ProfileMutationService profileMutationService;

  const ProfileInfoScreen({
    super.key,
    this.profileMutationService = const ProfileMutationService(),
  });
  @override
  State<ProfileInfoScreen> createState() => _ProfileInfoScreenState();
}

class _ProfileInfoScreenState extends State<ProfileInfoScreen> {
  User? _user;
  bool _loading = true;
  bool _saving = false;

  final _formKey = GlobalKey<FormState>();

  // Controllers
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _birthYearCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();

  String? _photoDraft; // persisted as data:image/... base64

  final Set<String> _languages = {};
  final Set<String> _interests = {};

  static const List<String> _languageOptions = [
    'Afrikaans',
    'Arabisch',
    'Armenisch',
    'Aserbaidschanisch',
    'Bengalisch',
    'Bulgarisch',
    'Chinesisch',
    'Dänisch',
    'Deutsch',
    'Englisch',
    'Estnisch',
    'Finnisch',
    'Französisch',
    'Griechisch',
    'Hebräisch',
    'Hindi',
    'Indonesisch',
    'Irisch',
    'Italienisch',
    'Japanisch',
    'Koreanisch',
    'Kroatisch',
    'Lettisch',
    'Litauisch',
    'Niederländisch',
    'Norwegisch',
    'Persisch',
    'Polnisch',
    'Portugiesisch',
    'Rumänisch',
    'Russisch',
    'Schwedisch',
    'Serbisch',
    'Slowakisch',
    'Slowenisch',
    'Spanisch',
    'Thai',
    'Tschechisch',
    'Türkisch',
    'Ukrainisch',
    'Ungarisch',
    'Urdu',
    'Vietnamesisch',
  ];

  static const List<String> _interestOptions = [
    'Auto & Schrauben',
    'Bücher',
    'Camping',
    'Computer',
    'Design',
    'DIY & Heimwerken',
    'E-Bikes',
    'Elektronik',
    'Events',
    'Fashion',
    'Fitness',
    'Fotografie',
    'Freizeitparks',
    'Gaming',
    'Garten',
    'Handwerk',
    'Haustiere',
    'Kochen',
    'Kunst',
    'Laufen',
    'Möbel & Einrichtung',
    'Motorrad',
    'Musik',
    'Nachhaltigkeit',
    'Outdoor',
    'Party & DJ',
    'Reisen',
    'Smart Home',
    'Sport',
    'Surfen',
    'Technik',
    'Tennis',
    'Wandern',
    'Wassersport',
    'Werkzeuge',
    'Winter & Ski',
    'Yoga',
  ];

  int _bookingsCount = 0;
  int _rentalsCount = 0;
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
          _user = null;
          _loading = true;
          _saving = false;
          _clearDraft();
        });
      }
      unawaited(_load());
    });
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    try {
      final profileContext = await _profileMutationService.loadCurrentContext();
      if (!mounted || revision != _loadRevision) return;
      final u = profileContext?.user;
      int bookings = 0;
      int rentals = 0;
      if (u != null && profileContext != null) {
        try {
          final renter = await DataService.getRentalRequestsForRenter(u.id);
          if (revision != _loadRevision ||
              !await _profileMutationService.isContextCurrent(profileContext)) {
            return;
          }
          bookings = renter.length;
        } catch (e) {
          debugPrint('[ProfileInfo] load bookings failed: $e');
        }
        try {
          final owner = await DataService.getRentalRequestsForOwner(u.id);
          if (revision != _loadRevision ||
              !await _profileMutationService.isContextCurrent(profileContext)) {
            return;
          }
          rentals = owner.length;
        } catch (e) {
          debugPrint('[ProfileInfo] load rentals failed: $e');
        }
      }
      if (!mounted || revision != _loadRevision) return;
      _profileActions.replaceContext(profileContext);
      setState(() {
        _user = u;
        _loading = false;
        _bookingsCount = bookings;
        _rentalsCount = rentals;
        if (u != null) {
          final split = _splitDisplayName(u.displayName);
          _firstNameCtrl.text = split.$1;
          _lastNameCtrl.text = split.$2;
          _birthYearCtrl.text = u.birthDate?.year.toString() ?? '';
          _cityCtrl.text = u.city ?? '';
          _bioCtrl.text = u.bio ?? '';
          _photoDraft = (u.photoURL != null && u.photoURL!.trim().isNotEmpty)
              ? u.photoURL
              : null;
          _languages
            ..clear()
            ..addAll(u.languages);
          _interests
            ..clear()
            ..addAll(u.interests);
        }
      });
    } catch (e) {
      // just fallback to empty; DataService already logs critical errors when needed
      if (!mounted || revision != _loadRevision) return;
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _profileActions.dispose();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _birthYearCtrl.dispose();
    _cityCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  void _clearDraft() {
    _firstNameCtrl.clear();
    _lastNameCtrl.clear();
    _birthYearCtrl.clear();
    _cityCtrl.clear();
    _bioCtrl.clear();
    _photoDraft = null;
    _languages.clear();
    _interests.clear();
    _bookingsCount = 0;
    _rentalsCount = 0;
  }

  Future<void> _save() async {
    final l10n = context.read<LocalizationController>();
    final u = _user;
    final owner = _profileActions.capture();
    final screenRoute = ModalRoute.of(context);
    if (u == null || owner == null) return;

    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid) return;

    final birthYear = int.tryParse(_birthYearCtrl.text.trim());
    final birthDate = (birthYear == null) ? null : DateTime(birthYear, 1, 1);

    final displayName =
        '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim();
    setState(() => _saving = true);
    try {
      final result = await _profileMutationService.updateProfile(
        context: owner.context,
        updates: {
          CurrentUserProfileField.displayName: displayName,
          CurrentUserProfileField.bio:
              _bioCtrl.text.trim().isEmpty ? null : _bioCtrl.text.trim(),
          CurrentUserProfileField.birthDate: birthDate,
          CurrentUserProfileField.city:
              _cityCtrl.text.trim().isEmpty ? null : _cityCtrl.text.trim(),
          CurrentUserProfileField.photoURL:
              _photoDraft?.trim().isEmpty ?? true ? null : _photoDraft,
          CurrentUserProfileField.languages: _languages.toList(),
          CurrentUserProfileField.interests: _interests.toList(),
          CurrentUserProfileField.homeLocation: null,
        },
      );
      if (!await _profileActions.isCurrent(
        _profileMutationService,
        owner,
      )) {
        return;
      }
      setState(() => _user = result.user);
      _profileActions.replaceContext(ProfileMutationContext(
        user: result.user,
        owner: owner.context.owner,
      ));
      final refreshedOwner = _profileActions.capture();
      if (refreshedOwner == null) return;
      await _showOwnedStatus(
        refreshedOwner,
        title: l10n.t('Gespeichert'),
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
      await _showOwnedStatus(
        owner,
        title: failure.remoteAccepted
            ? 'Serverseitig gespeichert'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Speicherstatus unklar'
                : 'Speichern fehlgeschlagen',
        message: failure.remoteAccepted
            ? 'Die Änderung wurde serverseitig verarbeitet, aber der lokale Profilstand konnte noch nicht aktualisiert werden.'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Die Änderung könnte verarbeitet worden sein. Lade dein Profil neu, bevor du erneut speicherst.'
                : 'Die Profiländerung wurde nicht bestätigt.',
      );
    } catch (e) {
      debugPrint('[ProfileInfo] save failed: $e');
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        await _showOwnedStatus(owner, title: 'Speichern fehlgeschlagen');
      }
    } finally {
      if (mounted && _profileActions.isSynchronouslyCurrent(owner)) {
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _showOwnedStatus(
    ProfileMutationActionOwner owner, {
    required String title,
    String? message,
  }) =>
      _profileActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
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

  User? _buildDraftUser() {
    final u = _user;
    if (u == null) return null;
    final birthYear = int.tryParse(_birthYearCtrl.text.trim());
    final birthDate = (birthYear == null) ? null : DateTime(birthYear, 1, 1);
    final displayName =
        '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim();
    return u.copyWith(
      displayName: displayName,
      bio: _bioCtrl.text.trim().isEmpty ? null : _bioCtrl.text.trim(),
      birthDate: birthDate,
      city: _cityCtrl.text.trim().isEmpty ? null : _cityCtrl.text.trim(),
      photoURL: _photoDraft?.trim().isEmpty ?? true ? null : _photoDraft,
      languages: _languages.toList(),
      interests: _interests.toList(),
      homeLocation: null,
    );
  }

  Future<void> _preview() async {
    final owner = _profileActions.capture();
    if (owner == null) return;
    final valid = _formKey.currentState?.validate() ?? false;
    if (!valid) return;
    final draft = _buildDraftUser();
    if (draft == null) return;
    if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
      return;
    }
    if (!mounted) return;
    await _profileActions.pushOwnedRoute<void>(
      context: context,
      owner: owner,
      route: MaterialPageRoute<void>(
        builder: (_) => _ProfilePreviewScreen(user: draft),
      ),
    );
  }

  static (String first, String last) _splitDisplayName(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return ('', '');
    if (parts.length == 1) return (parts.first, '');
    return (parts.first, parts.sublist(1).join(' '));
  }

  Future<void> _changePhoto() async {
    final owner = _profileActions.capture();
    if (owner == null) return;
    final choice = await _profileActions.showOwnedSheet<_ProfilePhotoChoice>(
      context: context,
      owner: owner,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _SheetAction(
                  icon: Icons.photo_camera_outlined,
                  title: 'Foto aufnehmen',
                  onTap: () =>
                      Navigator.of(context).pop(_ProfilePhotoChoice.camera),
                ),
                const SizedBox(height: 10),
                _SheetAction(
                  icon: Icons.photo_library_outlined,
                  title: 'Foto aus Galerie wählen',
                  onTap: () =>
                      Navigator.of(context).pop(_ProfilePhotoChoice.gallery),
                ),
                const SizedBox(height: 10),
                _SheetAction(
                  icon: Icons.delete_outline,
                  title: 'Foto entfernen',
                  isDestructive: true,
                  onTap: () =>
                      Navigator.of(context).pop(_ProfilePhotoChoice.remove),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (choice == null ||
        !await _profileActions.isCurrent(_profileMutationService, owner)) {
      return;
    }
    switch (choice) {
      case _ProfilePhotoChoice.camera:
        await _pickPhoto(ImageSource.camera, owner);
        break;
      case _ProfilePhotoChoice.gallery:
        await _pickPhoto(ImageSource.gallery, owner);
        break;
      case _ProfilePhotoChoice.remove:
        if (_profileActions.isSynchronouslyCurrent(owner)) {
          setState(() => _photoDraft = null);
        }
        break;
    }
  }

  Future<void> _pickPhoto(
    ImageSource source,
    ProfileMutationActionOwner owner,
  ) async {
    try {
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final picker = ImagePicker();
      final XFile? shot =
          await picker.pickImage(source: source, imageQuality: 85);
      if (shot == null ||
          !await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final bytes = await shot.readAsBytes();
      if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
        return;
      }
      final b64 = base64Encode(bytes);
      final mime = _guessImageMime(shot.name);
      setState(() => _photoDraft = 'data:$mime;base64,$b64');
    } catch (e) {
      debugPrint('[ProfileInfo] pick photo failed: $e');
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        await _showOwnedStatus(
          owner,
          title: 'Foto konnte nicht geladen werden',
        );
      }
    }
  }

  Future<Set<String>?> _showMultiSelect({
    required String title,
    required List<String> options,
    required Set<String> selection,
  }) async {
    final owner = _profileActions.capture();
    if (owner == null) return null;
    final picked = await _profileActions.showOwnedSheet<Set<String>>(
      context: context,
      owner: owner,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => _SimpleMultiSelectBottomSheet(
        title: title,
        options: options,
        initialSelection: selection,
      ),
    );
    if (!await _profileActions.isCurrent(_profileMutationService, owner)) {
      return null;
    }
    return picked;
  }

  static String _guessImageMime(String filename) {
    final name = filename.toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const SizedBox(
            width: double.infinity,
            child: Text('Profilinformationen', textAlign: TextAlign.center)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : (_user == null)
              ? const Center(child: Text('Kein Benutzer geladen'))
              : Form(
                  key: _formKey,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Profilinformationen',
                            style: theme.textTheme.titleLarge),
                        const SizedBox(height: 6),
                        Text(
                          'Diese Informationen werden in deinem öffentlichen Profil angezeigt und helfen anderen Nutzern, Vertrauen aufzubauen.',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: Colors.white70, height: 1.45),
                        ),
                        const SizedBox(height: 18),
                        _GroupTitle(title: 'Profilbild'),
                        _ProfilePhotoCard(
                          photoUrl: _photoDraft,
                          onChange: _changePhoto,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Ein Profilbild erhöht das Vertrauen zwischen Mietern und Vermietern.',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: Colors.white70, height: 1.45),
                        ),
                        const SizedBox(height: 22),
                        _GroupTitle(title: 'Grunddaten'),
                        _FormTile(
                          icon: Icons.person_outline,
                          label: 'Vorname',
                          controller: _firstNameCtrl,
                          requiredField: true,
                          textInputAction: TextInputAction.next,
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? 'Pflichtfeld'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        _FormTile(
                          icon: Icons.badge_outlined,
                          label: 'Nachname',
                          controller: _lastNameCtrl,
                          requiredField: true,
                          textInputAction: TextInputAction.next,
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? 'Pflichtfeld'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        _FormTile(
                          icon: Icons.cake_outlined,
                          label: 'Geburtsjahr',
                          controller: _birthYearCtrl,
                          keyboardType: TextInputType.number,
                          hint: 'z. B. 1996',
                          validator: (v) {
                            final raw = (v ?? '').trim();
                            if (raw.isEmpty) return null;
                            final year = int.tryParse(raw);
                            final now = DateTime.now().year;
                            if (year == null) return 'Ungültiges Jahr';
                            if (year < 1900 || year > now - 14) {
                              return 'Bitte korrektes Jahr eingeben';
                            }
                            return null;
                          },
                          textInputAction: TextInputAction.next,
                        ),
                        const SizedBox(height: 12),
                        _FormTile(
                          icon: Icons.location_city_outlined,
                          label: 'Wohnort (Stadt)',
                          controller: _cityCtrl,
                          hint: 'Nur Stadt, keine genaue Adresse',
                          textInputAction: TextInputAction.next,
                        ),
                        const SizedBox(height: 22),
                        _GroupTitle(title: 'Über mich'),
                        _TextAreaCard(
                          icon: Icons.edit_note_outlined,
                          label: 'Bio / Kurzbeschreibung',
                          controller: _bioCtrl,
                          hint:
                              'Erzähle kurz etwas über dich, z. B. warum du Dinge vermietest oder mietest.',
                          maxChars: 500,
                        ),
                        const SizedBox(height: 22),
                        _GroupTitle(title: 'Sprachen'),
                        _BottomSheetMultiSelectField(
                            icon: Icons.translate,
                            title: 'Sprachen',
                            options: _languageOptions,
                            selection: _languages,
                            emptyHint: 'Wähle eine oder mehrere Sprachen aus',
                            onOpen: () => _showMultiSelect(
                                title: 'Sprachen',
                                options: _languageOptions,
                                selection: _languages)),
                        const SizedBox(height: 22),
                        _GroupTitle(title: 'Interessen'),
                        _BottomSheetMultiSelectField(
                            icon: Icons.interests_outlined,
                            title: 'Interessen',
                            options: _interestOptions,
                            selection: _interests,
                            emptyHint: 'Wähle ein oder mehrere Interessen aus',
                            onOpen: () => _showMultiSelect(
                                title: 'Interessen',
                                options: _interestOptions,
                                selection: _interests)),
                        const SizedBox(height: 22),
                        _GroupTitle(title: 'Mitgliedschaft'),
                        _MembershipCard(
                          joinedAt: _user!.createdAt,
                          bookingsCount: _bookingsCount,
                          rentalsCount: _rentalsCount,
                          avgRating: _user!.avgRating,
                          reviewCount: _user!.reviewCount,
                        ),
                      ],
                    ),
                  ),
                ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton.icon(
                    onPressed: (_loading || _saving) ? null : _preview,
                    icon: const Icon(Icons.visibility_outlined),
                    label: const Text('Vorschau'),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: (_loading || _saving) ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.check_circle_outline),
                    label: Text(_saving ? l10n.t('Speichern…') : 'Speichern'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupTitle extends StatelessWidget {
  final String title;
  const _GroupTitle({required this.title});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(title,
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w800)),
      );
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  const _GlassCard({required this.child});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.20),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      padding: const EdgeInsets.all(14),
      child: child,
    );
  }
}

class _ProfilePhotoCard extends StatelessWidget {
  final String? photoUrl;
  final VoidCallback onChange;

  const _ProfilePhotoCard({required this.photoUrl, required this.onChange});

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        children: [
          Center(
            child: SitUserAvatar(
              url: photoUrl,
              radius: 56,
              borderColor:
                  Theme.of(context).colorScheme.primary.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 46,
            child: OutlinedButton.icon(
              onPressed: onChange,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Foto ändern'),
            ),
          ),
        ],
      ),
    );
  }
}

class _FormTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? hint;
  final TextEditingController controller;
  final bool requiredField;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;

  const _FormTile({
    required this.icon,
    required this.label,
    required this.controller,
    this.hint,
    this.requiredField = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.20),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: ListTile(
        leading: Icon(icon, color: Colors.white.withValues(alpha: 0.85)),
        title: TextFormField(
          controller: controller,
          validator: validator,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white),
          decoration: InputDecoration(
            border: InputBorder.none,
            hintText: hint ?? label,
            hintStyle:
                theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
          ),
        ),
        trailing: requiredField
            ? Text('*',
                style: theme.textTheme.titleMedium
                    ?.copyWith(color: theme.colorScheme.primary))
            : null,
      ),
    );
  }
}

class _TextAreaCard extends StatefulWidget {
  final IconData icon;
  final String label;
  final TextEditingController controller;
  final String hint;
  final int maxChars;

  const _TextAreaCard(
      {required this.icon,
      required this.label,
      required this.controller,
      required this.hint,
      required this.maxChars});

  @override
  State<_TextAreaCard> createState() => _TextAreaCardState();
}

class _TextAreaCardState extends State<_TextAreaCard> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = widget.controller.text.characters.length;
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(widget.icon, color: Colors.white.withValues(alpha: 0.85)),
              const SizedBox(width: 10),
              Expanded(
                  child: Text(widget.label,
                      style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.white, fontWeight: FontWeight.w700))),
              Text('$count/${widget.maxChars}',
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: Colors.white70)),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: TextField(
              controller: widget.controller,
              maxLength: widget.maxChars,
              maxLines: 5,
              style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white),
              decoration: InputDecoration(
                counterText: '',
                hintText: widget.hint,
                hintStyle:
                    theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomSheetMultiSelectField extends StatefulWidget {
  final IconData icon;
  final String title;
  final List<String> options;
  final Set<String> selection;
  final String emptyHint;
  final Future<Set<String>?> Function() onOpen;

  const _BottomSheetMultiSelectField(
      {required this.icon,
      required this.title,
      required this.options,
      required this.selection,
      required this.emptyHint,
      required this.onOpen});

  @override
  State<_BottomSheetMultiSelectField> createState() =>
      _BottomSheetMultiSelectFieldState();
}

class _BottomSheetMultiSelectFieldState
    extends State<_BottomSheetMultiSelectField> {
  String _summary() {
    if (widget.selection.isEmpty) return widget.emptyHint;
    final sorted = widget.selection.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    if (sorted.length <= 3) return sorted.join(', ');
    return '${sorted.take(3).join(', ')} +${sorted.length - 3}';
  }

  Future<void> _open() async {
    final picked = await widget.onOpen();

    if (picked == null || !mounted) return;
    setState(() {
      widget.selection
        ..clear()
        ..addAll(picked);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selectedCount = widget.selection.length;
    return _GlassCard(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: _open,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(widget.icon, color: Colors.white.withValues(alpha: 0.85)),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_summary(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(
                        selectedCount == 0
                            ? 'Tippe zum Auswählen'
                            : '$selectedCount ausgewählt',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: Colors.white70)),
                  ],
                ),
              ),
              if (selectedCount > 0)
                TextButton(
                  onPressed: () => setState(widget.selection.clear),
                  child: Text('Zurücksetzen',
                      style: theme.textTheme.labelSmall
                          ?.copyWith(color: theme.colorScheme.primary)),
                ),
              const SizedBox(width: 4),
              Icon(Icons.expand_more, color: Colors.white70),
            ],
          ),
        ),
      ),
    );
  }
}

class _SimpleMultiSelectBottomSheet extends StatefulWidget {
  final String title;
  final List<String> options;
  final Set<String> initialSelection;

  const _SimpleMultiSelectBottomSheet(
      {required this.title,
      required this.options,
      required this.initialSelection});

  @override
  State<_SimpleMultiSelectBottomSheet> createState() =>
      _SimpleMultiSelectBottomSheetState();
}

class _SimpleMultiSelectBottomSheetState
    extends State<_SimpleMultiSelectBottomSheet> {
  final _searchCtrl = TextEditingController();
  late Set<String> _draft;
  bool _showSelected = true;

  @override
  void initState() {
    super.initState();
    _draft = {...widget.initialSelection};
    _searchCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  static String _groupKey(String s) {
    final trimmed = s.trim();
    if (trimmed.isEmpty) return '#';
    final first = trimmed.characters.first.toUpperCase();
    final isLetter = RegExp(r'^[A-ZÄÖÜ]$').hasMatch(first);
    return isLetter ? first : '#';
  }

  List<_GroupedEntry> _buildEntries() {
    final query = _searchCtrl.text.trim().toLowerCase();
    final filtered = query.isEmpty
        ? widget.options
        : widget.options
            .where((e) => e.toLowerCase().contains(query))
            .toList(growable: false);
    final sorted = [...filtered]
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    final out = <_GroupedEntry>[];
    String? current;
    for (final o in sorted) {
      final g = _groupKey(o);
      if (current != g) {
        current = g;
        out.add(_GroupedEntry.header(g));
      }
      out.add(_GroupedEntry.option(o));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    final entries = _buildEntries();
    final queryActive = _searchCtrl.text.trim().isNotEmpty;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
        child: SizedBox(
          height: media.size.height * 0.86,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
                child: Row(
                  children: [
                    Expanded(
                        child: Text(widget.title,
                            style: theme.textTheme.titleLarge
                                ?.copyWith(fontWeight: FontWeight.w900))),
                    Text('${_draft.length}',
                        style: theme.textTheme.labelSmall
                            ?.copyWith(color: Colors.white70)),
                    const SizedBox(width: 6),
                    Icon(Icons.checklist_outlined,
                        size: 18, color: Colors.white70),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: TextField(
                  controller: _searchCtrl,
                  textInputAction: TextInputAction.search,
                  style:
                      theme.textTheme.bodyMedium?.copyWith(color: Colors.white),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Suchen',
                    suffixIcon: (_searchCtrl.text.trim().isEmpty)
                        ? null
                        : IconButton(
                            tooltip: 'Suche löschen',
                            onPressed: () => _searchCtrl.clear(),
                            icon: const Icon(Icons.close),
                          ),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: 0.06),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: Colors.white.withValues(alpha: 0.10))),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: Colors.white.withValues(alpha: 0.10))),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.60))),
                  ),
                ),
              ),
              if (_draft.isNotEmpty && !queryActive)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Column(
                      children: [
                        InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () =>
                              setState(() => _showSelected = !_showSelected),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                            child: Row(
                              children: [
                                Icon(Icons.check_rounded,
                                    size: 18,
                                    color: theme.colorScheme.primary
                                        .withValues(alpha: 0.9)),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Ausgewählt (${_draft.length})',
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900),
                                  ),
                                ),
                                TextButton(
                                  onPressed: () => setState(_draft.clear),
                                  child: Text('Alles löschen',
                                      style: theme.textTheme.labelSmall
                                          ?.copyWith(
                                              color:
                                                  theme.colorScheme.primary)),
                                ),
                                const SizedBox(width: 4),
                                AnimatedRotation(
                                  duration: const Duration(milliseconds: 180),
                                  turns: _showSelected ? 0.0 : 0.5,
                                  child: const Icon(Icons.expand_more,
                                      color: Colors.white70),
                                ),
                              ],
                            ),
                          ),
                        ),
                        AnimatedSize(
                          duration: const Duration(milliseconds: 200),
                          curve: Curves.easeOutCubic,
                          alignment: Alignment.topCenter,
                          child: _showSelected
                              ? Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(10, 0, 10, 10),
                                  child: _SelectedList(
                                    items: _draft.toList()
                                      ..sort((a, b) => a
                                          .toLowerCase()
                                          .compareTo(b.toLowerCase())),
                                    onRemove: (v) =>
                                        setState(() => _draft.remove(v)),
                                  ),
                                )
                              : const SizedBox.shrink(),
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: (entries.isEmpty)
                    ? Center(
                        child: Text('Keine Treffer',
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: Colors.white70)))
                    : Scrollbar(
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
                          itemCount: entries.length,
                          itemBuilder: (context, i) {
                            final e = entries[i];
                            if (e.isHeader) {
                              return Padding(
                                padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 30,
                                      height: 30,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: theme.colorScheme.primary
                                            .withValues(alpha: 0.18),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                            color: theme.colorScheme.primary
                                                .withValues(alpha: 0.35)),
                                      ),
                                      child: Text(e.value,
                                          style: theme.textTheme.bodySmall
                                              ?.copyWith(
                                                  color: Colors.white,
                                                  fontWeight: FontWeight.w900)),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        queryActive
                                            ? 'Suchergebnisse'
                                            : 'Optionen',
                                        style: theme.textTheme.labelSmall
                                            ?.copyWith(color: Colors.white70),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }

                            final option = e.value;
                            final selected = _draft.contains(option);
                            return Container(
                              margin: const EdgeInsets.only(top: 8),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.18),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color:
                                        Colors.white.withValues(alpha: 0.08)),
                              ),
                              child: ListTile(
                                onTap: () => setState(() {
                                  if (selected) {
                                    _draft.remove(option);
                                  } else {
                                    _draft.add(option);
                                  }
                                }),
                                dense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 2),
                                title: Text(option,
                                    style: theme.textTheme.bodyMedium
                                        ?.copyWith(color: Colors.white)),
                                trailing: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 160),
                                  switchInCurve: Curves.easeOutCubic,
                                  switchOutCurve: Curves.easeOutCubic,
                                  child: selected
                                      ? Icon(Icons.check_rounded,
                                          key: const ValueKey('on'),
                                          color: theme.colorScheme.primary)
                                      : const SizedBox(
                                          key: ValueKey('off'),
                                          width: 22,
                                          height: 22),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                child: Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 52,
                        child: OutlinedButton.icon(
                          onPressed: () =>
                              Navigator.of(context).pop<Set<String>>(null),
                          icon: const Icon(Icons.close),
                          label: const Text('Abbrechen'),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SizedBox(
                        height: 52,
                        child: FilledButton.icon(
                          onPressed: () =>
                              Navigator.of(context).pop<Set<String>>(_draft),
                          icon: const Icon(Icons.check_circle_outline),
                          label: const Text('Übernehmen'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GroupedEntry {
  final bool isHeader;
  final String value;
  const _GroupedEntry._({required this.isHeader, required this.value});
  const _GroupedEntry.header(String letter)
      : this._(isHeader: true, value: letter);
  const _GroupedEntry.option(String option)
      : this._(isHeader: false, value: option);
}

class _SelectedList extends StatelessWidget {
  final List<String> items;
  final ValueChanged<String> onRemove;
  const _SelectedList({required this.items, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shown =
        items.length <= 6 ? items : items.take(6).toList(growable: false);
    final remaining = items.length - shown.length;

    return Column(
      children: [
        ...shown.map(
          (v) => Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
              ),
              child: ListTile(
                dense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
                title: Text(v,
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white, fontWeight: FontWeight.w700)),
                trailing: IconButton(
                  tooltip: 'Entfernen',
                  onPressed: () => onRemove(v),
                  icon: Icon(Icons.close,
                      color: theme.colorScheme.primary.withValues(alpha: 0.95)),
                ),
              ),
            ),
          ),
        ),
        if (remaining > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '+$remaining weitere ausgewählt',
                style:
                    theme.textTheme.labelSmall?.copyWith(color: Colors.white70),
              ),
            ),
          ),
      ],
    );
  }
}

class _ProfilePreviewScreen extends StatelessWidget {
  final User user;
  const _ProfilePreviewScreen({required this.user});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
          centerTitle: true,
          title: const SizedBox(
              width: double.infinity,
              child: Text('Vorschau', textAlign: TextAlign.center))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ProfileHeaderCard(user: user, listingsCount: 0),
            const SizedBox(height: 12),
            _GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('So sehen andere dein Profil',
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 10),
                  if ((user.city ?? '').trim().isNotEmpty)
                    _PreviewLine(
                        icon: Icons.home_outlined,
                        label: 'Wohnort',
                        value: user.city ?? '-'),
                  if ((user.bio ?? '').trim().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _PreviewLine(
                        icon: Icons.info_outline,
                        label: 'Über mich',
                        value: user.bio ?? '-'),
                  ],
                  if (user.languages.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _PreviewLine(
                        icon: Icons.translate,
                        label: 'Sprachen',
                        value: user.languages.join(', ')),
                  ],
                  if (user.interests.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _PreviewLine(
                        icon: Icons.interests_outlined,
                        label: 'Interessen',
                        value: user.interests.join(', ')),
                  ],
                  if ((user.city ?? '').trim().isEmpty &&
                      (user.bio ?? '').trim().isEmpty &&
                      user.languages.isEmpty &&
                      user.interests.isEmpty)
                    Text('Noch keine öffentlichen Angaben ausgefüllt.',
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(color: Colors.white70, height: 1.45)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _PreviewLine(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Colors.white.withValues(alpha: 0.85)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: Colors.white70)),
              const SizedBox(height: 2),
              Text(value,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: Colors.white, height: 1.45)),
            ],
          ),
        ),
      ],
    );
  }
}

class _MembershipCard extends StatelessWidget {
  final DateTime joinedAt;
  final int bookingsCount;
  final int rentalsCount;
  final double avgRating;
  final int reviewCount;

  const _MembershipCard(
      {required this.joinedAt,
      required this.bookingsCount,
      required this.rentalsCount,
      required this.avgRating,
      required this.reviewCount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _GlassCard(
      child: Column(
        children: [
          _InfoLine(
              icon: Icons.calendar_month_outlined,
              label: 'Dabei seit',
              value: _formatJoined(joinedAt)),
          const SizedBox(height: 10),
          _InfoLine(
              icon: Icons.shopping_bag_outlined,
              label: 'Anzahl Buchungen',
              value: bookingsCount.toString()),
          const SizedBox(height: 10),
          _InfoLine(
              icon: Icons.storefront_outlined,
              label: 'Anzahl Vermietungen',
              value: rentalsCount.toString()),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(Icons.star_outline,
                  color: Colors.white.withValues(alpha: 0.85)),
              const SizedBox(width: 10),
              Expanded(
                  child: Text('Durchschnittliche Bewertung',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.white70))),
              Text('${avgRating.toStringAsFixed(1)} ★',
                  style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w800)),
              const SizedBox(width: 8),
              Text('($reviewCount)',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: Colors.white70)),
            ],
          ),
        ],
      ),
    );
  }

  static String _formatJoined(DateTime dt) {
    const monthsDe = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember'
    ];
    return '${monthsDe[dt.month - 1]} ${dt.year}';
  }
}

class _InfoLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoLine(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, color: Colors.white.withValues(alpha: 0.85)),
        const SizedBox(width: 10),
        Expanded(
            child: Text(label,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: Colors.white70))),
        Text(value,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
      ],
    );
  }
}

class _SheetAction extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final bool isDestructive;
  const _SheetAction(
      {required this.icon,
      required this.title,
      required this.onTap,
      this.isDestructive = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fg = isDestructive ? theme.colorScheme.error : Colors.white;
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, color: fg),
        label: Text(title,
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: fg, fontWeight: FontWeight.w700)),
      ),
    );
  }
}
