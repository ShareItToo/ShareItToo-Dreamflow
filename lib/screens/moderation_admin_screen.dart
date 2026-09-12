import 'package:flutter/material.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_popup.dart';

class ModerationAdminScreen extends StatefulWidget {
  final String role;

  const ModerationAdminScreen({super.key, required this.role});

  @override
  State<ModerationAdminScreen> createState() => _ModerationAdminScreenState();
}

class _ModerationAdminScreenState extends State<ModerationAdminScreen> {
  final _password = TextEditingController();
  bool _elevated = false;
  bool _busy = false;
  String? _error;
  Map<String, dynamic> _overview = const {};
  List<Map<String, dynamic>> _reports = const [];
  List<Map<String, dynamic>> _moderationReviews = const [];
  List<Map<String, dynamic>> _users = const [];
  List<Map<String, dynamic>> _listings = const [];
  List<Map<String, dynamic>> _bookings = const [];
  List<Map<String, dynamic>> _payments = const [];
  List<Map<String, dynamic>> _audit = const [];

  bool get _isAdmin => widget.role == 'admin';

  @override
  void dispose() {
    _password.dispose();
    BackendRepository.clearStaffElevation();
    super.dispose();
  }

  Future<void> _unlock() async {
    if (_busy || _password.text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await BackendRepository.elevateStaff(_password.text);
      _password.clear();
      _elevated = true;
      await _load();
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = 'Freigabe fehlgeschlagen. Bitte prüfe dein Passwort.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() async {
    if (!_elevated) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final values = await Future.wait<Object>([
        BackendRepository.getStaffOverview(),
        BackendRepository.getStaffReports(),
        BackendRepository.getStaffUsers(),
        BackendRepository.getStaffListings(),
        BackendRepository.getStaffBookings(),
        BackendRepository.getStaffPayments(),
        BackendRepository.getStaffAudit(),
        if (_isAdmin) BackendRepository.getStaffModerationReviews(),
      ]);
      if (!mounted) return;
      setState(() {
        _overview = values[0] as Map<String, dynamic>;
        _reports = values[1] as List<Map<String, dynamic>>;
        _users = values[2] as List<Map<String, dynamic>>;
        _listings = values[3] as List<Map<String, dynamic>>;
        _bookings = values[4] as List<Map<String, dynamic>>;
        _payments = values[5] as List<Map<String, dynamic>>;
        _audit = values[6] as List<Map<String, dynamic>>;
        _moderationReviews =
            _isAdmin ? values[7] as List<Map<String, dynamic>> : const [];
      });
    } catch (_) {
      if (!mounted) return;
      BackendRepository.clearStaffElevation();
      setState(() {
        _elevated = false;
        _error =
            'Die sichere Freigabe ist abgelaufen. Bitte erneut bestätigen.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claimModerationReview(Map<String, dynamic> review) async {
    try {
      await BackendRepository.claimStaffModerationReview(
        review['id'].toString(),
      );
      await _load();
    } catch (_) {
      if (!mounted) return;
      AppPopup.error(
        context,
        title: 'Prüfung nicht übernommen',
        message: 'Die unabhängige Zuordnung konnte nicht bestätigt werden.',
      );
    }
  }

  Future<void> _resolveModerationReview(
    Map<String, dynamic> review,
    String outcome,
  ) async {
    final original = review['originalDecision'] is Map
        ? Map<String, dynamic>.from(review['originalDecision'] as Map)
        : const <String, dynamic>{};
    final measureType = original['measureType']?.toString() ?? '';
    final formKey = GlobalKey<FormState>();
    final reason = TextEditingController();
    var targetStatus = switch (measureType) {
      'listing_restriction' => outcome == 'reversed'
          ? 'active'
          : original['measureState'] == 'hidden'
              ? 'removed'
              : 'hidden',
      'private_marketplace_review' => outcome == 'reversed'
          ? 'clear'
          : original['measureState'] == 'review_required'
              ? 'blocked'
              : 'review_required',
      _ => '',
    };
    final accepted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Menschliche Prüfung abschließen'),
          content: SizedBox(
            width: 520,
            child: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Nur selbst menschlich geprüfte Tatsachen verwenden. '
                      'Der Text wird der betroffenen Person angezeigt.',
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      key: const ValueKey('moderation-review-resolution'),
                      controller: reason,
                      maxLength: 8000,
                      maxLines: 6,
                      validator: (value) => (value ?? '').trim().length < 3
                          ? 'Bitte die Entscheidung konkret begründen.'
                          : null,
                      decoration: const InputDecoration(
                        labelText: 'Nutzerseitige Begründung',
                        alignLabelWithHint: true,
                      ),
                    ),
                    if (outcome == 'modified' &&
                        measureType == 'listing_restriction')
                      DropdownButtonFormField<String>(
                        initialValue: targetStatus,
                        decoration:
                            const InputDecoration(labelText: 'Neuer Status'),
                        items: const [
                          DropdownMenuItem(
                              value: 'hidden', child: Text('Ausgeblendet')),
                          DropdownMenuItem(
                              value: 'removed', child: Text('Entfernt')),
                        ],
                        onChanged: (value) => setDialogState(
                          () => targetStatus = value ?? targetStatus,
                        ),
                      ),
                    if (outcome == 'modified' &&
                        measureType == 'private_marketplace_review')
                      DropdownButtonFormField<String>(
                        initialValue: targetStatus,
                        decoration:
                            const InputDecoration(labelText: 'Neuer Status'),
                        items: const [
                          DropdownMenuItem(
                            value: 'review_required',
                            child: Text('Weitere Prüfung erforderlich'),
                          ),
                          DropdownMenuItem(
                              value: 'blocked', child: Text('Gesperrt')),
                        ],
                        onChanged: (value) => setDialogState(
                          () => targetStatus = value ?? targetStatus,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () {
                if (!(formKey.currentState?.validate() ?? false)) return;
                Navigator.of(dialogContext).pop(true);
              },
              child: const Text('Weiter'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true || !mounted) {
      reason.dispose();
      return;
    }
    Map<String, dynamic>? correction;
    if (outcome != 'upheld') {
      final decision = await _collectDecision(
        includeStatementOfReasons: true,
        durationType:
            outcome == 'reversed' ? 'not_applicable' : 'until_reversed',
      );
      if (decision == null || !mounted) {
        reason.dispose();
        return;
      }
      correction = {
        if (targetStatus.isNotEmpty) 'targetStatus': targetStatus,
        'reasonCode': 'moderation_review_correction',
        'note': 'Unabhängige menschliche Überprüfung.',
        'decision': decision,
      };
    }
    try {
      await BackendRepository.resolveStaffModerationReview(
        reviewRequestId: review['id'].toString(),
        resolution: {
          'status': outcome,
          'userFacingReason': reason.text.trim(),
          if (correction != null) 'correction': correction,
        },
      );
      await _load();
    } catch (_) {
      if (!mounted) return;
      AppPopup.error(
        context,
        title: 'Prüfung nicht abgeschlossen',
        message: 'Ohne vollständige unabhängige Evidenz bleibt sie offen.',
      );
    } finally {
      reason.dispose();
    }
  }

  Future<void> _openModerationReview(Map<String, dynamic> review) async {
    final original = review['originalDecision'] is Map
        ? Map<String, dynamic>.from(review['originalDecision'] as Map)
        : const <String, dynamic>{};
    final status = review['status']?.toString() ?? '';
    final measureType = original['measureType']?.toString() ?? '';
    final canReverse = const {
      'listing_restriction',
      'private_marketplace_review',
      'account_suspension',
      'scope_suspension',
    }.contains(measureType);
    final canModify = const {
      'listing_restriction',
      'private_marketplace_review',
    }.contains(measureType);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Unabhängige Moderationsprüfung',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Text('Status: $status'),
              Text('Maßnahme: $measureType'),
              Text('Zielzustand: ${original['measureState'] ?? ''}'),
              const SizedBox(height: 12),
              Text('Antrag: ${review['reason'] ?? ''}'),
              const SizedBox(height: 8),
              Text('Geprüfte Tatsachen: ${original['facts'] ?? ''}'),
              Text('Grundlage: ${original['basis'] ?? ''}'),
              Text('Ursprüngliche Begründung: ${original['reasoning'] ?? ''}'),
              const SizedBox(height: 16),
              if (status == 'submitted' && review['canClaim'] == true)
                FilledButton.icon(
                  onPressed: () {
                    Navigator.of(sheetContext).pop();
                    _claimModerationReview(review);
                  },
                  icon: const Icon(Icons.assignment_ind_outlined),
                  label: const Text('Unabhängig übernehmen'),
                )
              else if (status == 'submitted')
                const Text(
                  'Der ursprüngliche Entscheider darf diese Prüfung nicht '
                  'selbst übernehmen.',
                )
              else if (status == 'in_review' &&
                  review['assignedToMe'] == true) ...[
                FilledButton(
                  onPressed: () {
                    Navigator.of(sheetContext).pop();
                    _resolveModerationReview(review, 'upheld');
                  },
                  child: const Text('Entscheidung bestätigen'),
                ),
                if (canModify)
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      _resolveModerationReview(review, 'modified');
                    },
                    child: const Text('Maßnahme ändern'),
                  ),
                if (canReverse)
                  OutlinedButton(
                    onPressed: () {
                      Navigator.of(sheetContext).pop();
                      _resolveModerationReview(review, 'reversed');
                    },
                    child: const Text('Maßnahme aufheben'),
                  ),
              ] else if (status == 'in_review')
                const Text('Diese Prüfung ist einem anderen Admin zugeordnet.')
              else
                Text('Abschluss: ${review['resolution'] ?? ''}'),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _transition(Map<String, dynamic> report, String status) async {
    final terminal = const {'actioned', 'dismissed', 'closed'}.contains(status);
    final decision = terminal
        ? await _collectDecision(includeStatementOfReasons: false)
        : null;
    if (terminal && decision == null) return;
    try {
      await BackendRepository.updateStaffReport(
        reportId: report['id'].toString(),
        update: {
          'status': status,
          'note': 'Status über die sichere Moderationsansicht geändert.',
          if (terminal)
            'resolution': {
              'outcome': status,
              'source': 'staff_app',
            },
          if (terminal) 'decision': decision,
        },
      );
      if (mounted) Navigator.of(context).pop();
      await _load();
    } catch (_) {
      if (mounted) {
        AppPopup.error(
          context,
          title: 'Aktion fehlgeschlagen',
          message: 'Die Aktion konnte nicht ausgeführt werden.',
        );
      }
    }
  }

  Future<void> _applyCaseAction(
      Map<String, dynamic> report, String action) async {
    final decision = await _collectDecision(
      includeStatementOfReasons: true,
      durationType: action == 'active' ? 'not_applicable' : 'until_reversed',
    );
    if (decision == null) return;
    try {
      if (report['targetType'] == 'listing') {
        await BackendRepository.moderateListing(
          listingId: report['targetId'].toString(),
          status: action,
          reasonCode: 'staff_case_action',
          reportId: report['id'].toString(),
          note: 'Reversible Maßnahme aus dem Moderationsfall.',
          decision: decision,
        );
      } else if (report['targetType'] == 'user') {
        await BackendRepository.suspendUser(
          userId: report['targetId'].toString(),
          scope: action,
          reasonCode: 'staff_case_action',
          reportId: report['id'].toString(),
          note: 'Zeitlich überprüfbare Maßnahme aus dem Moderationsfall.',
          decision: decision,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      await _load();
    } catch (_) {
      if (mounted) {
        AppPopup.error(
          context,
          title: 'Maßnahme fehlgeschlagen',
          message: 'Die Maßnahme konnte nicht ausgeführt werden.',
        );
      }
    }
  }

  Future<Map<String, dynamic>?> _collectDecision({
    required bool includeStatementOfReasons,
    String durationType = 'until_reversed',
  }) async {
    final formKey = GlobalKey<FormState>();
    final facts = TextEditingController();
    final basis = TextEditingController();
    final reasoning = TextEditingController();
    final territorialScope = TextEditingController();
    final automatedMeans = TextEditingController();
    var decisionGround = 'terms_violation';
    var detectionMethod = 'human';
    var automationRole = 'signal';

    String? requiredText(String? value) {
      if ((value ?? '').trim().length < 3) {
        return 'Bitte mindestens 3 Zeichen eingeben.';
      }
      return null;
    }

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(includeStatementOfReasons
              ? 'Begründung der Maßnahme'
              : 'Fallentscheidung begründen'),
          content: SizedBox(
            width: 560,
            child: SingleChildScrollView(
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Nur geprüfte Tatsachen eintragen. Keine Vermutungen, '
                      'internen Sicherheitsdetails oder nicht belegten Vorwürfe.',
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: facts,
                      maxLength: 8000,
                      maxLines: 4,
                      validator: requiredText,
                      decoration: const InputDecoration(
                        labelText: 'Konkrete Tatsachen und Umstände',
                        alignLabelWithHint: true,
                      ),
                    ),
                    TextFormField(
                      controller: basis,
                      maxLength: 2000,
                      maxLines: 3,
                      validator: requiredText,
                      decoration: const InputDecoration(
                        labelText: 'Konkrete Rechts- oder Regelgrundlage',
                        alignLabelWithHint: true,
                      ),
                    ),
                    TextFormField(
                      controller: reasoning,
                      maxLength: 8000,
                      maxLines: 4,
                      validator: requiredText,
                      decoration: const InputDecoration(
                        labelText: 'Warum die Tatsachen darunter fallen',
                        alignLabelWithHint: true,
                      ),
                    ),
                    DropdownButtonFormField<String>(
                      initialValue: detectionMethod,
                      decoration:
                          const InputDecoration(labelText: 'Erkennungsart'),
                      items: const [
                        DropdownMenuItem(
                            value: 'human',
                            child: Text('Rein menschlich geprüft')),
                        DropdownMenuItem(
                            value: 'hybrid',
                            child: Text(
                                'Automatisches Signal + menschliche Prüfung')),
                      ],
                      onChanged: (value) => setDialogState(() {
                        detectionMethod = value ?? 'human';
                      }),
                    ),
                    if (detectionMethod == 'hybrid') ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: automationRole,
                        decoration: const InputDecoration(
                            labelText: 'Rolle der Automatisierung'),
                        items: const [
                          DropdownMenuItem(
                              value: 'signal', child: Text('Nur Signal')),
                          DropdownMenuItem(
                              value: 'decision_support',
                              child: Text('Entscheidungsunterstützung')),
                        ],
                        onChanged: (value) => setDialogState(() {
                          automationRole = value ?? 'signal';
                        }),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: automatedMeans,
                        maxLength: 2000,
                        maxLines: 3,
                        validator: requiredText,
                        decoration: const InputDecoration(
                          labelText: 'Verwendetes automatisiertes Mittel',
                          alignLabelWithHint: true,
                        ),
                      ),
                    ],
                    if (includeStatementOfReasons) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: decisionGround,
                        decoration: const InputDecoration(
                            labelText: 'Entscheidungsgrund'),
                        items: const [
                          DropdownMenuItem(
                              value: 'terms_violation',
                              child: Text('Verstoß gegen Regeln/AGB')),
                          DropdownMenuItem(
                              value: 'alleged_illegal_content',
                              child: Text('Mutmaßlich rechtswidriger Inhalt')),
                        ],
                        onChanged: (value) => setDialogState(() {
                          decisionGround = value ?? 'terms_violation';
                        }),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: territorialScope,
                        maxLength: 2000,
                        maxLines: 3,
                        validator: requiredText,
                        decoration: const InputDecoration(
                          labelText: 'Räumlicher und funktionaler Umfang',
                          hintText:
                              'Wo genau gilt die Maßnahme? Keine Annahmen eintragen.',
                          alignLabelWithHint: true,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Dauer und Wirkung werden aus der gewählten Aktion '
                        'gebunden. Eine kostenlose elektronische Prüfung '
                        'bleibt verfügbar.',
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Abbrechen'),
            ),
            FilledButton(
              onPressed: () {
                if (!(formKey.currentState?.validate() ?? false)) return;
                Navigator.of(dialogContext).pop({
                  'facts': facts.text.trim(),
                  'basis': basis.text.trim(),
                  'reasoning': reasoning.text.trim(),
                  'detectionMethod': detectionMethod,
                  if (detectionMethod == 'hybrid')
                    'automatedMeans': automatedMeans.text.trim(),
                  if (includeStatementOfReasons)
                    'statementOfReasons': {
                      'decisionGround': decisionGround,
                      'decisionOrigin': 'notice',
                      'territorialScope': territorialScope.text.trim(),
                      'durationType': durationType,
                      'automationRole':
                          detectionMethod == 'human' ? 'none' : automationRole,
                    },
                });
              },
              child: const Text('Geprüfte Begründung bestätigen'),
            ),
          ],
        ),
      ),
    );

    await Future<void>.delayed(kThemeAnimationDuration);
    facts.dispose();
    basis.dispose();
    reasoning.dispose();
    territorialScope.dispose();
    automatedMeans.dispose();
    return result;
  }

  void _openReport(Map<String, dynamic> report) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Fall ${report['id']}',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              _Fact(
                  label: 'Ziel',
                  value: '${report['targetType']} · ${report['targetId']}'),
              _Fact(
                  label: 'Grund',
                  value: report['reasonCode']?.toString() ?? '—'),
              _Fact(
                  label: 'Priorität',
                  value: report['priority']?.toString() ?? 'normal'),
              _Fact(
                  label: 'Status',
                  value: report['status']?.toString() ?? 'open'),
              if ((report['details']?.toString() ?? '').isNotEmpty)
                _Fact(
                    label: 'Beschreibung', value: report['details'].toString()),
              const SizedBox(height: 18),
              Text('Fall bearbeiten',
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (report['status'] == 'open')
                    ActionChip(
                        label: const Text('Triage'),
                        onPressed: () => _transition(report, 'triaged')),
                  if (const {'open', 'triaged'}.contains(report['status']))
                    ActionChip(
                        label: const Text('Untersuchen'),
                        onPressed: () => _transition(report, 'investigating')),
                  if (_isAdmin && report['status'] == 'investigating') ...[
                    ActionChip(
                        label: const Text('Maßnahme bestätigt'),
                        onPressed: () => _transition(report, 'actioned')),
                    ActionChip(
                        label: const Text('Abweisen'),
                        onPressed: () => _transition(report, 'dismissed')),
                  ],
                  if (_isAdmin && report['status'] != 'closed')
                    ActionChip(
                        label: const Text('Schließen'),
                        onPressed: () => _transition(report, 'closed')),
                ],
              ),
              if (_isAdmin && report['targetType'] == 'listing') ...[
                const SizedBox(height: 18),
                Text('Reversible Inserat-Maßnahme',
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  ActionChip(
                      label: const Text('Ausblenden'),
                      onPressed: () => _applyCaseAction(report, 'hidden')),
                  ActionChip(
                      label: const Text('Wieder freigeben'),
                      onPressed: () => _applyCaseAction(report, 'active')),
                ]),
              ],
              if (_isAdmin && report['targetType'] == 'user') ...[
                const SizedBox(height: 18),
                Text('Nutzer-Maßnahme',
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  ActionChip(
                      label: const Text('Chat sperren'),
                      onPressed: () => _applyCaseAction(report, 'messaging')),
                  ActionChip(
                      label: const Text('Buchung sperren'),
                      onPressed: () => _applyCaseAction(report, 'booking')),
                  ActionChip(
                      label: const Text('Auszahlung sperren'),
                      onPressed: () => _applyCaseAction(report, 'payout')),
                ]),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(_isAdmin ? 'Administration' : 'Support & Moderation'),
        actions: [
          if (_elevated)
            IconButton(
                onPressed: _busy ? null : _load,
                icon: const Icon(Icons.refresh)),
        ],
      ),
      body: !_elevated ? _unlockView() : _dashboard(),
    );
  }

  Widget _unlockView() {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(Icons.admin_panel_settings_outlined,
            size: 56, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 18),
        Text('Sicherheitsfreigabe',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 10),
        const Text(
          'Gib dein aktuelles Passwort ein. Die Freigabe gilt nur kurz und wird nicht auf dem Gerät gespeichert.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 22),
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          onSubmitted: (_) => _unlock(),
          decoration: const InputDecoration(
              labelText: 'Aktuelles Passwort',
              prefixIcon: Icon(Icons.lock_outline)),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: _busy ? null : _unlock,
          icon: _busy
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.verified_user_outlined),
          label: const Text('Sicher öffnen'),
        ),
      ],
    );
  }

  Widget _dashboard() {
    if (_busy && _overview.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          if (_error != null)
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _CountCard(
                  label: 'Aktive Meldungen', value: _overview['activeReports']),
              _CountCard(
                  label: 'Hohe Priorität', value: _overview['priorityReports']),
              _CountCard(
                  label: 'Sperren', value: _overview['activeSuspensions']),
              _CountCard(
                  label: 'Streitfälle', value: _overview['openDisputes']),
            ],
          ),
          const SizedBox(height: 18),
          _Section(
            title: 'Moderationsfälle',
            children: _reports
                .map((report) => ListTile(
                      leading: Icon(report['priority'] == 'urgent'
                          ? Icons.priority_high
                          : Icons.flag_outlined),
                      title: Text('${report['reasonCode']}'),
                      subtitle:
                          Text('${report['targetType']} · ${report['status']}'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _openReport(report),
                    ))
                .toList(),
          ),
          if (_isAdmin)
            _Section(
              title: 'Unabhängige Prüfungen',
              children: _moderationReviews
                  .map((review) => ListTile(
                        leading: const Icon(Icons.fact_check_outlined),
                        title: Text(
                          review['originalDecision'] is Map
                              ? '${(review['originalDecision'] as Map)['measureType']}'
                              : 'Moderationsprüfung',
                        ),
                        subtitle: Text('${review['status']}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _openModerationReview(review),
                      ))
                  .toList(),
            ),
          _DataSection(
              title: 'Nutzer',
              count: _users.length,
              rows: _users,
              titleKey: 'displayName',
              subtitleKeys: const ['role', 'accountStatus']),
          _DataSection(
              title: 'Inserate',
              count: _listings.length,
              rows: _listings,
              titleKey: 'title',
              subtitleKeys: const ['status', 'moderationStatus']),
          _DataSection(
              title: 'Buchungen',
              count: _bookings.length,
              rows: _bookings,
              titleKey: 'id',
              subtitleKeys: const ['workflowStatus', 'currency']),
          _DataSection(
              title: 'Zahlungen',
              count: _payments.length,
              rows: _payments,
              titleKey: 'id',
              subtitleKeys: const ['status', 'currency']),
          _DataSection(
              title: 'Unveränderliches Audit',
              count: _audit.length,
              rows: _audit,
              titleKey: 'action',
              subtitleKeys: const ['resourceType', 'actorRole']),
        ],
      ),
    );
  }
}

class _CountCard extends StatelessWidget {
  final String label;
  final Object? value;
  const _CountCard({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Container(
        width: 155,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.surfacePrimary(context),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.glassStroke(context)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${value ?? 0}',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ]),
      );
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: ExpansionTile(
          initiallyExpanded: true,
          title: Text(title),
          children: children.isEmpty
              ? const [ListTile(title: Text('Keine Einträge'))]
              : children,
        ),
      );
}

class _DataSection extends StatelessWidget {
  final String title;
  final int count;
  final List<Map<String, dynamic>> rows;
  final String titleKey;
  final List<String> subtitleKeys;

  const _DataSection({
    required this.title,
    required this.count,
    required this.rows,
    required this.titleKey,
    required this.subtitleKeys,
  });

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: ExpansionTile(
          title: Text('$title ($count)'),
          children: rows
              .take(100)
              .map((row) => ListTile(
                    dense: true,
                    title: Text(row[titleKey]?.toString() ?? '—'),
                    subtitle: Text(subtitleKeys
                        .map((key) => row[key]?.toString() ?? '—')
                        .join(' · ')),
                  ))
              .toList(),
        ),
      );
}

class _Fact extends StatelessWidget {
  final String label;
  final String value;
  const _Fact({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
              width: 100,
              child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
          Expanded(child: Text(value)),
        ]),
      );
}
