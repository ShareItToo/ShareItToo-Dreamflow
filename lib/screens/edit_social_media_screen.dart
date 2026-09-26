import 'dart:async';
import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/profile_mutation_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/profile_mutation_interaction.dart';

class EditSocialMediaScreen extends StatefulWidget {
  final ProfileMutationService profileMutationService;

  const EditSocialMediaScreen({
    super.key,
    this.profileMutationService = const ProfileMutationService(),
  });
  @override
  State<EditSocialMediaScreen> createState() => _EditSocialMediaScreenState();
}

class _EditSocialMediaScreenState extends State<EditSocialMediaScreen> {
  bool _loading = true;
  String _error = '';

  final _xCtrl = TextEditingController();
  final _igCtrl = TextEditingController();
  final _fbCtrl = TextEditingController();
  final _ttCtrl = TextEditingController();
  final _scCtrl = TextEditingController();
  final _profileActions = ProfileMutationInteractionController();
  StreamSubscription<String>? _persistenceSubscription;
  int _loadRevision = 0;

  ProfileMutationService get _profileMutationService =>
      widget.profileMutationService;

  static const double _platformIconSize = 26;

  Widget _platformPrefixIcon(String assetPath,
      {required String semanticLabel}) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Semantics(
        label: semanticLabel,
        image: true,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.asset(assetPath,
              width: _platformIconSize,
              height: _platformIconSize,
              fit: BoxFit.cover),
        ),
      ),
    );
  }

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
          _clearControllers();
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
    _xCtrl.dispose();
    _igCtrl.dispose();
    _fbCtrl.dispose();
    _ttCtrl.dispose();
    _scCtrl.dispose();
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
      _xCtrl.text = u?.socialX ?? '';
      _igCtrl.text = u?.socialInstagram ?? '';
      _fbCtrl.text = u?.socialFacebook ?? '';
      _ttCtrl.text = u?.socialTiktok ?? '';
      _scCtrl.text = u?.socialSnapchat ?? '';
    });
  }

  void _clearControllers() {
    _xCtrl.clear();
    _igCtrl.clear();
    _fbCtrl.clear();
    _ttCtrl.clear();
    _scCtrl.clear();
  }

  String _norm(String platform, String input) {
    String v = input.trim();
    if (v.isEmpty) return '';
    v = v.replaceAll('\n', ' ').split(' ').first.trim();
    if (v.startsWith('@')) v = v.substring(1);
    bool looksUrl = v.startsWith('http://') || v.startsWith('https://');
    switch (platform) {
      case 'x':
        if (v.contains('twitter.com')) v = v.replaceAll('twitter.com', 'x.com');
        if (looksUrl) return v;
        return 'https://x.com/$v';
      case 'instagram':
        if (looksUrl) return v;
        return 'https://instagram.com/$v';
      case 'facebook':
        if (looksUrl) return v;
        return 'https://facebook.com/$v';
      case 'tiktok':
        if (looksUrl) return v;
        final h = v.startsWith('@') ? v.substring(1) : v;
        return 'https://www.tiktok.com/@$h';
      case 'snapchat':
        if (looksUrl) return v;
        return 'https://www.snapchat.com/add/$v';
      default:
        return v;
    }
  }

  Future<void> _save() async {
    final owner = _profileActions.capture();
    final screenRoute = ModalRoute.of(context);
    if (owner == null) return;
    final x = _norm('x', _xCtrl.text);
    final ig = _norm('instagram', _igCtrl.text);
    final fb = _norm('facebook', _fbCtrl.text);
    final tt = _norm('tiktok', _ttCtrl.text);
    final sc = _norm('snapchat', _scCtrl.text);
    try {
      final result = await _profileMutationService.updateProfile(
        context: owner.context,
        updates: {
          CurrentUserProfileField.socialX: x.isEmpty ? null : x,
          CurrentUserProfileField.socialInstagram: ig.isEmpty ? null : ig,
          CurrentUserProfileField.socialFacebook: fb.isEmpty ? null : fb,
          CurrentUserProfileField.socialTiktok: tt.isEmpty ? null : tt,
          CurrentUserProfileField.socialSnapchat: sc.isEmpty ? null : sc,
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
          title: const Text('Social-Media-Profile gespeichert'),
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
            ? 'Die Profile wurden serverseitig gespeichert; der lokale Stand konnte noch nicht aktualisiert werden.'
            : failure.kind == ProfileMutationFailureKind.outcomeUnknown
                ? 'Der Speicherstatus ist unklar. Lade dein Profil neu, bevor du erneut speicherst.'
                : failure.kind == ProfileMutationFailureKind.rejected
                    ? 'Die Profile wurden vom Server abgelehnt.'
                    : 'Die Profile konnten lokal nicht gespeichert werden.';
      });
    } catch (e) {
      debugPrint('[EditSocialMedia] save failed: $e');
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
          title: const Text('Social Media hinzufügen'),
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
                        controller: _xCtrl,
                        style: const TextStyle(color: Colors.white),
                        cursorColor: Colors.white,
                        decoration: InputDecoration(
                          prefixIcon: _platformPrefixIcon(
                            'assets/images/X_Twitter_app_icon_round_null_1770568181426.jpg',
                            semanticLabel: 'X',
                          ),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 0, minHeight: 0),
                          labelText: 'X (Twitter)',
                          hintText:
                              'z. B. @deinname oder https://x.com/deinname',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _igCtrl,
                        style: const TextStyle(color: Colors.white),
                        cursorColor: Colors.white,
                        decoration: InputDecoration(
                          prefixIcon: _platformPrefixIcon(
                            'assets/images/Instagram_app_icon_round_null_1770568182606.jpg',
                            semanticLabel: 'Instagram',
                          ),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 0, minHeight: 0),
                          labelText: 'Instagram',
                          hintText:
                              'z. B. @deinname oder instagram.com/deinname',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _fbCtrl,
                        style: const TextStyle(color: Colors.white),
                        cursorColor: Colors.white,
                        decoration: InputDecoration(
                          prefixIcon: _platformPrefixIcon(
                            'assets/images/Facebook_app_icon_round_null_1770568183449.jpg',
                            semanticLabel: 'Facebook',
                          ),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 0, minHeight: 0),
                          labelText: 'Facebook',
                          hintText: 'Profil/Seite URL oder Handle',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _ttCtrl,
                        style: const TextStyle(color: Colors.white),
                        cursorColor: Colors.white,
                        decoration: InputDecoration(
                          prefixIcon: _platformPrefixIcon(
                            'assets/images/TikTok_app_icon_round_null_1770568184844.jpg',
                            semanticLabel: 'TikTok',
                          ),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 0, minHeight: 0),
                          labelText: 'TikTok',
                          hintText: 'z. B. @deinname oder tiktok.com/@deinname',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _scCtrl,
                        style: const TextStyle(color: Colors.white),
                        cursorColor: Colors.white,
                        decoration: InputDecoration(
                          prefixIcon: _platformPrefixIcon(
                            'assets/images/Snapchat_app_icon_2025_null_1770570919160.png',
                            semanticLabel: 'Snapchat',
                          ),
                          prefixIconConstraints:
                              const BoxConstraints(minWidth: 0, minHeight: 0),
                          labelText: 'Snapchat',
                          hintText:
                              'z. B. deinusername oder snapchat.com/add/deinusername',
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                          'Diese Links können auf deinem öffentlichen Profil erscheinen.',
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
