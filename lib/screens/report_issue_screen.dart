import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/services/shared_persistence_sync.dart';
import 'package:lendify/widgets/safety_action_interaction.dart';

class ReportIssueScreen extends StatefulWidget {
  final String requestId;
  final String? itemTitle;
  final SafetyActionService? safetyActionService;

  const ReportIssueScreen({
    super.key,
    required this.requestId,
    this.itemTitle,
    this.safetyActionService,
  });

  @override
  State<ReportIssueScreen> createState() => _ReportIssueScreenState();
}

class _ReportIssueScreenState extends State<ReportIssueScreen> {
  late final SafetyActionService _safetyService;
  final SafetyActionInteractionController _safetyActions =
      SafetyActionInteractionController();
  StreamSubscription<String>? _sessionSubscription;
  VoidCallback? _releaseScreenRoute;
  Route<dynamic>? _screenRoute;
  int _loadRevision = 0;
  bool _loading = true;
  String?
      _selectedCode; // e.g., 'damage', 'delay', 'no_show', 'wrong_item', 'behavior', 'other'
  final TextEditingController _detailsCtrl = TextEditingController();
  final TextEditingController _contestedAmountCtrl = TextEditingController();
  final List<_IssueEvidence> _evidence = [];
  bool _uploadingEvidence = false;
  bool _submitting = false;
  String _submissionIdempotencyKey = '';

  bool _isHardIssue(String code) =>
      const {'damage', 'no_show', 'wrong_item', 'behavior'}.contains(code);

  String _reviewReason(String code, String note) {
    final base = switch (code) {
      'damage' => 'Hard issue reported: damage',
      'no_show' => 'Hard issue reported: no_show',
      'wrong_item' => 'Hard issue reported: wrong_item',
      'behavior' => 'Hard issue reported: behavior',
      _ => 'Hard issue reported: other',
    };
    if (note.isEmpty) return base;
    return '$base — $note';
  }

  int? _contestedAmountMinor() {
    final normalized = _contestedAmountCtrl.text.trim().replaceAll(',', '.');
    final match = RegExp(r'^(\d{1,7})(?:\.(\d{1,2}))?$').firstMatch(normalized);
    if (match == null) return null;
    final euros = int.tryParse(match.group(1)!);
    final centsText = (match.group(2) ?? '').padRight(2, '0');
    final cents = centsText.isEmpty ? 0 : int.tryParse(centsText);
    if (euros == null || cents == null) return null;
    final minor = euros * 100 + cents;
    return minor > 0 ? minor : null;
  }

  final List<_IssueType> _types = const [
    _IssueType(
        code: 'damage', label: 'Schaden melden', icon: Icons.build_outlined),
    _IssueType(
        code: 'delay',
        label: 'Verspätete Rückgabe',
        icon: Icons.pending_actions_outlined),
    _IssueType(
        code: 'no_show',
        label: 'Nicht erschienen',
        icon: Icons.event_busy_outlined),
    _IssueType(
        code: 'wrong_item',
        label: 'Falscher Artikel',
        icon: Icons.swap_horiz_outlined),
    _IssueType(
        code: 'behavior',
        label: 'Unsicheres Verhalten',
        icon: Icons.report_gmailerrorred_outlined),
    _IssueType(code: 'other', label: 'Sonstiges', icon: Icons.more_horiz),
  ];

  @override
  void initState() {
    super.initState();
    _safetyService = widget.safetyActionService ?? const SafetyActionService();
    unawaited(_load());
    _sessionSubscription = SharedPersistenceSync.changes.listen((key) {
      if (!mounted || key != SharedPersistenceSync.accountSecurityStateKey) {
        return;
      }
      _loadRevision += 1;
      _safetyActions.invalidate();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _screenRoute = ModalRoute.of(context);
    _bindOwnedScreenRoute();
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    _safetyActions.invalidate();
    try {
      final actionContext = await _safetyService.loadCurrentContext();
      if (!mounted || revision != _loadRevision || actionContext == null) {
        return;
      }
      if (!await _safetyService.isContextCurrent(actionContext) ||
          !mounted ||
          revision != _loadRevision) {
        return;
      }
      _safetyActions.replaceContext(actionContext);
      _submissionIdempotencyKey =
          'return_issue_${DateTime.now().microsecondsSinceEpoch}';
      _bindOwnedScreenRoute();
    } catch (error) {
      debugPrint('[issue] principal load failed: $error');
    } finally {
      if (mounted && revision == _loadRevision) {
        setState(() => _loading = false);
      }
    }
  }

  void _bindOwnedScreenRoute() {
    final route = _screenRoute;
    if (route == null || _safetyActions.context == null) return;
    _releaseScreenRoute?.call();
    _releaseScreenRoute = _safetyActions.trackOwnedScreenRoute(route);
  }

  @override
  void dispose() {
    _sessionSubscription?.cancel();
    _releaseScreenRoute?.call();
    _safetyActions.dispose();
    _detailsCtrl.dispose();
    _contestedAmountCtrl.dispose();
    super.dispose();
  }

  Future<void> _addEvidence() async {
    if (_uploadingEvidence || _evidence.length >= 8) return;
    final owner = _safetyActions.capture();
    if (owner == null) return;
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 90,
      maxWidth: 2048,
      maxHeight: 2048,
    );
    if (picked == null ||
        !mounted ||
        !await _safetyActions.isCurrent(_safetyService, owner)) {
      return;
    }
    setState(() => _uploadingEvidence = true);
    try {
      final bytes = await picked.readAsBytes();
      if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
        return;
      }
      final uploadId = await _safetyService.uploadEvidence(
        context: owner.context,
        bytes: bytes,
        filename: picked.name,
      );
      if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
        return;
      }
      setState(() => _evidence.add(_IssueEvidence(
            name: picked.name,
            uploadId: uploadId,
          )));
    } on SafetyActionFailure catch (failure) {
      debugPrint('[issue] evidence upload failed: ${failure.kind}');
      if (failure.kind == SafetyActionFailureKind.principalChanged) return;
      final (title, message) = switch (failure.kind) {
        SafetyActionFailureKind.rejected => (
            'Nachweis abgelehnt',
            'Der Server hat diesen Nachweis eindeutig abgelehnt. Prüfe die Datei.',
          ),
        SafetyActionFailureKind.localUnavailable => (
            'Nachweis nicht verarbeitet',
            'Der Nachweis konnte lokal nicht verarbeitet werden.',
          ),
        SafetyActionFailureKind.outcomeUnknown => (
            'Uploadstatus unklar',
            'Der Upload könnte verarbeitet worden sein. Lade den Bereich neu, bevor du es erneut versuchst.',
          ),
        SafetyActionFailureKind.principalChanged => ('', ''),
      };
      await _showOwnedNotice(owner, title: title, message: message);
    } catch (error) {
      debugPrint('[issue] evidence upload failed: $error');
      await _showOwnedNotice(
        owner,
        title: 'Uploadstatus nicht verifiziert',
        message:
            'Bitte lade den Bereich neu und prüfe den aktuellen Status, bevor du es erneut versuchst.',
      );
    } finally {
      if (mounted && _safetyActions.isSynchronouslyCurrent(owner)) {
        setState(() => _uploadingEvidence = false);
      }
    }
  }

  Future<void> _submit() async {
    final owner = _safetyActions.capture();
    if (owner == null) return;
    if (_selectedCode == null) {
      await _showOwnedNotice(
        owner,
        title: 'Bitte ein Problem wählen',
        message: 'Wähle zuerst die Art des Problems aus.',
      );
      return;
    }
    final note = _detailsCtrl.text.trim();
    final code = _selectedCode!;
    if (_isHardIssue(code) && note.length < 10) {
      await _showOwnedNotice(
        owner,
        title: 'Bitte genauer beschreiben',
        message:
            'Für einen Prüffall brauchen wir eine konkrete Beschreibung mit mindestens 10 Zeichen. Fotos aus Übergabe und Rückgabe bleiben als Nachweise erhalten.',
      );
      return;
    }
    if (_isHardIssue(code) && _evidence.isEmpty) {
      await _showOwnedNotice(
        owner,
        title: 'Privater Bildnachweis erforderlich',
        message:
            'Für einen Rückgabe-Prüffall ist mindestens ein geschütztes Foto erforderlich.',
      );
      return;
    }
    final contestedAmountMinor =
        _isHardIssue(code) ? _contestedAmountMinor() : null;
    if (_isHardIssue(code) && contestedAmountMinor == null) {
      await _showOwnedNotice(
        owner,
        title: 'Strittigen Betrag angeben',
        message:
            'Bitte gib den strittigen Anteil der bereits autorisierten Miete exakt an, zum Beispiel 12,50. Dadurch entsteht keine Zusatzbelastung.',
      );
      return;
    }
    if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
      return;
    }
    setState(() => _submitting = true);
    try {
      final hardIssue = _isHardIssue(code);
      final result = await _safetyService.submitReturnCaseIssue(
        context: owner.context,
        requestId: widget.requestId,
        reasonCode: code,
        idempotencyKey: _submissionIdempotencyKey,
        details: hardIssue ? _reviewReason(code, note) : note,
        evidenceNames:
            _evidence.map((entry) => entry.name).toList(growable: false),
        evidenceUploadIds: _evidence
            .map((entry) => entry.uploadId)
            .whereType<String>()
            .toList(growable: false),
        opensReview: hardIssue,
        contestedAuthorizedMinor: contestedAmountMinor,
      );
      if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
        return;
      }
      if (hardIssue && !result.reviewOpened) {
        await _showOwnedNotice(
          owner,
          title: 'Meldung gespeichert',
          message:
              'Die Meldung wurde dokumentiert, öffnet aber außerhalb des 48-Stunden-Fensters nicht automatisch einen Zahlungsprüffall. Der Support kann sie weiterhin prüfen.',
        );
      }
      debugPrint(
          '[issue] reported $code for request ${widget.requestId}: $note');
      if (result.reportRecorded) {
        await _showOwnedNotice(
          owner,
          title: hardIssue ? 'Prüffall eröffnet' : 'Meldung gespeichert',
          message: hardIssue
              ? 'Der Prüffall wurde eindeutig angelegt.'
              : 'Deine Meldung wurde eindeutig gespeichert.',
        );
      }
      if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
        return;
      }
      _safetyActions.completeOwnedScreenRoute(owner, true);
    } on SafetyActionFailure catch (failure) {
      debugPrint('[issue] submit failed: ${failure.kind}');
      if (failure.kind == SafetyActionFailureKind.principalChanged) return;
      final (title, message) = switch (failure.kind) {
        SafetyActionFailureKind.rejected => (
            'Meldung abgelehnt',
            'Der Server hat die Meldung eindeutig abgelehnt. Prüfe Zeitraum, Betrag und Nachweise.',
          ),
        SafetyActionFailureKind.localUnavailable
            when failure.remoteAcceptedOrConfirmed =>
          (
            'Prüffall serverseitig eröffnet',
            'Die lokale Bestätigung ist fehlgeschlagen. Lade die Buchung neu, bevor du erneut sendest.',
          ),
        SafetyActionFailureKind.localUnavailable => (
            'Meldung lokal nicht bestätigt',
            'Die lokale Speicherung konnte nicht vollständig bestätigt werden. Lade die Buchung neu.',
          ),
        SafetyActionFailureKind.outcomeUnknown => (
            'Sendestatus unklar',
            'Die Meldung könnte serverseitig angekommen sein. Lade die Buchung neu, bevor du erneut sendest.',
          ),
        SafetyActionFailureKind.principalChanged => ('', ''),
      };
      await _showOwnedNotice(owner, title: title, message: message);
    } catch (error) {
      debugPrint('[issue] submit failed: $error');
      await _showOwnedNotice(
        owner,
        title: 'Meldungsstatus nicht verifiziert',
        message:
            'Bitte lade die Buchung neu und prüfe den aktuellen Status, bevor du erneut sendest.',
      );
    } finally {
      if (mounted && _safetyActions.isSynchronouslyCurrent(owner)) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _showOwnedNotice(
    SafetyActionOwner owner, {
    required String title,
    required String message,
  }) async {
    if (!mounted || !await _safetyActions.isCurrent(_safetyService, owner)) {
      return;
    }
    if (!mounted || !_safetyActions.isSynchronouslyCurrent(owner)) return;
    await _safetyActions.showOwnedDialog<void>(
      context: context,
      owner: owner,
      builder: (_, dismiss) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => dismiss(null),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Problem melden'),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_loading) const LinearProgressIndicator(),
          if (!_loading && _safetyActions.context == null)
            const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: Text(
                'Bitte melde dich erneut an, um ein Problem zu melden.',
                textAlign: TextAlign.center,
              ),
            ),
          if (widget.itemTitle != null) ...[
            Text(
              widget.itemTitle!,
              style: theme.textTheme.titleMedium
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
          ],
          Text('Wähle ein Problem',
              style: theme.textTheme.titleSmall?.copyWith(
                  color: Colors.white70, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in _types)
                _IssueChip(
                  selected: _selectedCode == t.code,
                  icon: t.icon,
                  label: t.label,
                  onTap: _loading || _safetyActions.context == null
                      ? () {}
                      : () => setState(() => _selectedCode = t.code),
                ),
            ],
          ),
          const SizedBox(height: 16),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            child: _selectedCode == null
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    key: ValueKey(_selectedCode),
                    children: [
                      Text('Beschreibung (optional)',
                          style: theme.textTheme.titleSmall?.copyWith(
                              color: Colors.white70,
                              fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.20),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: Colors.white.withValues(alpha: 0.10)),
                        ),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        child: TextField(
                          controller: _detailsCtrl,
                          maxLines: 4,
                          decoration: const InputDecoration(
                            hintText: 'Füge Details hinzu…',
                            hintStyle: TextStyle(color: Colors.white54),
                            border: InputBorder.none,
                          ),
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                      if (_isHardIssue(_selectedCode!)) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Strittiger Anteil der autorisierten Miete',
                          style: theme.textTheme.titleSmall?.copyWith(
                            color: Colors.white70,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _contestedAmountCtrl,
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(
                            hintText: 'z. B. 12,50',
                            suffixText: 'EUR',
                            helperText:
                                'Keine Zusatzbelastung oder Schadensabbuchung.',
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Geschützter Bildnachweis',
                          style: theme.textTheme.titleSmall?.copyWith(
                            color: Colors.white70,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Mindestens ein Foto. Es bleibt privat und wird nur für diesen Prüffall verarbeitet.',
                          style: TextStyle(color: Colors.white60),
                        ),
                        const SizedBox(height: 8),
                        for (final evidence in _evidence)
                          ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.lock_outline,
                                color: Colors.white70),
                            title: Text(evidence.name,
                                style: const TextStyle(color: Colors.white)),
                          ),
                        OutlinedButton.icon(
                          onPressed: _loading ||
                                  _safetyActions.context == null ||
                                  _uploadingEvidence
                              ? null
                              : _addEvidence,
                          icon: _uploadingEvidence
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.add_a_photo_outlined),
                          label: const Text('Foto hinzufügen'),
                        ),
                      ],
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 44,
                        child: FilledButton.icon(
                          onPressed: _loading ||
                                  _safetyActions.context == null ||
                                  _submitting
                              ? null
                              : _submit,
                          icon: const Icon(Icons.send),
                          label: const Text('Meldung senden'),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _IssueEvidence {
  final String name;
  final String? uploadId;

  const _IssueEvidence({required this.name, required this.uploadId});
}

class _IssueType {
  final String code;
  final String label;
  final IconData icon;
  const _IssueType(
      {required this.code, required this.label, required this.icon});
}

class _IssueChip extends StatelessWidget {
  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _IssueChip(
      {required this.selected,
      required this.icon,
      required this.label,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    final bg = selected
        ? primary.withValues(alpha: 0.15)
        : Colors.white.withValues(alpha: 0.05);
    final border = selected ? primary.withValues(alpha: 0.4) : Colors.white12;
    final fg = selected ? primary : Colors.white70;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: border),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 16, color: fg),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
    );
  }
}
