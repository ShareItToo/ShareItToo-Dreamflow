import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:lendify/theme.dart';

import 'package:lendify/screens/blocked_users_screen.dart';
import 'package:lendify/screens/report_user_screen.dart';
import 'package:lendify/services/localization_service.dart';
import 'package:lendify/services/messages_settings_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/translation_language_dialog.dart';
import 'package:lendify/widgets/app_popup.dart';

enum MessagesSettingsPresentation { sheet, page }

/// Reusable content for Nachrichten-Einstellungen.
///
/// - [sheet]: used inside a bottom sheet (renders its own close button)
/// - [page]: used inside a full screen (header/back handled by the screen)
class MessagesSettingsView extends StatefulWidget {
  final MessagesSettingsPresentation presentation;
  final VoidCallback? onCancel;
  final VoidCallback? onSaved;

  const MessagesSettingsView({super.key, required this.presentation, this.onCancel, this.onSaved});

  @override
  State<MessagesSettingsView> createState() => _MessagesSettingsViewState();
}

class _MessagesSettingsViewState extends State<MessagesSettingsView> {
  MessagesSettings? _settings;
  bool _loading = true;
  bool _loadFailed = false;
  bool _saving = false;
  StreamSubscription<String>? _persistenceSubscription;
  final SharedPersistenceRefreshCoordinator _refreshCoordinator =
      SharedPersistenceRefreshCoordinator();

  @override
  void initState() {
    super.initState();
    _load();
    _persistenceSubscription = SharedPersistenceSync.changes.listen((key) {
      if (!mounted || key != SharedPersistenceSync.localSafetyPrivacyStateKey) return;
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
      _settings = null;
    });
    try {
      final value = await MessagesSettingsService.get();
      final normalized = _normalizeTranslationDefaults(value).normalizedForCurrentProductRules();
      if (normalized.toJson().toString() != value.normalizedForCurrentProductRules().toJson().toString() ||
          normalized.preferredLanguageCode != value.preferredLanguageCode) {
        await MessagesSettingsService.set(normalized);
      }
      if (!mounted) return;
      setState(() => _settings = normalized);
    } catch (e) {
      debugPrint('MessagesSettingsView._load failed: $e');
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  MessagesSettings _normalizeTranslationDefaults(MessagesSettings value) {
    final fallback = _appLanguageCode();
    final code = value.preferredLanguageCode.trim();
    if (code.isEmpty || code == 'auto') {
      return value.copyWith(preferredLanguageCode: fallback);
    }
    return value;
  }

  String _appLanguageCode() {
    try {
      final code = context.read<LocalizationController>().code.trim();
      return code.isEmpty ? 'de' : code;
    } catch (_) {
      return 'de';
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    final value = _settings;
    if (value == null) return;
    setState(() => _saving = true);
    try {
      await MessagesSettingsService.set(value);
      if (!mounted) return;
      if (widget.presentation == MessagesSettingsPresentation.sheet) {
        Navigator.of(context).pop(true);
      } else if (widget.onSaved != null) {
        widget.onSaved!.call();
      } else {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      debugPrint('MessagesSettingsView._save failed: $e');
      if (!mounted) return;
      AppPopup.error(
        context,
        title: 'Einstellungen nicht gespeichert',
        message: 'Bitte versuche es erneut.',
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _languageLabel(String code) {
    return translationLanguageLabel(code);
  }

  String _effectiveTranslationLanguageCode(MessagesSettings? value) {
    final raw = value?.preferredLanguageCode.trim() ?? '';
    if (raw.isEmpty || raw == 'auto') return _appLanguageCode();
    return raw;
  }

  Future<void> _pickTranslationLanguage() async {
    if (!(_settings?.autoTranslateChat ?? false)) return;
    final current = _effectiveTranslationLanguageCode(_settings);

    final selected = await showDialog<String>(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (_) => TranslationLanguageDialog(
        title: 'Übersetzungssprache',
        initialCode: current,
        options: translationLanguageOptions,
      ),
    );

    if (!mounted || selected == null) return;
    final base = _settings ?? MessagesSettings.defaults();
    setState(() => _settings = base.copyWith(preferredLanguageCode: selected));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = _settings;

    final header = widget.presentation == MessagesSettingsPresentation.sheet
        ? Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 8, 8),
            child: Row(children: [
              Expanded(child: Text('Nachrichten-Einstellungen', style: theme.textTheme.titleLarge?.copyWith(fontSize: 20, fontWeight: FontWeight.w600, color: AppTheme.textPrimary(context)))),
              IconButton(onPressed: _saving ? null : () => Navigator.of(context).maybePop(), icon: Icon(Icons.close, size: 24, color: AppTheme.textPrimary(context))),
            ]),
          )
        : const SizedBox(height: 10);

    return Column(children: [
      header,
      Divider(height: 1, thickness: 1, color: Theme.of(context).brightness == Brightness.dark ? Colors.white24 : const Color(0xFFE2E8F0)),
      Expanded(
        child: _loading
            ? const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
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
                            'Nachrichten-Einstellungen konnten nicht sicher geladen werden.',
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
                : Stack(
                children: [
                  SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 156),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      _SettingsSection(
                        title: 'Privatsphäre & Sicherheit',
                        icon: Icons.shield_outlined,
                        emphasized: true,
                        child: Column(children: [
                          _SettingsSwitchRow(
                            icon: Icons.visibility_outlined,
                            title: 'Chat-Vorschau anzeigen',
                            subtitle: 'Zeigt die letzte Nachricht in der Chat-Liste.',
                            value: s?.showChatPreview ?? true,
                            onChanged: (v) => setState(() => _settings = (s ?? MessagesSettings.defaults()).copyWith(showChatPreview: v)),
                          ),
                          const SizedBox(height: 6),
                          _SettingsActionRow(
                            icon: Icons.block,
                            title: 'Blockierte Nutzer verwalten',
                            subtitle: 'Du bestimmst, wen du blockiert hast.',
                            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BlockedUsersScreen())),
                          ),
                          const SizedBox(height: 6),
                          _SettingsActionRow(
                            icon: Icons.report_outlined,
                            title: 'Nutzer oder Chat melden',
                            subtitle: 'Hilf uns, die Community sicher zu halten.',
                            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ReportUserScreen())),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 10),
                      _SettingsSection(
                        title: 'Übergabe & Belege',
                        icon: Icons.photo_library_outlined,
                        child: Column(children: [
                          _SettingsSwitchRow(
                            icon: Icons.add_photo_alternate_outlined,
                            title: 'Übergabefotos in Galerie speichern',
                            subtitle: 'Speichert lokal aufgenommene Übergabe- und Rückgabefotos zusätzlich auf deinem Gerät.',
                            value: s?.autoSaveHandoverPhotos ?? true,
                            onChanged: (v) => setState(() => _settings = (s ?? MessagesSettings.defaults()).copyWith(autoSaveHandoverPhotos: v)),
                          ),
                          const SizedBox(height: 6),
                          _SettingsSwitchRow(
                            icon: Icons.picture_as_pdf_outlined,
                            title: 'Belege lokal speichern',
                            subtitle: 'Lädt erzeugte Belege zusätzlich lokal herunter bzw. speichert sie auf dem Gerät.',
                            value: s?.saveReceiptsLocally ?? true,
                            onChanged: (v) => setState(() => _settings = (s ?? MessagesSettings.defaults()).copyWith(saveReceiptsLocally: v)),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 10),
                      _SettingsSection(
                        title: 'Übersetzung',
                        icon: Icons.translate_outlined,
                        child: Column(children: [
                          _SettingsSwitchRow(
                            icon: Icons.g_translate,
                            title: 'Nachrichten automatisch übersetzen',
                            subtitle: 'Zeigt Chat-Nachrichten in deiner Sprache. Gilt nur für dich.',
                            value: s?.autoTranslateChat ?? false,
                            onChanged: (v) => setState(() => _settings = (s ?? MessagesSettings.defaults()).copyWith(autoTranslateChat: v)),
                          ),
                          const SizedBox(height: 6),
                          _SettingsSelectorRow(
                            icon: Icons.language_outlined,
                            title: 'Übersetzungssprache',
                            subtitle: 'Standard: App-/Setup-Sprache. Kann für dich geändert werden.',
                            valueLabel: _languageLabel(_effectiveTranslationLanguageCode(s)),
                            onTap: _pickTranslationLanguage,
                            disabled: !(s?.autoTranslateChat ?? false),
                          ),
                        ]),
                      ),
                      const SizedBox(height: 10),
                      const SizedBox(height: 12),
                    ]),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: _GlassyFooter(
                      saving: _saving,
                      loading: _loading,
                      onCancel: () {
                        if (widget.presentation == MessagesSettingsPresentation.sheet) {
                          Navigator.of(context).maybePop();
                        } else {
                          (widget.onCancel ?? () => Navigator.of(context).maybePop()).call();
                        }
                      },
                      onSave: _save,
                    ),
                  ),
                ],
              ),
      ),
    ]);
  }
}

/// Premium bottom-sheet wrapper for Nachrichten-Einstellungen (local-only MVP).
class MessagesSettingsSheet extends StatelessWidget {
  const MessagesSettingsSheet({super.key});

  @override
  Widget build(BuildContext context) => const MessagesSettingsView(presentation: MessagesSettingsPresentation.sheet);
}

/// Glassy floating footer with Abbrechen/Speichern buttons
class _GlassyFooter extends StatelessWidget {
  final bool saving;
  final bool loading;
  final VoidCallback onCancel;
  final VoidCallback onSave;
  const _GlassyFooter({required this.saving, required this.loading, required this.onCancel, required this.onSave});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
            child: Container(
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.15) : AppTheme.surfacePrimary(context),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE2E8F0)),
              ),
              padding: const EdgeInsets.all(6),
              child: Row(children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                        child: TextButton(
                          onPressed: saving ? null : onCancel,
                          style: TextButton.styleFrom(
                            backgroundColor: isDark ? Colors.white.withValues(alpha: 0.06) : const Color(0xFFF8FAFC),
                            foregroundColor: isDark ? Colors.white.withValues(alpha: 0.85) : AppTheme.textBody(context),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: BorderSide(color: isDark ? Colors.white.withValues(alpha: 0.15) : const Color(0xFFE2E8F0)),
                            ),
                          ),
                          child: const Text('Abbrechen', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: TextButton(
                      onPressed: (saving || loading) ? null : onSave,
                      style: TextButton.styleFrom(
                        backgroundColor: theme.colorScheme.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: saving
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Änderungen speichern', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;
  final bool emphasized;
  const _SettingsSection({required this.title, required this.icon, required this.child, this.emphasized = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final tint = isDark ? Colors.white.withValues(alpha: emphasized ? 0.06 : 0.04) : (emphasized ? const Color(0xFFF8FAFC) : AppTheme.surfacePrimary(context));
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
        child: Container(
          decoration: BoxDecoration(
            color: tint,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: isDark ? Colors.white.withValues(alpha: emphasized ? 0.14 : 0.08) : const Color(0xFFE2E8F0)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Icon(icon, color: isDark ? Colors.white70 : AppTheme.textPrimary(context), size: 18),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600, letterSpacing: 0.1, fontSize: 15, color: AppTheme.textPrimary(context)))),
            ]),
            const SizedBox(height: 2),
            child,
          ]),
        ),
      ),
    );
  }
}

class _SettingsSwitchRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SettingsSwitchRow({required this.icon, required this.title, this.subtitle, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final titleColor = AppTheme.textPrimary(context);
    final subtitleColor = AppTheme.textSecondary(context);
    final iconColor = isDark ? Colors.white70 : AppTheme.textPrimary(context);
    return Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.04) : AppTheme.surfacePrimary(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE2E8F0)),
        ),
        constraints: const BoxConstraints(minHeight: 62),
        padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: isDark ? Colors.white.withValues(alpha: 0.05) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(title, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500, fontSize: 15, color: titleColor)),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: theme.textTheme.bodyMedium?.copyWith(color: subtitleColor, fontSize: 13, fontWeight: FontWeight.w400, height: 1.25)),
              ],
            ]),
          ),
          Transform.scale(
            scale: 0.86,
            child: Switch(
              value: value,
              onChanged: onChanged,
              activeThumbColor: theme.colorScheme.primary,
              activeTrackColor: theme.colorScheme.primary.withValues(alpha: 0.35),
              inactiveThumbColor: isDark ? Colors.white.withValues(alpha: 0.6) : const Color(0xFFCBD5E1),
              inactiveTrackColor: isDark ? Colors.white.withValues(alpha: 0.14) : const Color(0xFFE2E8F0),
            ),
          ),
        ]),
    );
  }
}

class _SettingsSelectorRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String valueLabel;
  final VoidCallback onTap;
  final bool disabled;
  const _SettingsSelectorRow({required this.icon, required this.title, this.subtitle, required this.valueLabel, required this.onTap, this.disabled = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final opacity = disabled ? 1.0 : 1.0;
    final titleColor = disabled ? AppTheme.textDisabled(context) : AppTheme.textPrimary(context);
    final subtitleColor = disabled ? AppTheme.textDisabled(context) : AppTheme.textSecondary(context);
    final iconColor = disabled ? AppTheme.textDisabled(context) : (isDark ? Colors.white70 : AppTheme.textPrimary(context));
    final valueColor = disabled ? AppTheme.textDisabled(context) : (isDark ? Colors.white : AppTheme.textBody(context));
    return Opacity(
      opacity: opacity,
      child: Material(
        color: isDark ? Colors.white.withValues(alpha: 0.04) : AppTheme.surfacePrimary(context),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: disabled ? null : onTap,
          child: Container(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE2E8F0))),
            constraints: const BoxConstraints(minHeight: 62),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Row(children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: isDark ? Colors.white.withValues(alpha: 0.05) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: iconColor, size: 18),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(title, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500, fontSize: 15, color: titleColor)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: theme.textTheme.bodyMedium?.copyWith(color: subtitleColor, fontSize: 13, fontWeight: FontWeight.w400, height: 1.25)),
                  ],
                ]),
              ),
              const SizedBox(width: 8),
              Text(valueLabel, style: theme.textTheme.bodyMedium?.copyWith(color: valueColor, fontWeight: FontWeight.w500, fontSize: 14)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, color: disabled ? AppTheme.textDisabled(context) : AppTheme.textSecondary(context), size: 18),
            ]),
          ),
        ),
      ),
    );
  }
}

class _SettingsActionRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  const _SettingsActionRow({required this.icon, required this.title, this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final titleColor = AppTheme.textPrimary(context);
    final subtitleColor = AppTheme.textSecondary(context);
    return Material(
      color: isDark ? Colors.white.withValues(alpha: 0.04) : AppTheme.surfacePrimary(context),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE2E8F0))),
          constraints: const BoxConstraints(minHeight: 62),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: isDark ? Colors.white.withValues(alpha: 0.05) : const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: isDark ? Colors.white70 : AppTheme.textPrimary(context), size: 18),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500, fontSize: 15, color: titleColor)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: theme.textTheme.bodyMedium?.copyWith(color: subtitleColor, fontSize: 13, fontWeight: FontWeight.w400, height: 1.25)),
                ],
              ]),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: AppTheme.textSecondary(context), size: 18),
          ]),
        ),
      ),
    );
  }
}
