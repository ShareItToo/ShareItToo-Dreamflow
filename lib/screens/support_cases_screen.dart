import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/widgets/support_principal_controller.dart';

typedef SupportCaseListLoader = Future<List<Map<String, dynamic>>> Function();
typedef SupportCaseDetailLoader = Future<Map<String, dynamic>> Function(
  String caseId,
);
typedef SupportAppealSubmitter = Future<Map<String, dynamic>> Function(
  String caseId,
  String grounds,
  int expectedVersion,
  String idempotencyKey,
);
typedef SupportDsaLocatorSubmitter = Future<Map<String, dynamic>> Function(
  String caseId,
  String contentLocator,
  int expectedVersion,
  String idempotencyKey,
);

const _supportAppealStates = <String>{
  'not_applicable',
  'unavailable',
  'available',
  'expired',
  'submitted',
};

const _supportAppealStatuses = <String>{
  'submitted',
  'under_review',
  'upheld',
  'modified',
  'reversed',
  'closed',
};

const _supportStatusLabels = <String, String>{
  'received': 'Eingang bestätigt',
  'acknowledged': 'Bearbeitung bestätigt',
  'waiting_for_user': 'Antwort von dir nötig',
  'waiting_for_other_party': 'Rückmeldung der anderen Partei ausstehend',
  'under_review': 'Wird geprüft',
  'escalated': 'An das zuständige Team weitergegeben',
  'decision_pending_approval': 'Entscheidung wird geprüft',
  'decided': 'Entscheidung getroffen',
  'resolved': 'Gelöst',
  'closed': 'Abgeschlossen',
  'reopened': 'Wieder geöffnet',
};

const _supportTypeLabels = <String, String>{
  'general_help': 'Allgemeine Hilfe',
  'booking_pre_start': 'Buchung vor dem Start',
  'active_handover': 'Übergabe',
  'active_rental': 'Aktive Miete',
  'active_return': 'Rückgabe',
  'post_return_dispute': 'Prüfung nach der Rückgabe',
  'cancellation_no_show': 'Storno oder Nichterscheinen',
  'money_case': 'Zahlung oder Erstattung',
  'trust_safety': 'Sicherheit',
  'moderation_content': 'Inhalt melden',
  'privacy_security': 'Datenschutz oder Kontosicherheit',
  'legal_authority': 'Rechtliche Anfrage',
  'listing_quality': 'Anzeige oder Artikel',
};

const _closureReasonLabels = <String, String>{
  'resolved_action_completed': 'Die vereinbarte Lösung wurde umgesetzt.',
  'information_provided': 'Die benötigte Information wurde bereitgestellt.',
  'user_withdrew': 'Der Fall wurde auf deinen Wunsch beendet.',
  'duplicate_merged': 'Der Fall wurde mit einem anderen Fall zusammengeführt.',
  'no_response_after_clear_deadline':
      'Der Fall wurde nach einer klar mitgeteilten Frist ohne Antwort geschlossen.',
  'outside_scope_with_route':
      'Das Anliegen wurde an den passenden Kontaktweg verwiesen.',
};

String _requiredText(Map<String, dynamic> value, String key) {
  final result = value[key]?.toString().trim() ?? '';
  if (result.isEmpty) throw FormatException('missing_$key');
  return result;
}

String? _optionalText(Map<String, dynamic> value, String key) {
  final result = value[key]?.toString().trim() ?? '';
  return result.isEmpty ? null : result;
}

class SupportCaseViewData {
  final String id;
  final String caseNumber;
  final String caseType;
  final String caseSubType;
  final String? dsaNoticeNumber;
  final String? dsaNoticeLocatorStatus;
  final String? dsaNoticeLocatorPrompt;
  final bool dsaNoticeLocatorMaySubmit;
  final String status;
  final String operatingMode;
  final String userFacingSummary;
  final String? nextAction;
  final String? nextUpdateDisplay;
  final String? userActionDueAt;
  final String? userActionDueDisplay;
  final bool finalDecisionAvailable;
  final bool appealConfigurationRecorded;
  final String appealState;
  final bool appealAvailable;
  final String? appealDeadline;
  final String? appealDeadlineDisplay;
  final String? closureReason;
  final int version;

  const SupportCaseViewData({
    required this.id,
    required this.caseNumber,
    required this.caseType,
    required this.caseSubType,
    required this.dsaNoticeNumber,
    required this.dsaNoticeLocatorStatus,
    required this.dsaNoticeLocatorPrompt,
    required this.dsaNoticeLocatorMaySubmit,
    required this.status,
    required this.operatingMode,
    required this.userFacingSummary,
    required this.nextAction,
    required this.nextUpdateDisplay,
    required this.userActionDueAt,
    required this.userActionDueDisplay,
    required this.finalDecisionAvailable,
    required this.appealConfigurationRecorded,
    required this.appealState,
    required this.appealAvailable,
    required this.appealDeadline,
    required this.appealDeadlineDisplay,
    required this.closureReason,
    required this.version,
  });

  factory SupportCaseViewData.fromMap(Map<String, dynamic> value) {
    final id = _requiredText(value, 'id');
    final caseNumber = _requiredText(value, 'caseNumber');
    final caseType = _requiredText(value, 'caseType');
    final caseSubType = _requiredText(value, 'caseSubType');
    final dsaNoticeNumber = _optionalText(value, 'dsaNoticeNumber');
    final dsaNoticeLocatorStatus =
        _optionalText(value, 'dsaNoticeLocatorStatus');
    final dsaNoticeLocatorPrompt =
        _optionalText(value, 'dsaNoticeLocatorPrompt');
    final status = _requiredText(value, 'status');
    final operatingMode = _requiredText(value, 'operatingMode');
    final userFacingSummary = _requiredText(value, 'userFacingSummary');
    final nextAction = _optionalText(value, 'nextAction');
    final nextUpdateDisplay = _optionalText(value, 'nextUpdateDisplay');
    final userActionDueAt = _optionalText(value, 'userActionDueAt');
    final userActionDueDisplay = _optionalText(value, 'userActionDueDisplay');
    final closureReason = _optionalText(value, 'closureReason');
    final appealState = _requiredText(value, 'appealState');
    final appealDeadline = _optionalText(value, 'appealDeadline');
    final appealDeadlineDisplay = _optionalText(value, 'appealDeadlineDisplay');
    final isFinal = status == 'resolved' || status == 'closed';
    final decisionMayBeVisible = isFinal || status == 'reopened';
    final appealConfigured = value['appealConfigurationRecorded'] == true;
    if (!RegExp(
          r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
        ).hasMatch(id) ||
        !RegExp(r'^SIT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$')
            .hasMatch(caseNumber) ||
        !_supportStatusLabels.containsKey(status) ||
        !const {'simulation', 'internal_testing'}.contains(operatingMode) ||
        value['timezone'] != 'Europe/Berlin' ||
        caseType.length > 80 ||
        caseSubType.length > 100 ||
        (caseType == 'moderation_content' &&
                caseSubType == 'illegal_content_notice'
            ? !RegExp(r'^SIT-N-[A-HJ-NP-Z2-9]{12}$')
                .hasMatch(dsaNoticeNumber ?? '')
            : dsaNoticeNumber != null) ||
        (dsaNoticeLocatorStatus != null &&
            !const {'complete', 'needs_clarification'}
                .contains(dsaNoticeLocatorStatus)) ||
        (dsaNoticeLocatorStatus == null && dsaNoticeLocatorPrompt != null) ||
        (dsaNoticeLocatorStatus == 'complete' &&
            dsaNoticeLocatorPrompt != null) ||
        (dsaNoticeLocatorStatus == 'needs_clarification' &&
            (dsaNoticeLocatorPrompt == null ||
                dsaNoticeLocatorPrompt.length > 500)) ||
        value['dsaNoticeLocatorMaySubmit'] is! bool ||
        (value['dsaNoticeLocatorMaySubmit'] == true &&
            dsaNoticeLocatorStatus != 'needs_clarification') ||
        (caseType != 'moderation_content' &&
            (dsaNoticeLocatorStatus != null ||
                value['dsaNoticeLocatorMaySubmit'] == true)) ||
        userFacingSummary.length > 2000 ||
        (nextAction?.length ?? 0) > 2000 ||
        (nextUpdateDisplay?.length ?? 0) > 80 ||
        (userActionDueAt != null &&
            DateTime.tryParse(userActionDueAt) == null) ||
        (userActionDueDisplay?.length ?? 0) > 80 ||
        (closureReason?.length ?? 0) > 80 ||
        (!isFinal && (nextAction == null || nextUpdateDisplay == null)) ||
        (isFinal && (nextAction != null || nextUpdateDisplay != null)) ||
        (status == 'waiting_for_user' &&
            (userActionDueAt == null || userActionDueDisplay == null)) ||
        (status != 'waiting_for_user' &&
            (userActionDueAt != null || userActionDueDisplay != null)) ||
        value['finalDecisionAvailable'] is! bool ||
        (value['finalDecisionAvailable'] == true && !decisionMayBeVisible) ||
        value['appealConfigurationRecorded'] is! bool ||
        !_supportAppealStates.contains(appealState) ||
        value['appealAvailable'] is! bool ||
        (appealDeadline != null && DateTime.tryParse(appealDeadline) == null) ||
        (appealDeadlineDisplay?.length ?? 0) > 80 ||
        (status == 'closed' && !appealConfigured) ||
        (appealState == 'not_applicable' && status == 'closed') ||
        (appealState == 'unavailable' &&
            (status != 'closed' || appealDeadline != null)) ||
        (const {'available', 'expired'}.contains(appealState) &&
            (status != 'closed' ||
                appealDeadline == null ||
                appealDeadlineDisplay == null)) ||
        (appealState == 'submitted' &&
            (!appealConfigured ||
                appealDeadline == null ||
                appealDeadlineDisplay == null)) ||
        (value['appealAvailable'] == true && appealState != 'available') ||
        value['version'] is! int ||
        (value['version'] as int) < 1) {
      throw const FormatException('invalid_support_case');
    }
    return SupportCaseViewData(
      id: id,
      caseNumber: caseNumber,
      caseType: caseType,
      caseSubType: caseSubType,
      dsaNoticeNumber: dsaNoticeNumber,
      dsaNoticeLocatorStatus: dsaNoticeLocatorStatus,
      dsaNoticeLocatorPrompt: dsaNoticeLocatorPrompt,
      dsaNoticeLocatorMaySubmit: value['dsaNoticeLocatorMaySubmit'] == true,
      status: status,
      operatingMode: operatingMode,
      userFacingSummary: userFacingSummary,
      nextAction: nextAction,
      nextUpdateDisplay: nextUpdateDisplay,
      userActionDueAt: userActionDueAt,
      userActionDueDisplay: userActionDueDisplay,
      finalDecisionAvailable: value['finalDecisionAvailable'] == true,
      appealConfigurationRecorded: appealConfigured,
      appealState: appealState,
      appealAvailable: value['appealAvailable'] == true,
      appealDeadline: appealDeadline,
      appealDeadlineDisplay: appealDeadlineDisplay,
      closureReason: closureReason,
      version: value['version'] as int,
    );
  }

  String get statusLabel => _supportStatusLabels[status]!;
  String get typeLabel => _supportTypeLabels[caseType] ?? 'Support-Anliegen';
  bool get waitsForUser => status == 'waiting_for_user';
  bool get needsDsaLocator =>
      dsaNoticeLocatorStatus == 'needs_clarification' &&
      dsaNoticeLocatorMaySubmit;
  bool get isFinal => status == 'resolved' || status == 'closed';
}

class SupportFinalDecisionViewData {
  final String decision;
  final String effect;
  final String reason;
  final String implementationResult;
  final String redressRoute;
  final String implementedAt;
  final String implementedDisplay;
  final String communicatedAt;

  const SupportFinalDecisionViewData({
    required this.decision,
    required this.effect,
    required this.reason,
    required this.implementationResult,
    required this.redressRoute,
    required this.implementedAt,
    required this.implementedDisplay,
    required this.communicatedAt,
  });

  factory SupportFinalDecisionViewData.fromMap(Map<String, dynamic> value) {
    final decision = _requiredText(value, 'decision');
    final effect = _requiredText(value, 'effect');
    final reason = _requiredText(value, 'reason');
    final implementationResult = _requiredText(value, 'implementationResult');
    final redressRoute = _requiredText(value, 'redressRoute');
    final implementedAt = _requiredText(value, 'implementedAt');
    final implementedDisplay = _requiredText(value, 'implementedDisplay');
    final communicatedAt = _requiredText(value, 'communicatedAt');
    final implementedDate = DateTime.tryParse(implementedAt);
    final communicatedDate = DateTime.tryParse(communicatedAt);
    if (decision.length > 4000 ||
        effect.length > 4000 ||
        reason.length > 8000 ||
        implementationResult.length > 4000 ||
        redressRoute.length > 2000 ||
        implementedDisplay.length > 80 ||
        implementedDate == null ||
        communicatedDate == null ||
        communicatedDate.isBefore(implementedDate) ||
        value['timezone'] != 'Europe/Berlin') {
      throw const FormatException('invalid_support_final_decision');
    }
    return SupportFinalDecisionViewData(
      decision: decision,
      effect: effect,
      reason: reason,
      implementationResult: implementationResult,
      redressRoute: redressRoute,
      implementedAt: implementedAt,
      implementedDisplay: implementedDisplay,
      communicatedAt: communicatedAt,
    );
  }
}

class SupportCaseEventViewData {
  final String? fromStatus;
  final String? toStatus;

  const SupportCaseEventViewData({
    required this.fromStatus,
    required this.toStatus,
  });

  factory SupportCaseEventViewData.fromMap(Map<String, dynamic> value) {
    final fromStatus = _optionalText(value, 'fromStatus');
    final toStatus = _optionalText(value, 'toStatus');
    return SupportCaseEventViewData(
      fromStatus:
          _supportStatusLabels.containsKey(fromStatus) ? fromStatus : null,
      toStatus: _supportStatusLabels.containsKey(toStatus) ? toStatus : null,
    );
  }

  String get label {
    if (fromStatus == null && toStatus == 'received') {
      return 'Fall eingegangen';
    }
    if (toStatus != null) return _supportStatusLabels[toStatus]!;
    return 'Fall aktualisiert';
  }
}

class SupportAppealViewData {
  final String id;
  final String reviewNumber;
  final String originalCaseNumber;
  final String status;
  final String submittedAt;
  final String submittedDisplay;
  final String nextUpdateAt;
  final String nextUpdateDisplay;
  final String materialSummary;
  final String interimEffect;

  const SupportAppealViewData({
    required this.id,
    required this.reviewNumber,
    required this.originalCaseNumber,
    required this.status,
    required this.submittedAt,
    required this.submittedDisplay,
    required this.nextUpdateAt,
    required this.nextUpdateDisplay,
    required this.materialSummary,
    required this.interimEffect,
  });

  factory SupportAppealViewData.fromMap(Map<String, dynamic> value) {
    final id = _requiredText(value, 'id');
    final reviewNumber = _requiredText(value, 'reviewNumber');
    final originalCaseNumber = _requiredText(value, 'originalCaseNumber');
    final status = _requiredText(value, 'status');
    final submittedAt = _requiredText(value, 'submittedAt');
    final submittedDisplay = _requiredText(value, 'submittedDisplay');
    final nextUpdateAt = _requiredText(value, 'nextUpdateAt');
    final nextUpdateDisplay = _requiredText(value, 'nextUpdateDisplay');
    final materialSummary = _requiredText(value, 'materialSummary');
    final interimEffect = _requiredText(value, 'interimEffect');
    if (!RegExp(
          r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
        ).hasMatch(id) ||
        !RegExp(r'^SIT-R-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$')
            .hasMatch(reviewNumber) ||
        !RegExp(r'^SIT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$')
            .hasMatch(originalCaseNumber) ||
        !_supportAppealStatuses.contains(status) ||
        DateTime.tryParse(submittedAt) == null ||
        DateTime.tryParse(nextUpdateAt) == null ||
        !DateTime.parse(nextUpdateAt).isAfter(DateTime.parse(submittedAt)) ||
        submittedDisplay.length > 80 ||
        nextUpdateDisplay.length > 80 ||
        materialSummary.length > 500 ||
        interimEffect.length > 500 ||
        value['externalMessageSent'] != false ||
        value['timezone'] != 'Europe/Berlin') {
      throw const FormatException('invalid_support_appeal');
    }
    return SupportAppealViewData(
      id: id,
      reviewNumber: reviewNumber,
      originalCaseNumber: originalCaseNumber,
      status: status,
      submittedAt: submittedAt,
      submittedDisplay: submittedDisplay,
      nextUpdateAt: nextUpdateAt,
      nextUpdateDisplay: nextUpdateDisplay,
      materialSummary: materialSummary,
      interimEffect: interimEffect,
    );
  }
}

class SupportMessageViewData {
  final String id;
  final String title;
  final String content;
  final String sentAt;
  final String createdAt;
  final String? correctedMessageId;

  const SupportMessageViewData({
    required this.id,
    required this.title,
    required this.content,
    required this.sentAt,
    required this.createdAt,
    required this.correctedMessageId,
  });

  factory SupportMessageViewData.fromMap(Map<String, dynamic> value) {
    final id = _requiredText(value, 'id');
    final title = _requiredText(value, 'title');
    final content = _requiredText(value, 'content');
    final sentAt = _requiredText(value, 'sentAt');
    final createdAt = _requiredText(value, 'createdAt');
    final correctedMessageId = _optionalText(value, 'correctedMessageId');
    final uuid = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    );
    final sent = DateTime.tryParse(sentAt);
    final created = DateTime.tryParse(createdAt);
    if (!uuid.hasMatch(id) ||
        (correctedMessageId != null && !uuid.hasMatch(correctedMessageId)) ||
        title.length > 200 ||
        content.length > 8000 ||
        content.contains(RegExp(r'\{\{[a-z0-9_]+\}\}')) ||
        sent == null ||
        created == null ||
        sent.isBefore(created) ||
        value['externalMessageSent'] != false) {
      throw const FormatException('invalid_support_message');
    }
    return SupportMessageViewData(
      id: id,
      title: title,
      content: content,
      sentAt: sentAt,
      createdAt: createdAt,
      correctedMessageId: correctedMessageId,
    );
  }
}

class SupportCaseDetailViewData {
  final SupportCaseViewData supportCase;
  final SupportFinalDecisionViewData? finalDecision;
  final SupportAppealViewData? appeal;
  final List<SupportMessageViewData> messages;
  final List<SupportCaseEventViewData> events;

  const SupportCaseDetailViewData({
    required this.supportCase,
    required this.finalDecision,
    required this.appeal,
    required this.messages,
    required this.events,
  });

  factory SupportCaseDetailViewData.fromMap(Map<String, dynamic> value) {
    final rawCase = value['supportCase'];
    final rawFinalDecision = value['finalDecision'];
    final rawAppeal = value['appeal'];
    final rawMessages = value['messages'];
    final rawEvents = value['events'];
    if (rawCase is! Map ||
        rawMessages is! List ||
        rawMessages.any((message) => message is! Map) ||
        rawEvents is! List ||
        rawEvents.any((event) => event is! Map)) {
      throw const FormatException('invalid_support_case_detail');
    }
    final supportCase = SupportCaseViewData.fromMap(
      Map<String, dynamic>.from(rawCase),
    );
    if (rawFinalDecision != null && rawFinalDecision is! Map) {
      throw const FormatException('invalid_support_case_detail');
    }
    if (rawAppeal != null && rawAppeal is! Map) {
      throw const FormatException('invalid_support_case_detail');
    }
    final finalDecision = rawFinalDecision is Map
        ? SupportFinalDecisionViewData.fromMap(
            Map<String, dynamic>.from(rawFinalDecision),
          )
        : null;
    if (supportCase.finalDecisionAvailable != (finalDecision != null)) {
      throw const FormatException('invalid_support_case_detail');
    }
    final appeal = rawAppeal is Map
        ? SupportAppealViewData.fromMap(Map<String, dynamic>.from(rawAppeal))
        : null;
    if ((supportCase.appealState == 'submitted') != (appeal != null) ||
        (appeal != null &&
            appeal.originalCaseNumber != supportCase.caseNumber)) {
      throw const FormatException('invalid_support_case_detail');
    }
    return SupportCaseDetailViewData(
      supportCase: supportCase,
      finalDecision: finalDecision,
      appeal: appeal,
      messages: rawMessages
          .cast<Map>()
          .map((message) => SupportMessageViewData.fromMap(
                Map<String, dynamic>.from(message),
              ))
          .toList(growable: false),
      events: rawEvents
          .cast<Map>()
          .map((event) => SupportCaseEventViewData.fromMap(
                Map<String, dynamic>.from(event),
              ))
          .toList(growable: false),
    );
  }
}

/// Every view and its follow-up forms share one immutable interaction owner.
/// Initial loading is not an empty server result; invalidation reveals no data.
abstract class _SupportOwnedState<W extends StatefulWidget> extends State<W> {
  AuthSessionOwner? get expectedSupportOwner;
  late final SupportPrincipalController _principal;
  Route<dynamic>? _ownedRoute;
  VoidCallback? _releaseRoute;

  @override
  void initState() {
    super.initState();
    _principal = SupportPrincipalController(expectedOwner: expectedSupportOwner)
      ..addListener(_principalChanged);
  }

  void _principalChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (!identical(route, _ownedRoute)) {
      _releaseRoute?.call();
      _ownedRoute = route;
      _releaseRoute = route == null ? null : _principal.trackScreenRoute(route);
    }
  }

  Future<R> _readOwned<R>(Future<R> Function(AuthSessionOwner) load) {
    final pending = _performOwnedRead(load);
    // A session can disappear before the view's FutureBuilder is attached.
    // Observe abandonment without replacing the original future or its error;
    // an attached FutureBuilder still receives the exact failure, never [].
    pending.ignore();
    return pending;
  }

  Future<R> _performOwnedRead<R>(
      Future<R> Function(AuthSessionOwner) load) async {
    final captured = _principal.capture();
    final epoch = AuthService.sessionEpoch;
    // Only initial bootstrap awaits readiness. The controller itself captured
    // the epoch before reading auth and can never adopt a successor account.
    if (_principal.loading) await _principal.ready;
    final owner = captured ?? _principal.capture();
    if (owner == null ||
        epoch != AuthService.sessionEpoch ||
        !await _principal.isCurrent(owner)) {
      throw StateError('support_session_not_current');
    }
    try {
      final result = await load(owner);
      if (!await _principal.isCurrent(owner)) {
        throw StateError('support_session_not_current');
      }
      return result;
    } catch (_) {
      // Even a failed request must invalidate stale UI if its change event
      // was missed. Rethrow preserves the original load error for current A.
      await _principal.isCurrent(owner);
      rethrow;
    }
  }

  @override
  void dispose() {
    _principal.removeListener(_principalChanged);
    _releaseRoute?.call();
    _principal.dispose();
    super.dispose();
  }

  Widget buildOwned(BuildContext context);

  @override
  Widget build(BuildContext context) {
    if (_principal.loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_principal.capture() == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Support')),
        body: const Center(
            child: Text(
          'Die Sitzung ist nicht verfügbar oder hat sich geändert. Bitte melde dich an und öffne den Support erneut.',
          key: ValueKey('support_session_unavailable'),
        )),
      );
    }
    return buildOwned(context);
  }
}

class SupportCasesScreen extends StatefulWidget {
  final AuthSessionOwner? owner;
  final SupportCaseListLoader? listLoader;
  final SupportCaseDetailLoader? detailLoader;
  final SupportAppealSubmitter? appealSubmitter;
  final SupportDsaLocatorSubmitter? dsaLocatorSubmitter;

  const SupportCasesScreen({
    super.key,
    this.owner,
    this.listLoader,
    this.detailLoader,
    this.appealSubmitter,
    this.dsaLocatorSubmitter,
  });

  @override
  State<SupportCasesScreen> createState() => _SupportCasesScreenState();
}

class _SupportCasesScreenState extends _SupportOwnedState<SupportCasesScreen> {
  @override
  AuthSessionOwner? get expectedSupportOwner => widget.owner;
  late Future<List<SupportCaseViewData>> _cases;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _cases = _readOwned((owner) async {
      final items = await (widget.listLoader?.call() ??
          BackendRepository.getMySupportCases(owner: owner));
      return items.map(SupportCaseViewData.fromMap).toList(growable: false);
    });
  }

  Future<void> _refresh() async {
    setState(_reload);
    try {
      await _cases;
    } catch (_) {
      // FutureBuilder retains the explicit load error; refresh completion
      // does not invent a successful or empty response.
      return;
    }
  }

  Future<void> _open(SupportCaseViewData supportCase) async {
    final owner = _principal.capture();
    if (owner == null) return;
    await _principal.pushOwnedRoute<void>(
        context: context,
        owner: owner,
        route: MaterialPageRoute(
          builder: (_) => SupportCaseDetailScreen(
            owner: owner,
            initialCase: supportCase,
            detailLoader: widget.detailLoader,
            appealSubmitter: widget.appealSubmitter,
            dsaLocatorSubmitter: widget.dsaLocatorSubmitter,
          ),
        ));
  }

  @override
  Widget buildOwned(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF101820),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        title: const Text('Meine Support-Fälle'),
      ),
      body: FutureBuilder<List<SupportCaseViewData>>(
        future: _cases,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _SupportLoadError(onRetry: () => setState(_reload));
          }
          final cases = snapshot.data;
          if (cases == null) {
            return _SupportLoadError(onRetry: () => setState(_reload));
          }
          if (cases.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(24),
                children: const [
                  SizedBox(height: 80),
                  Icon(Icons.inbox_outlined, size: 48, color: Colors.white54),
                  SizedBox(height: 16),
                  Text(
                    'Noch keine Support-Fälle',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Neue Fälle erscheinen hier erst nach einer serverbestätigten Case-ID.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, height: 1.45),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: FocusTraversalGroup(
              policy: WidgetOrderTraversalPolicy(),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                itemCount: cases.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) => _SupportCaseListCard(
                  supportCase: cases[index],
                  onTap: () => _open(cases[index]),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class SupportCaseDetailScreen extends StatefulWidget {
  final AuthSessionOwner? owner;
  final SupportCaseViewData initialCase;
  final SupportCaseDetailLoader? detailLoader;
  final SupportAppealSubmitter? appealSubmitter;
  final SupportDsaLocatorSubmitter? dsaLocatorSubmitter;

  const SupportCaseDetailScreen({
    super.key,
    this.owner,
    required this.initialCase,
    this.detailLoader,
    this.appealSubmitter,
    this.dsaLocatorSubmitter,
  });

  @override
  State<SupportCaseDetailScreen> createState() =>
      _SupportCaseDetailScreenState();
}

class SupportCaseNotificationDestinationScreen extends StatefulWidget {
  final AuthSessionOwner? owner;
  final String caseId;
  final SupportCaseDetailLoader? detailLoader;

  const SupportCaseNotificationDestinationScreen({
    super.key,
    this.owner,
    required this.caseId,
    this.detailLoader,
  });

  @override
  State<SupportCaseNotificationDestinationScreen> createState() =>
      _SupportCaseNotificationDestinationScreenState();
}

class _SupportCaseNotificationDestinationScreenState
    extends _SupportOwnedState<SupportCaseNotificationDestinationScreen> {
  @override
  AuthSessionOwner? get expectedSupportOwner => widget.owner;
  late Future<SupportCaseDetailViewData> _detail;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _detail = _readOwned((owner) async {
      final value = await (widget.detailLoader?.call(widget.caseId) ??
          BackendRepository.getSupportCase(widget.caseId, owner: owner));
      final detail = SupportCaseDetailViewData.fromMap(value);
      if (detail.supportCase.id != widget.caseId) {
        throw const FormatException('support_case_identity_mismatch');
      }
      return detail;
    });
  }

  @override
  Widget buildOwned(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF101820),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        title: const Text('Support-Fall'),
      ),
      body: FutureBuilder<SupportCaseDetailViewData>(
        future: _detail,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || snapshot.data == null) {
            return _SupportNotificationUnavailable(
              onRetry: () => setState(_reload),
              onOpenCases: _openCases,
            );
          }
          return _SupportCaseDetailBody(
            principal: _principal,
            detail: snapshot.data!,
            appealSubmitter: null,
            dsaLocatorSubmitter: null,
            onAppealSubmitted: () => setState(_reload),
            onDsaLocatorSubmitted: () => setState(_reload),
          );
        },
      ),
    );
  }

  Future<void> _openCases() async {
    final owner = _principal.capture();
    if (owner == null) return;
    await _principal.pushOwnedRoute<void>(
        context: context,
        owner: owner,
        route: MaterialPageRoute(
            builder: (_) => SupportCasesScreen(owner: owner)));
  }
}

class _SupportNotificationUnavailable extends StatelessWidget {
  final VoidCallback onRetry;
  final VoidCallback onOpenCases;

  const _SupportNotificationUnavailable({
    required this.onRetry,
    required this.onOpenCases,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.shield_outlined, size: 48, color: Colors.white70),
            const SizedBox(height: 16),
            const Text(
              'Support-Fall nicht verfügbar',
              key: ValueKey('support_notification_unavailable'),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Der Fall wurde entfernt, ist für dieses Konto nicht freigegeben oder kann gerade nicht sicher geladen werden. Es werden keine Falldaten angezeigt.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, height: 1.45),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              key: const ValueKey('support_notification_retry'),
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Erneut prüfen'),
            ),
            const SizedBox(height: 8),
            TextButton(
              key: const ValueKey('support_notification_open_cases'),
              onPressed: onOpenCases,
              child: const Text('Meine Support-Fälle'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SupportCaseDetailScreenState
    extends _SupportOwnedState<SupportCaseDetailScreen> {
  @override
  AuthSessionOwner? get expectedSupportOwner => widget.owner;
  late Future<SupportCaseDetailViewData> _detail;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _detail = _readOwned((owner) async {
      final value = await (widget.detailLoader?.call(widget.initialCase.id) ??
          BackendRepository.getSupportCase(widget.initialCase.id,
              owner: owner));
      final detail = SupportCaseDetailViewData.fromMap(value);
      if (detail.supportCase.id != widget.initialCase.id ||
          detail.supportCase.caseNumber != widget.initialCase.caseNumber) {
        throw const FormatException('support_case_identity_mismatch');
      }
      return detail;
    });
  }

  @override
  Widget buildOwned(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF101820),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        title: Text(widget.initialCase.caseNumber),
      ),
      body: FutureBuilder<SupportCaseDetailViewData>(
        future: _detail,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _SupportLoadError(onRetry: () => setState(_reload));
          }
          return _SupportCaseDetailBody(
            principal: _principal,
            detail: snapshot.data!,
            appealSubmitter: widget.appealSubmitter,
            dsaLocatorSubmitter: widget.dsaLocatorSubmitter,
            onAppealSubmitted: () => setState(_reload),
            onDsaLocatorSubmitted: () => setState(_reload),
          );
        },
      ),
    );
  }
}

class _SupportCaseListCard extends StatelessWidget {
  final SupportCaseViewData supportCase;
  final VoidCallback onTap;

  const _SupportCaseListCard({
    required this.supportCase,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      key: ValueKey('support_case_card_${supportCase.id}'),
      container: true,
      button: true,
      label:
          'Support-Fall ${supportCase.caseNumber}, Status ${supportCase.statusLabel}',
      hint: 'Öffnet die Falldetails',
      child: Material(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        supportCase.caseNumber,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ExcludeSemantics(
                      child: Icon(
                        Icons.chevron_right,
                        color: Colors.white54,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                _SupportStatusChip(supportCase: supportCase),
                if (supportCase.dsaNoticeNumber != null) ...[
                  const SizedBox(height: 8),
                  _SupportMetaLine(
                    icon: Icons.gavel_outlined,
                    text: 'Notice-ID: ${supportCase.dsaNoticeNumber}',
                  ),
                ],
                if (supportCase.needsDsaLocator) ...[
                  const SizedBox(height: 8),
                  const _SupportMetaLine(
                    icon: Icons.add_location_alt_outlined,
                    text: 'Exakten Fundort ergänzen',
                  ),
                ],
                const SizedBox(height: 12),
                Text(
                  supportCase.typeLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  supportCase.userFacingSummary,
                  style: const TextStyle(color: Colors.white70, height: 1.45),
                ),
                if (supportCase.userActionDueDisplay != null) ...[
                  const SizedBox(height: 12),
                  _SupportMetaLine(
                    icon: Icons.event_busy_outlined,
                    text: 'Antwort bis: ${supportCase.userActionDueDisplay}',
                  ),
                ],
                if (supportCase.nextUpdateDisplay != null) ...[
                  const SizedBox(height: 8),
                  _SupportMetaLine(
                    icon: Icons.schedule_outlined,
                    text: 'Nächstes Update: ${supportCase.nextUpdateDisplay}',
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SupportCaseDetailBody extends StatelessWidget {
  final SupportPrincipalController principal;
  final SupportCaseDetailViewData detail;
  final SupportAppealSubmitter? appealSubmitter;
  final SupportDsaLocatorSubmitter? dsaLocatorSubmitter;
  final VoidCallback onAppealSubmitted;
  final VoidCallback onDsaLocatorSubmitted;

  const _SupportCaseDetailBody({
    required this.principal,
    required this.detail,
    required this.appealSubmitter,
    required this.dsaLocatorSubmitter,
    required this.onAppealSubmitted,
    required this.onDsaLocatorSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    final supportCase = detail.supportCase;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Semantics(
          header: true,
          child: Text(
            supportCase.typeLabel,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
          ),
        ),
        const SizedBox(height: 12),
        _SupportStatusChip(supportCase: supportCase),
        const SizedBox(height: 14),
        _SupportInfoCard(
          title: 'Aktueller Stand',
          icon: Icons.info_outline,
          child: Text(
            supportCase.userFacingSummary,
            style: const TextStyle(color: Colors.white70, height: 1.5),
          ),
        ),
        if (supportCase.dsaNoticeNumber != null) ...[
          const SizedBox(height: 12),
          _SupportInfoCard(
            key: const ValueKey('support_dsa_notice_receipt'),
            title: 'Gesonderte DSA-Meldung',
            icon: Icons.gavel_outlined,
            child: Text(
              'Notice-ID: ${supportCase.dsaNoticeNumber}\n'
              'Der Eingang ist bestätigt. Eine Entscheidung über die '
              'Rechtswidrigkeit ist damit noch nicht getroffen.',
              style: const TextStyle(color: Colors.white70, height: 1.5),
            ),
          ),
        ],
        if (supportCase.needsDsaLocator) ...[
          const SizedBox(height: 12),
          _SupportDsaLocatorCard(
            principal: principal,
            supportCase: supportCase,
            submitter: dsaLocatorSubmitter,
            onSubmitted: onDsaLocatorSubmitted,
          ),
        ],
        if (supportCase.waitsForUser) ...[
          const SizedBox(height: 12),
          _SupportInfoCard(
            key: const ValueKey('support_user_action'),
            title: 'Deine Antwort ist nötig',
            icon: Icons.reply_outlined,
            accent: const Color(0xFFFFB277),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (supportCase.nextAction != null)
                  Text(
                    supportCase.nextAction!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      height: 1.45,
                    ),
                  ),
                if (supportCase.userActionDueDisplay != null) ...[
                  const SizedBox(height: 10),
                  _SupportMetaLine(
                    icon: Icons.event_busy_outlined,
                    text: 'Antwort bis: ${supportCase.userActionDueDisplay}',
                  ),
                ],
                if (supportCase.nextUpdateDisplay != null) ...[
                  const SizedBox(height: 10),
                  _SupportMetaLine(
                    icon: Icons.schedule_outlined,
                    text: 'Nächstes Update: ${supportCase.nextUpdateDisplay}',
                  ),
                ],
              ],
            ),
          ),
        ] else if (!supportCase.isFinal &&
            (supportCase.nextAction != null ||
                supportCase.nextUpdateDisplay != null)) ...[
          const SizedBox(height: 12),
          _SupportInfoCard(
            title: 'Wie es weitergeht',
            icon: Icons.arrow_forward_outlined,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (supportCase.nextAction != null)
                  Text(
                    supportCase.nextAction!,
                    style: const TextStyle(color: Colors.white70, height: 1.5),
                  ),
                if (supportCase.nextUpdateDisplay != null) ...[
                  const SizedBox(height: 10),
                  _SupportMetaLine(
                    icon: Icons.schedule_outlined,
                    text: 'Nächstes Update: ${supportCase.nextUpdateDisplay}',
                  ),
                ],
              ],
            ),
          ),
        ],
        if (supportCase.closureReason != null) ...[
          const SizedBox(height: 12),
          _SupportInfoCard(
            title: 'Abschluss',
            icon: Icons.task_alt_outlined,
            child: Text(
              _closureReasonLabels[supportCase.closureReason] ??
                  'Der Fall wurde abgeschlossen.',
              style: const TextStyle(color: Colors.white70, height: 1.5),
            ),
          ),
        ],
        if (detail.finalDecision != null) ...[
          const SizedBox(height: 12),
          _SupportInfoCard(
            key: const ValueKey('support_final_decision'),
            title: 'Finale Entscheidung',
            icon: Icons.gavel_outlined,
            child: _SupportFinalDecisionCard(
              finalDecision: detail.finalDecision!,
            ),
          ),
        ],
        if (supportCase.appealState != 'not_applicable') ...[
          const SizedBox(height: 12),
          _SupportAppealCard(
            principal: principal,
            supportCase: supportCase,
            appeal: detail.appeal,
            submitter: appealSubmitter,
            onSubmitted: onAppealSubmitted,
          ),
        ],
        if (detail.messages.isNotEmpty) ...[
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: const Text(
              'Nachrichten',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
          ),
          const SizedBox(height: 10),
          for (final message in detail.messages) ...[
            _SupportInfoCard(
              key: ValueKey('support_message_${message.id}'),
              title: message.correctedMessageId == null
                  ? message.title
                  : 'Korrektur: ${message.title}',
              icon: message.correctedMessageId == null
                  ? Icons.mark_email_read_outlined
                  : Icons.edit_note_outlined,
              child: Text(
                message.content,
                style: const TextStyle(color: Colors.white70, height: 1.5),
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
        const SizedBox(height: 12),
        const _SupportInfoCard(
          title: 'Testmodus',
          icon: Icons.science_outlined,
          child: Text(
            'Dieser Fall läuft intern im Testmodus. Es wird dadurch keine externe Nachricht, Zahlung oder Anbieteraktion ausgelöst.',
            style: TextStyle(color: Colors.white70, height: 1.5),
          ),
        ),
        if (detail.events.isNotEmpty) ...[
          const SizedBox(height: 20),
          Semantics(
            header: true,
            child: const Text(
              'Verlauf',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
          ),
          const SizedBox(height: 10),
          for (final event in detail.events)
            _SupportTimelineEntry(label: event.label),
        ],
      ],
    );
  }
}

class _SupportDsaLocatorCard extends StatefulWidget {
  final SupportPrincipalController principal;
  final SupportCaseViewData supportCase;
  final SupportDsaLocatorSubmitter? submitter;
  final VoidCallback onSubmitted;

  const _SupportDsaLocatorCard({
    required this.principal,
    required this.supportCase,
    required this.submitter,
    required this.onSubmitted,
  });

  @override
  State<_SupportDsaLocatorCard> createState() => _SupportDsaLocatorCardState();
}

class _SupportDsaLocatorCardState extends State<_SupportDsaLocatorCard> {
  final TextEditingController _locator = TextEditingController();
  late final String _idempotencyKey;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _idempotencyKey =
        'support_dsa_locator_${widget.supportCase.id}_${widget.supportCase.version}_${DateTime.now().microsecondsSinceEpoch}';
  }

  @override
  void dispose() {
    _locator.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final owner = widget.principal.capture();
    final locator = _locator.text.trim();
    if (owner == null ||
        _submitting ||
        locator.length < 3 ||
        locator.length > 2000) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final submitter = widget.submitter ??
        (caseId, value, version, key) =>
            BackendRepository.completeSupportDsaNoticeLocator(
              owner: owner,
              caseId: caseId,
              contentLocator: value,
              expectedVersion: version,
              idempotencyKey: key,
            );
    try {
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      await submitter(
        widget.supportCase.id,
        locator,
        widget.supportCase.version,
        _idempotencyKey,
      );
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      widget.onSubmitted();
    } catch (_) {
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      setState(() {
        _error = 'Der Fundort konnte nicht sicher bestätigt werden. Nutze '
            'eine vollständige http(s)-URL oder eine passende Referenz.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SupportInfoCard(
      key: const ValueKey('support_dsa_locator_follow_up'),
      title: 'Exakten Fundort ergänzen',
      icon: Icons.add_location_alt_outlined,
      accent: const Color(0xFFFFB277),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.supportCase.dsaNoticeLocatorPrompt!,
            style: const TextStyle(color: Colors.white70, height: 1.5),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('support_dsa_locator_input'),
            controller: _locator,
            maxLength: 2000,
            maxLines: 3,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'URL oder exakte Inhaltsreferenz',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: Color(0xFFFFB4AB), height: 1.4),
            ),
          ],
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const ValueKey('support_dsa_locator_submit'),
            onPressed:
                _submitting || _locator.text.trim().length < 3 ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check_circle_outline),
            label: const Text('Fundort sicher ergänzen'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Der Nachtrag ergänzt nur die Fundstelle. Er entscheidet nicht '
            'über Rechtswidrigkeit und entfernt keinen Inhalt automatisch.',
            style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _SupportAppealCard extends StatefulWidget {
  final SupportPrincipalController principal;
  final SupportCaseViewData supportCase;
  final SupportAppealViewData? appeal;
  final SupportAppealSubmitter? submitter;
  final VoidCallback onSubmitted;

  const _SupportAppealCard({
    required this.principal,
    required this.supportCase,
    required this.appeal,
    required this.submitter,
    required this.onSubmitted,
  });

  @override
  State<_SupportAppealCard> createState() => _SupportAppealCardState();
}

class _SupportAppealCardState extends State<_SupportAppealCard> {
  final TextEditingController _grounds = TextEditingController();
  late final String _idempotencyKey;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _idempotencyKey =
        'support_appeal_${widget.supportCase.id}_${widget.supportCase.version}_${DateTime.now().microsecondsSinceEpoch}';
  }

  @override
  void dispose() {
    _grounds.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final owner = widget.principal.capture();
    final grounds = _grounds.text.trim();
    if (owner == null ||
        _submitting ||
        grounds.length < 3 ||
        grounds.length > 8000) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final submitter = widget.submitter ??
        (caseId, reason, version, key) => BackendRepository.submitSupportAppeal(
              owner: owner,
              caseId: caseId,
              grounds: reason,
              expectedVersion: version,
              idempotencyKey: key,
            );
    try {
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      await submitter(
        widget.supportCase.id,
        grounds,
        widget.supportCase.version,
        _idempotencyKey,
      );
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      widget.onSubmitted();
    } catch (_) {
      if (!await widget.principal.isCurrent(owner) || !mounted) return;
      setState(() {
        _error =
            'Der Antrag konnte nicht sicher bestätigt werden. Bitte erneut versuchen.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final supportCase = widget.supportCase;
    final appeal = widget.appeal;
    if (supportCase.appealState == 'submitted') {
      return _SupportInfoCard(
        key: const ValueKey('support_appeal_receipt'),
        title: 'Überprüfungsantrag',
        icon: Icons.fact_check_outlined,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Eingegangen: ${appeal!.reviewNumber}',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Zum ursprünglichen Fall: ${appeal.originalCaseNumber}',
              style: const TextStyle(color: Colors.white70, height: 1.45),
            ),
            const SizedBox(height: 8),
            Text(
              appeal.materialSummary,
              style: const TextStyle(color: Colors.white70, height: 1.45),
            ),
            const SizedBox(height: 8),
            Text(
              appeal.interimEffect,
              style: const TextStyle(color: Colors.white70, height: 1.45),
            ),
            const SizedBox(height: 10),
            _SupportMetaLine(
              icon: Icons.schedule_outlined,
              text: 'Nächstes Update: ${appeal.nextUpdateDisplay}',
            ),
          ],
        ),
      );
    }
    if (supportCase.appealState == 'expired') {
      return _SupportInfoCard(
        title: 'Elektronische Überprüfung',
        icon: Icons.event_busy_outlined,
        child: Text(
          'Die bestätigte Einreichungsfrist (${supportCase.appealDeadlineDisplay}) ist abgelaufen. Maßgeblich bleibt die in der finalen Entscheidung genannte Überprüfungsroute.',
          style: const TextStyle(color: Colors.white70, height: 1.5),
        ),
      );
    }
    if (supportCase.appealState == 'unavailable') {
      return const _SupportInfoCard(
        title: 'Elektronische Überprüfung',
        icon: Icons.info_outline,
        child: Text(
          'Für diesen Fall ist kein elektronischer Antrag in der App freigegeben. Maßgeblich bleibt die in der finalen Entscheidung genannte Überprüfungsroute.',
          style: TextStyle(color: Colors.white70, height: 1.5),
        ),
      );
    }
    if (!supportCase.appealAvailable) {
      return _SupportInfoCard(
        title: 'Überprüfung möglich',
        icon: Icons.rate_review_outlined,
        child: Text(
          'Die Einreichung ist bis ${supportCase.appealDeadlineDisplay} für die Person möglich, die diesen Support-Fall eröffnet hat.',
          style: const TextStyle(color: Colors.white70, height: 1.5),
        ),
      );
    }
    return _SupportInfoCard(
      key: const ValueKey('support_appeal_form'),
      title: 'Überprüfung beantragen',
      icon: Icons.rate_review_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Einreichung möglich bis: ${supportCase.appealDeadlineDisplay}',
            style: const TextStyle(color: Colors.white70, height: 1.5),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('support_appeal_grounds'),
            controller: _grounds,
            enabled: !_submitting,
            minLines: 4,
            maxLines: 8,
            maxLength: 8000,
            onChanged: (_) => setState(() {}),
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Warum soll die Entscheidung überprüft werden?',
              labelStyle: const TextStyle(color: Colors.white70),
              helperText:
                  'Noch keine Datei anhängen; dieser Schritt speichert nur deine Begründung.',
              helperStyle: const TextStyle(color: Colors.white60),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: Color(0xFFFFB4AB), height: 1.4),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: const ValueKey('support_appeal_submit'),
              onPressed: !_submitting && _grounds.text.trim().length >= 3
                  ? _submit
                  : null,
              icon: _submitting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(
                _submitting ? 'Wird sicher bestätigt …' : 'Antrag einreichen',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SupportFinalDecisionCard extends StatelessWidget {
  final SupportFinalDecisionViewData finalDecision;

  const _SupportFinalDecisionCard({required this.finalDecision});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SupportDecisionSection(
          label: 'Entscheidung',
          value: finalDecision.decision,
        ),
        _SupportDecisionSection(
          label: 'Auswirkung',
          value: finalDecision.effect,
        ),
        _SupportDecisionSection(
          label: 'Begründung',
          value: finalDecision.reason,
        ),
        _SupportDecisionSection(
          label: 'Umsetzung',
          value: finalDecision.implementationResult,
        ),
        _SupportDecisionSection(
          label: 'Überprüfung',
          value: finalDecision.redressRoute,
        ),
        _SupportMetaLine(
          icon: Icons.verified_outlined,
          text: 'Umgesetzt am: ${finalDecision.implementedDisplay}',
        ),
      ],
    );
  }
}

class _SupportDecisionSection extends StatelessWidget {
  final String label;
  final String value;

  const _SupportDecisionSection({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(color: Colors.white70, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _SupportStatusChip extends StatelessWidget {
  final SupportCaseViewData supportCase;

  const _SupportStatusChip({required this.supportCase});

  @override
  Widget build(BuildContext context) {
    final color = supportCase.waitsForUser
        ? const Color(0xFFFFB277)
        : (supportCase.isFinal
            ? const Color(0xFF8BE0B2)
            : const Color(0xFF8FCBFF));
    final icon = supportCase.waitsForUser
        ? Icons.reply_outlined
        : (supportCase.isFinal
            ? Icons.task_alt_outlined
            : Icons.pending_actions_outlined);
    return Semantics(
      container: true,
      excludeSemantics: true,
      label: 'Status: ${supportCase.statusLabel}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 17, color: color),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                supportCase.statusLabel,
                style: TextStyle(color: color, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SupportInfoCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;
  final Color accent;

  const _SupportInfoCard({
    super.key,
    required this.title,
    required this.icon,
    required this.child,
    this.accent = const Color(0xFF8FCBFF),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: Icon(icon, size: 20, color: accent)),
              const SizedBox(width: 9),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _SupportMetaLine extends StatelessWidget {
  final IconData icon;
  final String text;

  const _SupportMetaLine({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(child: Icon(icon, size: 18, color: Colors.white60)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: Colors.white70, height: 1.4),
          ),
        ),
      ],
    );
  }
}

class _SupportTimelineEntry extends StatelessWidget {
  final String label;

  const _SupportTimelineEntry({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: ExcludeSemantics(
              child: Icon(Icons.circle, size: 10, color: Color(0xFF8FCBFF)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: Colors.white70, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

class _SupportLoadError extends StatelessWidget {
  final VoidCallback onRetry;

  const _SupportLoadError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 44, color: Colors.white70),
            const SizedBox(height: 14),
            const Text(
              'Support-Fälle konnten nicht sicher geladen werden.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Es werden keine unvollständigen oder lokal erfundenen Falldaten angezeigt.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, height: 1.45),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Erneut versuchen'),
            ),
          ],
        ),
      ),
    );
  }
}
