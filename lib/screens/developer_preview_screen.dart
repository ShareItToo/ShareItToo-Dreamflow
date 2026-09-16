import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lendify/services/developer_preview_service.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:lendify/screens/onboarding_flow_screen.dart';
import 'package:lendify/screens/login_screen.dart';
import 'package:lendify/screens/register_screen.dart';
import 'package:lendify/screens/profile_screen.dart';
import 'package:lendify/navigation/main_nav_controller.dart';

class DeveloperPreviewScreen extends StatelessWidget {
  const DeveloperPreviewScreen({super.key});

  void _backToExplore(BuildContext context) {
    try {
      context.read<MainNavController>().setIndex(0);
    } catch (_) {}
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _confirmAndResetStorage(BuildContext context) async {
    await AppPopup.show(
      context,
      icon: Icons.delete_outline,
      title: 'Lokalen Speicher zurücksetzen?',
      message:
          'Dadurch wird der komplette lokale App‑State (SharedPreferences) gelöscht. Anschließend startet die App wie bei einer frischen Installation (First Launch + Onboarding).',
      actions: [
        Row(children: [
          Expanded(
            child: FilledButton(
              style:
                  FilledButton.styleFrom(backgroundColor: BrandColors.danger),
              onPressed: () async {
                Navigator.of(context, rootNavigator: true).maybePop();
                await context
                    .read<DeveloperPreviewController>()
                    .resetLocalStorageToFirstLaunch();
                if (context.mounted) {
                  AppPopup.toast(context,
                      icon: Icons.check_circle_outline,
                      title: 'Reset erledigt',
                      message: 'App startet jetzt im First‑Launch‑Flow.');
                }
              },
              child: const Text('Reset'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.tonal(
              onPressed: () =>
                  Navigator.of(context, rootNavigator: true).maybePop(),
              child: const Text('Abbrechen'),
            ),
          ),
        ]),
      ],
      useExploreBackground: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (!kDeveloperPreviewEnabled) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          title: Text(
            'Developer Preview deaktiviert',
            style: theme.textTheme.titleLarge
                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
          ),
        ),
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Developer Preview ist in diesem Launch-Build deaktiviert.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge
                    ?.copyWith(color: Colors.white70, height: 1.4),
              ),
            ),
          ),
        ),
      );
    }
    final ctrl = context.watch<DeveloperPreviewController>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text('Developer Preview',
            style: theme.textTheme.titleLarge
                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: FilledButton.tonalIcon(
              onPressed: () => _backToExplore(context),
              icon: const Icon(Icons.explore_outlined, size: 18),
              label: const Text('Entdecken'),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          _SectionCard(
            title: 'User State',
            child: RadioGroup<DeveloperUserState>(
              groupValue: ctrl.state,
              onChanged: (v) async {
                if (v == null) return;
                await context.read<DeveloperPreviewController>().setState(v);
                if (context.mounted) {
                  AppPopup.toast(context,
                      icon: Icons.check_circle_outline,
                      title: 'State gesetzt: ${_labelForState(v)}',
                      duration: const Duration(seconds: 1));
                }
              },
              child: Column(children: [
                for (final s in DeveloperUserState.values)
                  RadioListTile<DeveloperUserState>(
                    value: s,
                    activeColor: BrandColors.primary,
                    contentPadding: EdgeInsets.zero,
                    title: Text(_labelForState(s),
                        style: theme.textTheme.bodyLarge?.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w700)),
                    subtitle: Text(_subtitleForState(s),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: Colors.white70, height: 1.3)),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Quick Previews',
            child: Column(children: [
              _QuickButton(
                icon: Icons.slideshow,
                label: 'Preview Onboarding',
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const OnboardingFlowScreen())),
              ),
              const SizedBox(height: 10),
              _QuickButton(
                icon: Icons.login,
                label: 'Preview Login',
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LoginScreen())),
              ),
              const SizedBox(height: 10),
              _QuickButton(
                icon: Icons.person_add_alt_1,
                label: 'Preview Registrierung',
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RegisterScreen())),
              ),
              const SizedBox(height: 10),
              _QuickButton(
                icon: Icons.person_outline,
                label: 'Preview Profil (Logged Out)',
                onTap: () async {
                  await context
                      .read<DeveloperPreviewController>()
                      .setState(DeveloperUserState.loggedOut);
                  if (context.mounted) {
                    Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => const ProfileScreen()));
                  }
                },
              ),
              const SizedBox(height: 10),
              _QuickButton(
                icon: Icons.verified_user,
                label: 'Preview Profil (Logged In)',
                onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ProfileScreen())),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Storage / Reset',
            child: Column(children: [
              Text(
                'Wenn du in der Web‑Preview „QuotaExceededError“ siehst, ist der lokale Speicher voll. Mit Reset wird alles geleert, damit Onboarding & States wieder sauber testbar sind.',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: Colors.white70, height: 1.35),
              ),
              const SizedBox(height: 10),
              _QuickButton(
                icon: Icons.delete_sweep,
                label: 'Local Storage reset (First Launch)',
                onTap: () => _confirmAndResetStorage(context),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Hinweis',
            child: Text(
              'Dieser Modus ist nur für UI/Flow‑Tests gedacht. User‑State wird lokal gespeichert (SharedPreferences) und überschreibt temporär das Verhalten von “Current User”.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: Colors.white70, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

String _labelForState(DeveloperUserState s) {
  switch (s) {
    case DeveloperUserState.firstLaunch:
      return 'First Launch';
    case DeveloperUserState.loggedOut:
      return 'Logged Out';
    case DeveloperUserState.loggedIn:
      return 'Logged In';
    case DeveloperUserState.verifiedUser:
      return 'Verified User';
  }
}

String _subtitleForState(DeveloperUserState s) {
  switch (s) {
    case DeveloperUserState.firstLaunch:
      return 'Splash + Onboarding 1–3 wie bei einer frischen Installation.';
    case DeveloperUserState.loggedOut:
      return 'Gastmodus: Anzeigen/Profile ansehen, aber keine Aktionen.';
    case DeveloperUserState.loggedIn:
      return 'Normaler Flow: Entdecken, Mietkorb, Buchungen, Nachrichten, Mein SIT.';
    case DeveloperUserState.verifiedUser:
      return 'Wie Logged In, aber Profil zeigt ✓ Verifiziert und alles ist freigeschaltet.';
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: theme.textTheme.titleMedium
                ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        child,
      ]),
    );
  }
}

class _QuickButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickButton(
      {required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          gradient: appBackgroundGradient,
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(
              child: Text(label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                      color: Colors.white, fontWeight: FontWeight.w800))),
          const Icon(Icons.chevron_right, color: Colors.white70),
        ]),
      ),
    );
  }
}
