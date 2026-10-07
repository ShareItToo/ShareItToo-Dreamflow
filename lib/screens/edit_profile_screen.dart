import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:provider/provider.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';

class EditProfileScreen extends StatefulWidget {
  final ProfileMutationService profileMutationService;

  const EditProfileScreen({
    super.key,
    this.profileMutationService = const ProfileMutationService(),
  });
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  User? _user;
  final _workCtrl = TextEditingController();
  final _hobbiesCtrl = TextEditingController();
  final _homeLocCtrl = TextEditingController();
  final _favSongCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();

  bool _showWork = false;
  bool _showHobbies = false;
  bool _showHomeLocation = false;
  bool _showBioPublic = true;
  bool _showFavoriteSong = false;
  bool _saving = false;
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
    final profileContext = await _profileMutationService.loadCurrentContext();
    if (!mounted || revision != _loadRevision) return;
    _profileActions.replaceContext(profileContext);
    final u = profileContext?.user;
    setState(() {
      _user = u;
      _workCtrl.text = u?.workTitle ?? '';
      _hobbiesCtrl.text = u?.hobbies ?? '';
      _homeLocCtrl.text = u?.homeLocation ??
          (u?.city != null ? '${u!.city}, ${u.country ?? ''}' : '');
      _favSongCtrl.text = u?.favoriteSong ?? '';
      _bioCtrl.text = u?.bio ?? '';
      _showWork = u?.showWork ?? false;
      _showHobbies = u?.showHobbies ?? false;
      _showHomeLocation = u?.showHomeLocation ?? false;
      _showBioPublic = u?.showBioPublic ?? true;
      _showFavoriteSong = u?.showFavoriteSong ?? false;
    });
  }

  void _clearDraft() {
    _workCtrl.clear();
    _hobbiesCtrl.clear();
    _homeLocCtrl.clear();
    _favSongCtrl.clear();
    _bioCtrl.clear();
  }

  @override
  void dispose() {
    _persistenceSubscription?.cancel();
    _profileActions.dispose();
    _workCtrl.dispose();
    _hobbiesCtrl.dispose();
    _homeLocCtrl.dispose();
    _favSongCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final current = _user;
    final owner = _profileActions.capture();
    final screenRoute = ModalRoute.of(context);
    final savedTitle = context.read<LocalizationController>().t('Gespeichert');
    if (current == null || owner == null || _saving) return;
    setState(() => _saving = true);
    try {
      final result = await _profileMutationService.updateProfile(
        context: owner.context,
        updates: {
          CurrentUserProfileField.workTitle:
              _workCtrl.text.trim().isEmpty ? null : _workCtrl.text.trim(),
          CurrentUserProfileField.hobbies: _hobbiesCtrl.text.trim().isEmpty
              ? null
              : _hobbiesCtrl.text.trim(),
          CurrentUserProfileField.homeLocation: _homeLocCtrl.text.trim().isEmpty
              ? null
              : _homeLocCtrl.text.trim(),
          CurrentUserProfileField.favoriteSong: _favSongCtrl.text.trim().isEmpty
              ? null
              : _favSongCtrl.text.trim(),
          CurrentUserProfileField.bio:
              _bioCtrl.text.trim().isEmpty ? null : _bioCtrl.text.trim(),
          CurrentUserProfileField.showWork: _showWork,
          CurrentUserProfileField.showHobbies: _showHobbies,
          CurrentUserProfileField.showHomeLocation: _showHomeLocation,
          CurrentUserProfileField.showBioPublic: _showBioPublic,
          CurrentUserProfileField.showFavoriteSong: _showFavoriteSong,
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
      if (refreshedOwner == null || !mounted) return;
      await _profileActions.showOwnedDialog<void>(
        context: context,
        owner: refreshedOwner,
        builder: (dialogContext) => AlertDialog(
          title: Text(savedTitle),
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
      if (!mounted) return;
      await _profileActions.showOwnedDialog<void>(
        context: context,
        owner: owner,
        builder: (dialogContext) => AlertDialog(
          title: Text(failure.remoteAccepted
              ? 'Serverseitig gespeichert'
              : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                  ? 'Speicherstatus unklar'
                  : 'Speichern fehlgeschlagen'),
          content: Text(failure.remoteAccepted
              ? 'Die Änderung wurde serverseitig verarbeitet, aber der lokale Profilstand konnte noch nicht aktualisiert werden.'
              : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                  ? 'Die Änderung könnte verarbeitet worden sein. Lade dein Profil neu, bevor du erneut speicherst.'
                  : 'Die Profiländerung wurde nicht bestätigt.'),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (error) {
      debugPrint('[EditProfile] save failed: $error');
      if (await _profileActions.isCurrent(_profileMutationService, owner)) {
        if (!mounted) return;
        await _profileActions.showOwnedDialog<void>(
          context: context,
          owner: owner,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Speichern fehlgeschlagen'),
            actions: [
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } finally {
      if (mounted && _profileActions.isSynchronouslyCurrent(owner)) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    return Scaffold(
      appBar: AppBar(title: Text(l10n.t('Profil bearbeiten'))),
      body: _user == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Section(title: l10n.t('Öffentliche Angaben')),
                    _TextFieldTile(
                        label: l10n.t('Beruf / Rolle'),
                        controller: _workCtrl,
                        icon: Icons.work_outline),
                    _SwitchTile(
                        title: l10n.t('Im öffentlichen Profil anzeigen'),
                        value: _showWork,
                        onChanged: (v) => setState(() => _showWork = v)),
                    const SizedBox(height: 12),
                    _TextFieldTile(
                        label: l10n.t('Hobbys (kommagetrennt)'),
                        controller: _hobbiesCtrl,
                        icon: Icons.interests),
                    _SwitchTile(
                        title: l10n.t('Im öffentlichen Profil anzeigen'),
                        value: _showHobbies,
                        onChanged: (v) => setState(() => _showHobbies = v)),
                    const SizedBox(height: 12),
                    _TextFieldTile(
                        label: l10n.t('Wohnort (optional, überschreibt Stadt)'),
                        controller: _homeLocCtrl,
                        icon: Icons.home_outlined),
                    _SwitchTile(
                        title: l10n.t('Im öffentlichen Profil anzeigen'),
                        value: _showHomeLocation,
                        onChanged: (v) =>
                            setState(() => _showHomeLocation = v)),
                    const SizedBox(height: 12),
                    _TextFieldTile(
                        label: l10n.t('Lieblingssong'),
                        controller: _favSongCtrl,
                        icon: Icons.music_note_outlined),
                    _SwitchTile(
                        title: l10n.t('Im öffentlichen Profil anzeigen'),
                        value: _showFavoriteSong,
                        onChanged: (v) =>
                            setState(() => _showFavoriteSong = v)),
                    const Divider(height: 32),
                    _Section(title: l10n.t('Über mich')),
                    _TextAreaTile(
                        label: l10n.t('Über mich'),
                        controller: _bioCtrl,
                        icon: Icons.person_outline),
                    _SwitchTile(
                        title: l10n.t('Über mich öffentlich anzeigen'),
                        value: _showBioPublic,
                        onChanged: (v) => setState(() => _showBioPublic = v)),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox.square(
                                dimension: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(l10n.t('Speichern')),
                      ),
                    ),
                  ]),
            ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  const _Section({required this.title});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium));
}

class _TextFieldTile extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final IconData icon;
  const _TextFieldTile(
      {required this.label, required this.controller, required this.icon});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08))),
      child: ListTile(
        leading: Icon(icon, color: Colors.white70),
        title: TextField(
            controller: controller,
            decoration:
                InputDecoration(hintText: label, border: InputBorder.none),
            style: const TextStyle(color: Colors.white)),
      ),
    );
  }
}

class _TextAreaTile extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final IconData icon;
  const _TextAreaTile(
      {required this.label, required this.controller, required this.icon});
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: Colors.white70),
            const SizedBox(width: 8),
            Text(label,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.white70))
          ]),
          TextField(
              controller: controller,
              maxLines: 4,
              decoration: const InputDecoration(border: InputBorder.none),
              style: const TextStyle(color: Colors.white))
        ]),
      ),
    );
  }
}

class _SwitchTile extends StatelessWidget {
  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SwitchTile(
      {required this.title, required this.value, required this.onChanged});
  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      activeThumbColor: Theme.of(context).colorScheme.primary,
      title: Text(title),
      value: value,
      onChanged: onChanged,
    );
  }
}
