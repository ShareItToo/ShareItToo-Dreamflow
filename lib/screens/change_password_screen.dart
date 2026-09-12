import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/widgets/app_popup.dart';
import 'package:provider/provider.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _nextCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _showCurrent = false;
  bool _showNext = false;
  bool _showConfirm = false;
  bool _saving = false;

  List<String> _missingRequirements(LocalizationController l10n) {
    final missing = <String>[];

    if (_currentCtrl.text.trim().isEmpty) missing.add(l10n.t('Aktuelles Passwort'));

    final next = _nextCtrl.text;
    if (next.trim().isEmpty) {
      missing.add(l10n.t('Neues Passwort'));
    } else {
      // Keep the hint compact: for saving we only show which field is missing/invalid.
      if (!_meetsAllRules(next)) missing.add(l10n.t('Neues Passwort'));
    }

    final confirm = _confirmCtrl.text;
    if (confirm.trim().isEmpty) {
      missing.add(l10n.t('Bestätigung neues Passwort'));
    } else if (confirm != next) {
      missing.add(l10n.t('Bestätigung neues Passwort'));
    }

    return missing;
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _nextCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  bool get _valid => _currentCtrl.text.isNotEmpty && _nextCtrl.text.isNotEmpty && _nextCtrl.text == _confirmCtrl.text && _meetsAllRules(_nextCtrl.text);

  static bool _hasMinLength(String s) => s.trim().length >= 8;
  static bool _hasNumber(String s) => RegExp(r'\d').hasMatch(s);
  static bool _hasSpecial(String s) => RegExp(r'''[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+;'`~]''').hasMatch(s);
  static bool _meetsAllRules(String s) => _hasMinLength(s) && _hasNumber(s) && _hasSpecial(s);

  double _strength(String s) {
    if (s.isEmpty) return 0;
    var score = 0;
    if (_hasMinLength(s)) score++;
    if (_hasNumber(s)) score++;
    if (_hasSpecial(s)) score++;
    if (RegExp(r'[A-Z]').hasMatch(s)) score++;
    return (score / 4).clamp(0, 1);
  }

  Future<void> _onSave(LocalizationController l10n) async {
    if (_saving) return;
    final validForm = _formKey.currentState?.validate() ?? false;
    if (!validForm) return;

    setState(() => _saving = true);
    try {
      // Local-only placeholder implementation (no backend connected).
      // In a real auth setup this would call the auth provider.
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (!mounted) return;
      await AppPopup.success(
        context,
        title: l10n.t('Passwort gespeichert'),
      );
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } catch (e) {
      debugPrint('Change password failed: $e');
      if (!mounted) return;
      AppPopup.error(
        context,
        title: l10n.t('Passwort nicht gespeichert'),
        message: l10n.t('Etwas ist schiefgelaufen.'),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.watch<LocalizationController>();
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final saveEnabled = !_saving && _valid;
    final missing = _missingRequirements(l10n);
    final strength = _strength(_nextCtrl.text);
    final progressColor = strength >= 0.75
        ? cs.tertiary
        : strength >= 0.45
            ? cs.primary
            : cs.error;

    return Stack(children: [
      Positioned.fill(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(color: cs.surface.withValues(alpha: 0.65)),
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
          title: Text(l10n.t('account.item.changePassword')),
          centerTitle: true,
          leading: IconButton(tooltip: MaterialLocalizations.of(context).backButtonTooltip, icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _SecurityHeroCard(title: l10n.t('Passwort ändern'), subtitle: l10n.t('Wähle ein starkes Passwort, um deinen Account zu schützen.')),
              const SizedBox(height: 14),
              Container(
                decoration: BoxDecoration(
                  color: cs.surface.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                ),
                padding: const EdgeInsets.all(16),
                child: Form(
                  key: _formKey,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    _PasswordField(
                      controller: _currentCtrl,
                      labelText: l10n.t('Aktuelles Passwort'),
                      icon: Icons.lock_outline,
                      visible: _showCurrent,
                      onToggleVisible: () => setState(() => _showCurrent = !_showCurrent),
                      validator: (v) => (v == null || v.trim().isEmpty) ? l10n.t('Bitte gib dein aktuelles Passwort ein.') : null,
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 12),
                    _PasswordField(
                      controller: _nextCtrl,
                      labelText: l10n.t('Neues Passwort'),
                      icon: Icons.password_outlined,
                      visible: _showNext,
                      onToggleVisible: () => setState(() => _showNext = !_showNext),
                      validator: (v) {
                        final s = (v ?? '');
                        if (s.trim().isEmpty) return l10n.t('Bitte gib ein neues Passwort ein.');
                        if (!_meetsAllRules(s)) return l10n.t('Passwort erfüllt die Anforderungen noch nicht.');
                        return null;
                      },
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.next,
                    ),
                    const SizedBox(height: 12),
                    _PasswordField(
                      controller: _confirmCtrl,
                      labelText: l10n.t('Neues Passwort bestätigen'),
                      icon: Icons.check_circle_outline,
                      visible: _showConfirm,
                      onToggleVisible: () => setState(() => _showConfirm = !_showConfirm),
                      validator: (v) {
                        final s = (v ?? '');
                        if (s.trim().isEmpty) return l10n.t('Bitte bestätige dein neues Passwort.');
                        if (s != _nextCtrl.text) return l10n.t('Passwörter stimmen nicht überein.');
                        return null;
                      },
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _onSave(l10n),
                    ),
                    const SizedBox(height: 16),
                    _StrengthBar(value: strength, color: progressColor),
                    const SizedBox(height: 10),
                    _RulesList(
                      rules: [
                        _RuleState(label: l10n.t('Mindestens 8 Zeichen'), ok: _hasMinLength(_nextCtrl.text)),
                        _RuleState(label: l10n.t('Mindestens eine Zahl'), ok: _hasNumber(_nextCtrl.text)),
                        _RuleState(label: l10n.t('Mindestens ein Sonderzeichen'), ok: _hasSpecial(_nextCtrl.text)),
                      ],
                    ),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: saveEnabled ? () => _onSave(l10n) : null,
                      icon: _saving
                          ? SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2.2, color: cs.onPrimary),
                            )
                          : Icon(Icons.check_rounded, color: saveEnabled ? cs.onPrimary : cs.onSurface.withValues(alpha: 0.45)),
                      label: Text(
                        _saving ? l10n.t('Speichern...') : l10n.t('Speichern'),
                        style: TextStyle(color: saveEnabled ? cs.onPrimary : cs.onSurface.withValues(alpha: 0.55)),
                      ),
                      style: ButtonStyle(
                        padding: const WidgetStatePropertyAll<EdgeInsets>(EdgeInsets.symmetric(vertical: 14)),
                        shape: WidgetStatePropertyAll<RoundedRectangleBorder>(RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                        backgroundColor: WidgetStateProperty.resolveWith<Color>((states) {
                          if (states.contains(WidgetState.disabled)) return cs.onSurface.withValues(alpha: 0.10);
                          return cs.primary;
                        }),
                        foregroundColor: WidgetStateProperty.resolveWith<Color>((states) {
                          if (states.contains(WidgetState.disabled)) return cs.onSurface.withValues(alpha: 0.55);
                          return cs.onPrimary;
                        }),
                        iconColor: WidgetStateProperty.resolveWith<Color>((states) {
                          if (states.contains(WidgetState.disabled)) return cs.onSurface.withValues(alpha: 0.45);
                          return cs.onPrimary;
                        }),
                        overlayColor: const WidgetStatePropertyAll<Color>(Colors.transparent),
                      ),
                    ),
                    _MissingRequirementsHint(
                      visible: !_saving && !saveEnabled,
                      items: missing,
                      title: l10n.t('Fehlt noch, um zu speichern:'),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class _MissingRequirementsHint extends StatelessWidget {
  final bool visible;
  final List<String> items;
  final String title;
  const _MissingRequirementsHint({required this.visible, required this.items, required this.title});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final show = visible && items.isNotEmpty;

    return AnimatedSize(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      alignment: Alignment.topCenter,
      child: Padding(
        padding: const EdgeInsets.only(top: 12),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          switchInCurve: Curves.easeOut,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, anim) => FadeTransition(opacity: anim, child: child),
          child: !show
              ? const SizedBox.shrink()
              : Container(
                  key: ValueKey<int>(items.length),
                  decoration: BoxDecoration(
                    color: cs.error.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: cs.error.withValues(alpha: 0.30)),
                  ),
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Icon(Icons.info_outline_rounded, size: 18, color: cs.error.withValues(alpha: 0.95)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          title,
                          style: theme.textTheme.labelLarge?.copyWith(color: Colors.white.withValues(alpha: 0.92)),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    ...items.map(
                      (t) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Icon(Icons.circle, size: 7, color: Colors.white.withValues(alpha: 0.72)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              t,
                              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: 0.78), height: 1.35),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ]),
                ),
        ),
      ),
    );
  }
}

class _SecurityHeroCard extends StatelessWidget {
  final String title;
  final String subtitle;
  const _SecurityHeroCard({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surface.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: cs.primary.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(Icons.shield_outlined, color: cs.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: theme.textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(subtitle, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.78), height: 1.45)),
          ]),
        ),
      ]),
    );
  }
}

class _PasswordField extends StatelessWidget {
  final TextEditingController controller;
  final String labelText;
  final IconData icon;
  final bool visible;
  final VoidCallback onToggleVisible;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  const _PasswordField({
    required this.controller,
    required this.labelText,
    required this.icon,
    required this.visible,
    required this.onToggleVisible,
    this.validator,
    this.onChanged,
    this.textInputAction,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return TextFormField(
      controller: controller,
      obscureText: !visible,
      // Force white for the actual input (including the obscuring dots),
      // because some Theme/ColorScheme configurations can still resolve
      // to dark onSurface values.
      obscuringCharacter: '•',
      keyboardType: TextInputType.visiblePassword,
      autocorrect: false,
      enableSuggestions: false,
      style: const TextStyle(color: Colors.white),
      cursorColor: Colors.white,
      validator: validator,
      onChanged: onChanged,
      textInputAction: textInputAction,
      onFieldSubmitted: onSubmitted,
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: Colors.white.withValues(alpha: 0.86)),
        labelText: labelText,
        labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.72)),
        floatingLabelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.85)),
        hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.55)),
        suffixIcon: IconButton(
          splashRadius: 18,
          onPressed: onToggleVisible,
          icon: AnimatedSwitcher(
            duration: const Duration(milliseconds: 160),
            transitionBuilder: (child, anim) => FadeTransition(opacity: anim, child: child),
            child: Icon(
              visible ? Icons.visibility_off_rounded : Icons.visibility_rounded,
              key: ValueKey<bool>(visible),
              color: Colors.white.withValues(alpha: 0.72),
            ),
          ),
        ),
        filled: true,
        fillColor: cs.surface.withValues(alpha: 0.55),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.10))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.10))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: cs.primary.withValues(alpha: 0.85), width: 1.2)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: cs.error.withValues(alpha: 0.85))),
      ),
    );
  }
}

class _StrengthBar extends StatelessWidget {
  final double value;
  final Color color;
  const _StrengthBar({required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: value),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        builder: (context, v, _) => LinearProgressIndicator(
          value: v,
          minHeight: 8,
          backgroundColor: Colors.white.withValues(alpha: 0.10),
          valueColor: AlwaysStoppedAnimation<Color>(color),
        ),
      ),
    );
  }
}

class _RuleState {
  final String label;
  final bool ok;
  const _RuleState({required this.label, required this.ok});
}

class _RulesList extends StatelessWidget {
  final List<_RuleState> rules;
  const _RulesList({required this.rules});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    return Column(
      children: rules
          .map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  curve: Curves.easeOut,
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: r.ok ? cs.tertiary.withValues(alpha: 0.16) : Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: r.ok ? cs.tertiary.withValues(alpha: 0.55) : Colors.white.withValues(alpha: 0.10)),
                  ),
                  child: Icon(r.ok ? Icons.check_rounded : Icons.close_rounded, size: 16, color: r.ok ? cs.tertiary : Colors.white.withValues(alpha: 0.40)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(r.label, style: theme.textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: r.ok ? 0.92 : 0.62), height: 1.35)),
                ),
              ]),
            ),
          )
          .toList(),
    );
  }
}
