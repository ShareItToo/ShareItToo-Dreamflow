import 'package:flutter/material.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/widgets/app_popup.dart';

typedef ModerationDecisionLoader = Future<List<Map<String, dynamic>>>
    Function();
typedef ModerationReviewSubmitter = Future<Map<String, dynamic>> Function(
    String decisionId, String reason);

class ModerationDecisionsScreen extends StatefulWidget {
  final ModerationDecisionLoader? loader;
  final ModerationReviewSubmitter? reviewSubmitter;

  const ModerationDecisionsScreen({
    super.key,
    this.loader,
    this.reviewSubmitter,
  });

  @override
  State<ModerationDecisionsScreen> createState() =>
      _ModerationDecisionsScreenState();
}

class _ModerationDecisionsScreenState extends State<ModerationDecisionsScreen> {
  late Future<List<Map<String, dynamic>>> _decisions;
  final Set<String> _locallySubmittedReviews = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _decisions =
        (widget.loader ?? BackendRepository.getMyModerationDecisions)();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _decisions;
  }

  Future<void> _requestReview(Map<String, dynamic> decision) async {
    final decisionId = decision['id']?.toString().trim() ?? '';
    if (decisionId.isEmpty) return;
    final formKey = GlobalKey<FormState>();
    var draftReason = '';
    final reason = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Menschliche Prüfung beantragen'),
        content: Form(
          key: formKey,
          child: TextFormField(
            key: const ValueKey('moderation-review-reason'),
            maxLength: 8000,
            maxLines: 6,
            autofocus: true,
            onChanged: (value) => draftReason = value,
            validator: (value) => (value ?? '').trim().length < 3
                ? 'Bitte begründe deinen Antrag.'
                : null,
            decoration: const InputDecoration(
              labelText: 'Was soll erneut geprüft werden?',
              alignLabelWithHint: true,
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
              Navigator.of(dialogContext).pop(draftReason.trim());
            },
            child: const Text('Kostenlos einreichen'),
          ),
        ],
      ),
    );
    if (reason == null || !mounted) return;

    try {
      final submitter = widget.reviewSubmitter ??
          (String id, String text) => BackendRepository.submitModerationReview(
                decisionId: id,
                reason: text,
              );
      await submitter(decisionId, reason);
      if (!mounted) return;
      setState(() => _locallySubmittedReviews.add(decisionId));
      AppPopup.toast(
        context,
        icon: Icons.fact_check_outlined,
        title: 'Prüfung eingereicht',
        message:
            'Dein Antrag wurde der Moderationsentscheidung sicher zugeordnet.',
      );
    } catch (_) {
      if (!mounted) return;
      AppPopup.error(
        context,
        title: 'Prüfung nicht eingereicht',
        message:
            'Bitte versuche es erneut. Die Entscheidung bleibt unverändert.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Moderationsentscheidungen')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _decisions,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _MessageState(
              icon: Icons.error_outline,
              title: 'Entscheidungen konnten nicht geladen werden',
              message: 'Es werden keine unbestätigten Begründungen angezeigt.',
              action: FilledButton.icon(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh),
                label: const Text('Erneut versuchen'),
              ),
            );
          }
          final decisions = snapshot.data ?? const [];
          if (decisions.isEmpty) {
            return const _MessageState(
              icon: Icons.verified_outlined,
              title: 'Keine Moderationsentscheidungen',
              message:
                  'Für dein Konto sind derzeit keine Entscheidungen hinterlegt.',
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: decisions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) => _DecisionCard(
                decision: decisions[index],
                locallySubmitted: _locallySubmittedReviews.contains(
                  decisions[index]['id']?.toString(),
                ),
                onRequestReview: () => _requestReview(decisions[index]),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DecisionCard extends StatelessWidget {
  static const _statementVersion = 'sit_dsa_statement_of_reasons_v1';
  static const _statementMeasureTypes = {
    'listing_restriction',
    'account_suspension',
    'scope_suspension',
    'private_marketplace_review',
    'measure_reversal',
  };

  final Map<String, dynamic> decision;
  final bool locallySubmitted;
  final VoidCallback onRequestReview;

  const _DecisionCard({
    required this.decision,
    required this.locallySubmitted,
    required this.onRequestReview,
  });

  String _text(Object? value) => value is String ? value.trim() : '';

  DateTime? _date(Object? value) {
    final parsed = DateTime.tryParse(_text(value));
    return parsed?.toLocal();
  }

  String _dateText(Object? value) {
    final parsed = _date(value);
    if (parsed == null) return 'nicht angegeben';
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(parsed.day)}.${two(parsed.month)}.${parsed.year}, '
        '${two(parsed.hour)}:${two(parsed.minute)} Uhr';
  }

  Map<String, dynamic>? get _statement {
    final raw = decision['statementOfReasons'];
    if (raw is! Map) return null;
    final statement = Map<String, dynamic>.from(raw);
    if (_text(statement['version']) != _statementVersion ||
        _text(statement['decisionGround']).isEmpty ||
        _text(statement['decisionOrigin']).isEmpty ||
        _text(statement['territorialScope']).isEmpty ||
        _text(statement['durationType']).isEmpty ||
        _text(statement['automationRole']).isEmpty ||
        statement['humanReviewed'] != true ||
        _text(statement['reviewChannel']) != 'authenticated_in_app' ||
        _date(statement['startsAt']) == null ||
        _date(statement['publishedAt']) == null ||
        _text(decision['facts']).isEmpty ||
        _text(decision['basis']).isEmpty ||
        _text(decision['reasoning']).isEmpty) {
      return null;
    }
    if (statement['durationType'] == 'fixed' &&
        _date(statement['endsAt']) == null) {
      return null;
    }
    final automationRole = _text(statement['automationRole']);
    if ((automationRole == 'none' &&
            _text(decision['detectionMethod']) != 'human') ||
        (automationRole != 'none' &&
            (_text(decision['detectionMethod']) != 'hybrid' ||
                _text(decision['automatedMeans']).isEmpty))) {
      return null;
    }
    return statement;
  }

  String get _measureLabel {
    switch (_text(decision['measureType'])) {
      case 'listing_restriction':
        return 'Einschränkung einer Anzeige';
      case 'account_suspension':
        return 'Kontosperre';
      case 'scope_suspension':
        return 'Einschränkung einer Kontofunktion';
      case 'private_marketplace_review':
        return 'Einschränkung des Marktplatzzugangs';
      case 'measure_reversal':
        return 'Aufhebung einer Maßnahme';
      case 'report_resolution':
        return 'Entscheidung zu einer Meldung';
      default:
        return 'Moderationsentscheidung';
    }
  }

  bool get _statementRequired =>
      _statementMeasureTypes.contains(_text(decision['measureType']));

  String _duration(Map<String, dynamic> statement) {
    if (statement['durationType'] == 'fixed') {
      return 'Bis ${_dateText(statement['endsAt'])}';
    }
    if (statement['durationType'] == 'not_applicable') {
      return 'Keine fortlaufende Dauer; ab Entscheidung umgesetzt';
    }
    return 'Bis zu einer dokumentierten Aufhebung';
  }

  String get _measureEffect {
    final state = _text(decision['measureState']);
    switch (_text(decision['measureType'])) {
      case 'listing_restriction':
        return state == 'removed'
            ? 'Die Anzeige wurde entfernt.'
            : 'Die Anzeige wurde ausgeblendet.';
      case 'account_suspension':
        return 'Das Konto wurde gesperrt.';
      case 'scope_suspension':
        switch (state) {
          case 'listing':
            return 'Das Erstellen und Verwalten von Anzeigen wurde gesperrt.';
          case 'booking':
            return 'Die Buchungsfunktion wurde gesperrt.';
          case 'messaging':
            return 'Die Nachrichtenfunktion wurde gesperrt.';
          case 'payout':
            return 'Auszahlungsfunktionen wurden gesperrt.';
          default:
            return 'Eine Kontofunktion wurde gesperrt.';
        }
      case 'private_marketplace_review':
        return 'Der Zugang zum privaten Marktplatz wurde eingeschränkt.';
      case 'measure_reversal':
        return 'Die zuvor dokumentierte Maßnahme wurde aufgehoben.';
      case 'report_resolution':
        return 'Die Meldung wurde abschließend bearbeitet.';
      default:
        return 'Eine Moderationsmaßnahme wurde dokumentiert.';
    }
  }

  String _ground(Map<String, dynamic> statement) =>
      statement['decisionGround'] == 'alleged_illegal_content'
          ? 'Mutmaßlich rechtswidriger Inhalt'
          : 'Verstoß gegen Regeln oder Nutzungsbedingungen';

  String _origin(Map<String, dynamic> statement) =>
      statement['decisionOrigin'] == 'notice'
          ? 'Auf eine Meldung hin'
          : 'Aufgrund einer eigenen Prüfung';

  String _automation(Map<String, dynamic> statement) {
    switch (statement['automationRole']) {
      case 'signal':
        return 'Ein automatisiertes Signal wurde berücksichtigt '
            '(${_text(decision['automatedMeans'])}); die Entscheidung wurde '
            'menschlich geprüft.';
      case 'decision_support':
        return 'Automatisierte Entscheidungsunterstützung wurde verwendet '
            '(${_text(decision['automatedMeans'])}); die Entscheidung wurde '
            'menschlich geprüft.';
      default:
        return 'Keine automatisierten Mittel; menschlich geprüft.';
    }
  }

  bool get _reviewMayBeRequested {
    if (decision['reviewAvailable'] != true ||
        decision['reviewRequest'] is Map ||
        locallySubmitted) {
      return false;
    }
    final deadline = _date(decision['reviewDeadlineAt']);
    return deadline != null && deadline.isAfter(DateTime.now());
  }

  Map<String, dynamic>? get _reviewResolutionDetails {
    final rawReview = decision['reviewRequest'];
    if (rawReview is! Map) return null;
    final review = Map<String, dynamic>.from(rawReview);
    final status = _text(review['status']);
    if (!const {'upheld', 'modified', 'reversed'}.contains(status)) {
      return null;
    }
    final rawDetails = review['resolutionDetails'];
    if (rawDetails is! Map) return null;
    final details = Map<String, dynamic>.from(rawDetails);
    final measureChanged = details['measureChanged'] == true;
    if (_text(details['outcome']) != status ||
        _text(details['userFacingReason']).length < 3 ||
        _text(review['resolution']) != _text(details['userFacingReason']) ||
        details['humanReviewed'] != true ||
        details['independent'] != true ||
        _text(details['automationRole']) != 'none' ||
        _date(details['communicatedAt']) == null ||
        (status == 'upheld' && measureChanged) ||
        (status != 'upheld' && !measureChanged)) {
      return null;
    }
    return details;
  }

  String get _reviewStatus {
    if (locallySubmitted) return 'Prüfung eingereicht';
    final raw = decision['reviewRequest'];
    if (raw is! Map) return '';
    switch (_text(raw['status'])) {
      case 'submitted':
        return 'Prüfung eingereicht';
      case 'in_review':
        return 'Prüfung läuft';
      case 'upheld':
        return _reviewResolutionDetails == null
            ? 'Prüfergebnis noch nicht vollständig bestätigt'
            : 'Entscheidung bestätigt';
      case 'modified':
        return _reviewResolutionDetails == null
            ? 'Prüfergebnis noch nicht vollständig bestätigt'
            : 'Entscheidung geändert';
      case 'reversed':
        return _reviewResolutionDetails == null
            ? 'Prüfergebnis noch nicht vollständig bestätigt'
            : 'Entscheidung aufgehoben';
      default:
        return 'Prüfstatus nicht eindeutig';
    }
  }

  @override
  Widget build(BuildContext context) {
    final statement = _statement;
    final reviewResolution = _reviewResolutionDetails;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(_measureLabel, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Entschieden am ${_dateText(decision['createdAt'])}'),
            const SizedBox(height: 14),
            if (statement == null && _statementRequired)
              const _Notice(
                icon: Icons.info_outline,
                text: 'Für diese ältere oder unvollständige Entscheidung liegt '
                    'keine vollständig bestätigte digitale Begründung vor. '
                    'SIT zeigt deshalb keine ergänzten Annahmen an.',
              )
            else if (statement != null) ...[
              _ReasonLine(label: 'Maßnahme', value: _measureEffect),
              _ReasonLine(
                  label: 'Entscheidungsgrund', value: _ground(statement)),
              _ReasonLine(
                label: 'Umfang',
                value: _text(statement['territorialScope']),
              ),
              _ReasonLine(label: 'Dauer', value: _duration(statement)),
              _ReasonLine(label: 'Auslöser', value: _origin(statement)),
              _ReasonLine(label: 'Tatsachen', value: _text(decision['facts'])),
              _ReasonLine(label: 'Grundlage', value: _text(decision['basis'])),
              _ReasonLine(
                label: 'Begründung',
                value: _text(decision['reasoning']),
              ),
              _ReasonLine(
                label: 'Automatisierung',
                value: _automation(statement),
              ),
              const SizedBox(height: 8),
              Text(
                'Eine kostenlose elektronische Prüfung ist bis '
                '${_dateText(decision['reviewDeadlineAt'])} möglich. '
                'Gesetzliche außergerichtliche und gerichtliche '
                'Rechtsbehelfe bleiben unberührt.',
              ),
            ] else ...[
              _ReasonLine(label: 'Ergebnis', value: _measureEffect),
              _ReasonLine(label: 'Tatsachen', value: _text(decision['facts'])),
              _ReasonLine(label: 'Grundlage', value: _text(decision['basis'])),
              _ReasonLine(
                label: 'Begründung',
                value: _text(decision['reasoning']),
              ),
            ],
            if (statement == null &&
                _statementRequired &&
                decision['reviewAvailable'] == true) ...[
              const SizedBox(height: 12),
              Text(
                'Du kannst trotzdem bis '
                '${_dateText(decision['reviewDeadlineAt'])} kostenlos eine '
                'menschliche Prüfung beantragen.',
              ),
            ],
            if (_reviewStatus.isNotEmpty) ...[
              const SizedBox(height: 12),
              _Notice(icon: Icons.fact_check_outlined, text: _reviewStatus),
              if (reviewResolution != null) ...[
                const SizedBox(height: 12),
                _ReasonLine(
                  label: 'Begründung der unabhängigen Prüfung',
                  value: _text(reviewResolution['userFacingReason']),
                ),
                _ReasonLine(
                  label: 'Prüfart',
                  value: 'Unabhängig und ausschließlich menschlich geprüft; '
                      'keine automatisierte Entscheidung.',
                ),
                _ReasonLine(
                  label: 'Korrektur',
                  value: reviewResolution['measureChanged'] == true
                      ? 'Die geänderte oder aufgehobene Maßnahme wurde '
                          'technisch umgesetzt.'
                      : 'Die ursprüngliche Maßnahme bleibt bestehen.',
                ),
                Text(
                  'Mitgeteilt am '
                  '${_dateText(reviewResolution['communicatedAt'])}',
                ),
              ],
            ] else if (_reviewMayBeRequested) ...[
              const SizedBox(height: 12),
              FilledButton.icon(
                key: ValueKey('request-review-${decision['id']}'),
                onPressed: onRequestReview,
                icon: const Icon(Icons.rate_review_outlined),
                label: const Text('Menschliche Prüfung beantragen'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ReasonLine extends StatelessWidget {
  final String label;
  final String value;

  const _ReasonLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 2),
            Text(value.isEmpty ? 'Nicht bestätigt' : value),
          ],
        ),
      );
}

class _Notice extends StatelessWidget {
  final IconData icon;
  final String text;

  const _Notice({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(text)),
          ],
        ),
      );
}

class _MessageState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  const _MessageState({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 52),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center),
              if (action != null) ...[const SizedBox(height: 18), action!],
            ],
          ),
        ),
      );
}
