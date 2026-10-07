// Isolated test view. Deliberately has no product entry point or default data.
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';

const p7V2SyntheticDisclosure =
    'Synthetischer Test – keine authentischen Fotos, '
    'keine vertragliche oder finanzielle Wirkung. Keine echte Miete. D1–D4 offen.';
const _slots = ['overview', 'detail', 'accessories', 'critical'];
const _axes = [
  'availability',
  'fit',
  'supplyRelease',
  'acceptance',
  'contract',
  'payment',
  'pickup',
  'return',
  'refund',
  'payout',
  'dispute'
];

void _check(bool value) {
  if (!value) throw const FormatException('p7_synthetic_display_rejected');
}

Map<String, dynamic> _map(dynamic value) {
  _check(value is Map<String, dynamic>);
  return value as Map<String, dynamic>;
}

List<dynamic> _list(dynamic value) {
  _check(value is List);
  return value as List<dynamic>;
}

void _keys(Map<String, dynamic> value, List<String> keys) =>
    _check(value.length == keys.length && keys.every(value.containsKey));
bool _hash(dynamic v) => v is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(v);
dynamic _canonical(dynamic v) {
  if (v is List) return v.map(_canonical).toList();
  if (v is Map<String, dynamic>) {
    final keys = v.keys.toList()..sort();
    return {for (final key in keys) key: _canonical(v[key])};
  }
  return v;
}

String p7V2DisplayDigest(dynamic value) =>
    sha256.convert(utf8.encode(jsonEncode(_canonical(value)))).toString();

class P7V2DisplayEnvelope {
  P7V2DisplayEnvelope._(this._json);
  // Serialization keeps every caller-owned collection out of the view state.
  final String _json;
  Map<String, dynamic> get value => jsonDecode(_json) as Map<String, dynamic>;

  static P7V2DisplayEnvelope parse(
      {required dynamic raw,
      required String expectedDigest,
      required String expectedPrincipal}) {
    final wrapper = _map(raw);
    _keys(wrapper, ['envelope', 'digest']);
    final e = _map(wrapper['envelope']);
    _check(_hash(expectedDigest) && wrapper['digest'] == expectedDigest);
    _keys(e, [
      'version',
      'namespace',
      'synthetic',
      'authentic',
      'bindingStatus',
      'projection',
      'projectionDigest',
      'details'
    ]);
    _check(e['version'] == 'P7-A2-display-v2-2026-10-03.1' &&
        e['synthetic'] == true &&
        e['authentic'] == false &&
        e['bindingStatus'] == 'non_binding');
    final namespace = e['namespace'];
    _check(namespace is String &&
        RegExp(r'^p7v2-synthetic-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(namespace));
    bool typedId(dynamic id, String kind) =>
        id is String &&
        id.startsWith('$namespace:$kind:') &&
        RegExp(r'^[1-9][0-9]{0,8}$')
            .hasMatch(id.substring('$namespace:$kind:'.length));
    bool principal(dynamic id) => typedId(id, 'principal');
    final p = _map(e['projection']);
    _keys(p, [
      'version',
      'missionNeedId',
      'missionOwnerId',
      'missionRevision',
      'missionPayloadDigest',
      'resolutionId',
      'resolutionRevision',
      'resolutionDigest',
      'fitSourceSnapshotDigest',
      'observedAt',
      'synthetic',
      'bindingStatus',
      'status',
      'components',
      'replayClaim',
      'persisted',
      'context'
    ]);
    _check(p['version'] == 'P7-A1-synthetic-v2-2026-10-03.1' &&
        p['synthetic'] == true &&
        p['bindingStatus'] == 'non_binding' &&
        p['persisted'] == false &&
        p['replayClaim'] == 'none' &&
        principal(p['missionOwnerId']) &&
        p['missionOwnerId'] == expectedPrincipal);
    final context = _map(p['context']);
    _keys(context, ['version', 'namespace', 'synthetic', 'authentic']);
    _check(context['version'] == 'P7-synthetic-context-v2' &&
        context['namespace'] == namespace &&
        context['synthetic'] == true &&
        context['authentic'] == false);
    for (final key in [
      'missionPayloadDigest',
      'resolutionDigest',
      'fitSourceSnapshotDigest'
    ]) {
      _check(_hash(p[key]));
    }
    for (final key in ['missionRevision', 'resolutionRevision']) {
      _check(p[key] is int && p[key] > 0);
    }
    _check(typedId(p['missionNeedId'], 'mission') &&
        typedId(p['resolutionId'], 'resolution') &&
        p['observedAt'] is String &&
        DateTime.tryParse(p['observedAt'])?.toUtc().toIso8601String() ==
            p['observedAt']);
    const statuses = ['incomplete', 'readback_required', 'needs_clarification'];
    _check(statuses.contains(p['status']));
    final components = _list(p['components']);
    final details = _list(e['details']);
    _check(components.length == 2 && details.length == 2);
    final owners = <String>{};
    final itemIds = <String>{};
    final slotKeys = <String>{};
    final identities = <String>{};
    void identity(dynamic id, String kind) {
      _check(typedId(id, kind) && identities.add(id as String));
    }

    const axisValues = <String, List<String>>{
      'availability': ['unknown', 'observed_available'],
      'fit': ['unknown', 'fit'],
      'supplyRelease': [
        'not_bound',
        'pending',
        'released',
        'revoked',
        'rejected',
        'expired',
        'expired_no_response'
      ],
      'acceptance': ['not_bound', 'accepted', 'rejected', 'timeout'],
      'contract': ['not_bound', 'bound'],
      'payment': ['unknown', 'paid', 'pending', 'failed'],
      'pickup': ['unknown', 'evidenced', 'needs_clarification'],
      'return': ['unknown', 'evidenced', 'needs_clarification'],
      'refund': ['unknown', 'none', 'pending', 'refunded'],
      'payout': ['unknown', 'held', 'pending', 'paid'],
      'dispute': ['unknown', 'none', 'open', 'resolved'],
    };
    for (var i = 0; i < 2; i++) {
      final c = _map(components[i]);
      final d = _map(details[i]);
      _keys(c, [
        'slotKey',
        'needKey',
        'necessity',
        'ordinal',
        'itemId',
        'itemType',
        'ownerId',
        'bindingStatus',
        'sourceDigest',
        'axes',
        if (c.containsKey('lifecycleDigest')) 'lifecycleDigest',
        'status'
      ]);
      _check(['required', 'optional'].contains(c['necessity']) &&
          c['ordinal'] is int &&
          c['ordinal'] > 0 &&
          c['needKey'] is String &&
          RegExp(r'^synthetic_need_[1-9][0-9]{0,2}$').hasMatch(c['needKey']) &&
          c['slotKey'] == '${c['necessity']}:${c['needKey']}:${c['ordinal']}' &&
          slotKeys.add(c['slotKey']) &&
          principal(c['ownerId']) &&
          owners.add(c['ownerId']) &&
          ['listing', 'private_shelf'].contains(c['itemType']) &&
          typedId(
              c['itemId'], c['itemType'] == 'listing' ? 'listing' : 'shelf') &&
          itemIds.add(c['itemId']) &&
          c['bindingStatus'] == 'non_binding' &&
          statuses.contains(c['status']));
      final axes = _map(c['axes']);
      _keys(axes, _axes);
      for (final key in _axes) {
        _check(axisValues[key]!.contains(axes[key]));
      }
      _check(axes['fit'] == 'unknown');
      _check(c['status'] ==
          (axes.values.contains('needs_clarification')
              ? 'needs_clarification'
              : axes['acceptance'] == 'timeout'
                  ? 'readback_required'
                  : 'incomplete'));
      _keys(d, [
        'slotKey',
        'sourceDigest',
        'lifecycleDigest',
        'bookingBindingDigest',
        'returnState',
        'returnCaseStatus',
        'pickup',
        'return'
      ]);
      _check(d['slotKey'] == c['slotKey'] &&
          d['sourceDigest'] == c['sourceDigest'] &&
          d['lifecycleDigest'] == c['lifecycleDigest']);
      _check(_hash(d['sourceDigest']));
      _check(c.containsKey('lifecycleDigest')
          ? _hash(d['lifecycleDigest']) && _hash(d['bookingBindingDigest'])
          : d['lifecycleDigest'] == null && d['bookingBindingDigest'] == null);
      _check([
        null,
        'not_started',
        'awaitingReturnConfirmation',
        'reportWindowOpen',
        'needsReview',
        'payoutEligible',
        'closed'
      ].contains(d['returnState']));
      _check([
        null,
        'submitted',
        'needsReview',
        'awaitingResponse',
        'unresolved',
        'closed'
      ].contains(d['returnCaseStatus']));
      if (!c.containsKey('lifecycleDigest')) {
        _check(d['returnState'] == null && d['returnCaseStatus'] == null);
      }
      final openCase = ['needsReview', 'awaitingResponse', 'unresolved']
          .contains(d['returnCaseStatus']);
      _check((axes['dispute'] == 'open') == openCase);
      for (final name in ['pickup', 'return']) {
        final s = _map(d[name]);
        _keys(s, [
          'segment',
          'presenterId',
          'verifierId',
          'evidenceSetDigest',
          'slots',
          'confirmation',
          'verification'
        ]);
        final presenter = name == 'pickup' ? c['ownerId'] : p['missionOwnerId'];
        final verifier = name == 'pickup' ? p['missionOwnerId'] : c['ownerId'];
        _check(s['segment'] == name &&
            s['presenterId'] == presenter &&
            s['verifierId'] == verifier);
        final photos = _list(s['slots']);
        _check(photos.length == 4);
        var count = 0;
        for (var j = 0; j < 4; j++) {
          final photo = _map(photos[j]);
          _keys(photo,
              ['slot', 'present', 'evidenceId', 'uploadId', 'uploadSha256']);
          _check(photo['slot'] == _slots[j] && photo['present'] is bool);
          if (photo['present'] == true) {
            count++;
            identity(photo['evidenceId'], 'evidence');
            identity(photo['uploadId'], 'upload');
            _check(_hash(photo['uploadSha256']));
          } else {
            _check(photo['evidenceId'] == null &&
                photo['uploadId'] == null &&
                photo['uploadSha256'] == null);
          }
        }
        _check((count == 0 && s['evidenceSetDigest'] == null) ||
            _hash(s['evidenceSetDigest']));
        if (axes['acceptance'] != 'accepted' ||
            !c.containsKey('lifecycleDigest')) {
          _check(count == 0 &&
              s['confirmation'] == null &&
              s['verification'] == null &&
              axes['contract'] == 'not_bound' &&
              axes['payment'] == 'unknown' &&
              axes['refund'] == 'unknown' &&
              axes['payout'] == 'unknown');
        }
        if (name == 'return' && count > 0) {
          _check(axes['pickup'] == 'evidenced');
        }
        if (s['confirmation'] != null) {
          final confirmation = _map(s['confirmation']);
          _keys(confirmation, ['decision', 'actorId', 'evidenceSetDigest']);
          _check(count == 4 &&
              confirmation['actorId'] == verifier &&
              confirmation['evidenceSetDigest'] == s['evidenceSetDigest'] &&
              ['confirmed', 'deviation'].contains(confirmation['decision']));
        }
        if (s['verification'] != null) {
          final verification = _map(s['verification']);
          _keys(verification, [
            'method',
            'presenterId',
            'verifierId',
            'evidenceSetDigest',
            'codeLength',
            'digitsOnly'
          ]);
          _check(count == 4 &&
              s['confirmation'] != null &&
              verification['presenterId'] == presenter &&
              verification['verifierId'] == verifier &&
              verification['evidenceSetDigest'] == s['evidenceSetDigest']);
          _check((verification['method'] == 'qr_v3' &&
                  verification['codeLength'] == null &&
                  verification['digitsOnly'] == null) ||
              (verification['method'] == 'six_digit_fallback' &&
                  verification['codeLength'] == 6 &&
                  verification['digitsOnly'] == true));
        }
        final evidenceStatus =
            count == 4 && s['confirmation'] != null && s['verification'] != null
                ? (_map(s['confirmation'])['decision'] == 'confirmed'
                    ? 'evidenced'
                    : 'needs_clarification')
                : 'unknown';
        // Same ReturnCase overlay as V2; never infer evidence from that overlay.
        final returnClarification =
            openCase || ((d['returnState'] == 'needsReview') != openCase);
        _check(axes[name] ==
            (name == 'return' && returnClarification
                ? 'needs_clarification'
                : evidenceStatus));
      }
    }
    final clarification =
        components.any((c) => c['status'] == 'needs_clarification');
    final readback = components.any((c) =>
        c['necessity'] == 'required' && c['status'] == 'readback_required');
    _check(p['status'] ==
        (clarification
            ? 'needs_clarification'
            : readback
                ? 'readback_required'
                : 'incomplete'));
    // Hash only the completely allowlisted display bytes, never rejected extras.
    _check(e['projectionDigest'] == p7V2DisplayDigest(p) &&
        p7V2DisplayDigest(e) == expectedDigest);
    return P7V2DisplayEnvelope._(jsonEncode(e));
  }
}

abstract final class P7V2WebPreviewHarness {
  static P7V2WebPreview open(
      {required Object? flag,
      required dynamic raw,
      required String expectedDigest,
      required String expectedPrincipal}) {
    _check(flag is bool && flag);
    return P7V2WebPreview._(P7V2DisplayEnvelope.parse(
        raw: raw,
        expectedDigest: expectedDigest,
        expectedPrincipal: expectedPrincipal));
  }
}

class P7V2WebPreview extends StatefulWidget {
  const P7V2WebPreview({super.key}) : _envelope = null;
  const P7V2WebPreview._(this._envelope);
  final P7V2DisplayEnvelope? _envelope;
  @override
  State<P7V2WebPreview> createState() => _P7V2WebPreviewState();
}

class _P7V2WebPreviewState extends State<P7V2WebPreview> {
  int? _expanded;
  final _scroll = ScrollController();
  final _resetFocus = FocusNode(debugLabel: 'p7-reset');
  @override
  void didUpdateWidget(P7V2WebPreview oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget._envelope != widget._envelope) {
      _expanded = null;
      _resetFocus.unfocus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _scroll.hasClients) _scroll.jumpTo(0);
      });
    }
  }

  @override
  void dispose() {
    _expanded = null;
    _scroll.dispose();
    _resetFocus.dispose();
    super.dispose();
  }

  void _reset() {
    setState(() => _expanded = null);
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _resetFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    if (widget._envelope == null) {
      return const Scaffold(
          body: Center(
              child: Text('Synthetische Testansicht nicht freigegeben')));
    }
    final e = widget._envelope!.value;
    final p = _map(e['projection']);
    final components = _list(p['components']);
    final details = _list(e['details']);
    return Scaffold(
      appBar: AppBar(title: const Text('Mission-Test')),
      body: SafeArea(
          child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 960),
            child: Column(children: [
              Semantics(
                  container: true,
                  liveRegion: true,
                  child: Container(
                      key: const ValueKey('p7-disclosure'),
                      width: double.infinity,
                      color:
                          Theme.of(context).colorScheme.surfaceContainerHighest,
                      padding: const EdgeInsets.all(12),
                      child: const Text(p7V2SyntheticDisclosure))),
              Expanded(
                  child: ListView(
                      controller: _scroll,
                      padding: const EdgeInsets.all(16),
                      children: [
                    Text('Mission: ${_status(p['status'])}',
                        key: const ValueKey('p7-status'),
                        style: Theme.of(context).textTheme.titleLarge),
                    const Text(
                        'Alle folgenden Zustände sind erfundene Testbelege. Passung unbekannt; keine vollständige Mission.'),
                    const Text(
                        'Kein PG-Readback, keine persistierte Replay- oder Parallelitätsgarantie. Keine automatische Wiederholung.'),
                    Text(
                        'Synthetischer Beobachtungszeitpunkt: ${p['observedAt']}'),
                    OutlinedButton(
                        key: const ValueKey('p7-reset'),
                        focusNode: _resetFocus,
                        onPressed: _reset,
                        child: const Text('Testansicht zurücksetzen')),
                    for (var i = 0; i < components.length; i++) ...[
                      const SizedBox(height: 12),
                      Card(
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                        'Position ${i + 1} · Synthetischer Eigentümer ${i + 1}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium),
                                    Text(
                                        components[i]['necessity'] == 'required'
                                            ? 'Pflichtkomponente'
                                            : 'Optionale Komponente'),
                                    for (final axis in _axes)
                                      Text(
                                          '${_axisLabels[axis]}: ${_status(components[i]['axes'][axis])}',
                                          key: ValueKey('p7-axis-$i-$axis')),
                                    if (_returnReason(_map(details[i])) != null)
                                      Text(_returnReason(_map(details[i]))!,
                                          key: ValueKey('p7-return-reason-$i')),
                                    TextButton(
                                        key: ValueKey('p7-evidence-$i'),
                                        onPressed: () => setState(() =>
                                            _expanded =
                                                _expanded == i ? null : i),
                                        child: Text(_expanded == i
                                            ? 'Belegdetails schließen'
                                            : 'Synthetische Belegdetails öffnen')),
                                    if (_expanded == i)
                                      for (final segment in [
                                        'pickup',
                                        'return'
                                      ])
                                        _segmentView(_map(details[i][segment]),
                                            i, segment),
                                  ]))),
                    ],
                  ])),
            ])),
      )),
    );
  }

  Widget _segmentView(Map<String, dynamic> s, int index, String segment) {
    final photos = _list(s['slots']);
    final count = photos.where((p) => p['present'] == true).length;
    final verification = s['verification'];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 12),
      Text(
          '${segment == 'pickup' ? 'Übergabe' : 'Rückgabe'}: $count/4 synthetische Foto-Slots',
          key: ValueKey('p7-count-$index-$segment')),
      for (final photo in photos)
        Text(
            '${_slotLabels[photo['slot']]}: ${photo['present'] == true ? 'synthetisch belegt' : 'fehlt'}',
            key: ValueKey('p7-slot-$index-$segment-${photo['slot']}')),
      Text(verification == null
          ? 'Verifizierung: unbekannt'
          : verification['method'] == 'qr_v3'
              ? 'QR-v3: synthetischer Verifizierungsbeleg'
              : 'Fallback: exakt 6 Ziffern, synthetischer Verifizierungsbeleg'),
      const Text(
          'Keine echten Bilder, kein Kamera-Scan, kein nutzbarer Bestätigungscode.'),
    ]);
  }
}

String? _returnReason(Map<String, dynamic> detail) {
  final open = ['needsReview', 'awaitingResponse', 'unresolved']
      .contains(detail['returnCaseStatus']);
  if ((detail['returnState'] == 'needsReview') != open) {
    return 'Rückgabe-Klärungsgrund (synthetisch): widersprüchlicher Rückgabe-/Prüffallstatus.';
  }
  if (open) {
    return 'Rückgabe-Klärungsgrund (synthetisch): offener Rückgabe-Prüffall.';
  }
  return null;
}

const _axisLabels = {
  'availability': 'Verfügbarkeit',
  'fit': 'Passung',
  'supplyRelease': 'Freigabe',
  'acceptance': 'Annahme',
  'contract': 'Vertrag',
  'payment': 'Zahlung',
  'pickup': 'Übergabe',
  'return': 'Rückgabe',
  'refund': 'Erstattung',
  'payout': 'Auszahlung',
  'dispute': 'Klärungsfall'
};
const _slotLabels = {
  'overview': 'Übersicht',
  'detail': 'Detail',
  'accessories': 'Zubehör',
  'critical': 'Kritischer Bereich'
};
String _status(dynamic value) =>
    const {
      'incomplete': 'unvollständig',
      'readback_required': 'Ergebnis muss geprüft werden',
      'needs_clarification': 'Klärung erforderlich',
      'unknown': 'unbekannt',
      'not_bound': 'nicht gebunden',
      'observed_available': 'beobachtet verfügbar',
      'accepted': 'synthetisch angenommen',
      'rejected': 'abgelehnt',
      'timeout': 'Zeitüberschreitung',
      'bound': 'synthetischer Vertragsbeleg',
      'paid': 'synthetischer Zahlungsbeleg',
      'evidenced': 'synthetisch belegt',
      'none': 'kein Ereignis belegt',
      'held': 'zurückgehalten',
      'pending': 'ausstehend',
      'open': 'offen',
      'resolved': 'geklärt',
      'failed': 'fehlgeschlagen',
      'refunded': 'synthetisch erstattet',
      'released': 'freigegeben',
      'revoked': 'widerrufen',
      'expired': 'abgelaufen',
      'expired_no_response': 'ohne Antwort abgelaufen',
      'fit': 'begrenzt passend'
    }[value] ??
    'unbekannt';
