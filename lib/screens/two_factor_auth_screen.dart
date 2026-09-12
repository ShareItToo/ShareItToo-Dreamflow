import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

/// Truthful placeholder for the future server-authoritative 2FA flow.
///
/// No local switch or preference can protect an account login. The screen is
/// retained only so an old navigation reference fails closed with an explicit
/// non-action instead of reactivating the former preview.
class TwoFactorAuthScreen extends StatelessWidget {
  const TwoFactorAuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
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
          title: const Text('Zwei‑Faktor‑Authentifizierung'),
          centerTitle: true,
          leading: IconButton(
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ),
        body: SafeArea(
          top: false,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              16,
              kToolbarHeight + 18,
              16,
              22,
            ),
            children: [
              Text(
                'Zwei-Faktor-Schutz ist noch nicht verfügbar.',
                style: theme.textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 10),
              Text(
                'Eine lokale Einstellung kann keine Anmeldung schützen. '
                'ShareItToo zeigt die Funktion erst wieder an, wenn die '
                'serverseitige Einrichtung und Bestätigung vollständig '
                'implementiert und freigegeben ist.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.white70,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.10),
                  ),
                ),
                child: const Text(
                  'Keine Aktivierung, kein Bestätigungscode und keine '
                  'Authenticator-Verknüpfung werden auf diesem Gerät '
                  'simuliert.',
                  style: TextStyle(color: Colors.white70, height: 1.45),
                ),
              ),
            ],
          ),
        ),
      ),
    ]);
  }
}
