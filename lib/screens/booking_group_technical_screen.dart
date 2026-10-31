import 'package:flutter/foundation.dart' show kReleaseMode, visibleForTesting;
import 'package:flutter/material.dart';

import '../config/booking_group_technical_config.dart';
import '../models/booking_group.dart';
import '../services/booking_group_gateway.dart';

class BookingGroupTechnicalScreen extends StatefulWidget {
  final RentalCartGroupCandidate candidate;
  final BookingGroupGateway gateway;

  @visibleForTesting
  final bool enableForTesting;

  const BookingGroupTechnicalScreen({
    super.key,
    required this.candidate,
    this.gateway = const BackendBookingGroupGateway(),
    this.enableForTesting = false,
  });

  @override
  State<BookingGroupTechnicalScreen> createState() =>
      _BookingGroupTechnicalScreenState();
}

class _BookingGroupTechnicalScreenState
    extends State<BookingGroupTechnicalScreen> {
  BookingGroupSnapshot? _snapshot;
  BookingGroupHandover? _handover;
  bool _busy = false;
  bool _exactConsent = false;
  String? _error;

  bool get _available =>
      BookingGroupTechnicalConfig.available ||
      (!kReleaseMode && widget.enableForTesting);

  Future<void> _request() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final snapshot = await widget.gateway.requestGroup(widget.candidate);
      if (!mounted) return;
      setState(() => _snapshot = snapshot);
      await _loadHandoverIfApplicable(snapshot);
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Die technische Gruppenprüfung ist fehlgeschlagen. Es wurde keine Buchung oder Zahlung erstellt.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() async {
    final current = _snapshot;
    if (current == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _exactConsent = false;
    });
    try {
      final snapshot = await widget.gateway.loadGroup(current.id);
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _handover = null;
      });
      await _loadHandoverIfApplicable(snapshot);
    } catch (_) {
      if (mounted) {
        setState(
            () => _error = 'Der Gruppenstand konnte nicht geladen werden.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _acceptCounteroffer() async {
    final current = _snapshot;
    if (_busy || !_exactConsent || current == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final snapshot = await widget.gateway.acceptCounteroffer(current);
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _exactConsent = false;
      });
      await _loadHandoverIfApplicable(snapshot);
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Die Zustimmung wurde nicht bestätigt. Bitte lade den aktuellen Stand erneut.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadHandoverIfApplicable(
    BookingGroupSnapshot snapshot,
  ) async {
    if (!const <String>{'owner_accepted', 'counteroffer_accepted'}
        .contains(snapshot.state)) {
      return;
    }
    try {
      final handover = await widget.gateway.loadHandover(snapshot.id);
      if (mounted) setState(() => _handover = handover);
    } catch (_) {
      // Item bookings/contracts may not yet be materialized. The quote remains
      // useful and no failed projection may be interpreted as an appointment.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_available) {
      return Scaffold(
        appBar: AppBar(title: const Text('Mehrfachanfrage')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Mehrfachanfragen sind noch nicht freigegeben.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    final snapshot = _snapshot;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mehrfachanfrage – Technikvorschau'),
        actions: [
          if (snapshot != null)
            IconButton(
              tooltip: 'Aktuellen Gruppenstand laden',
              onPressed: _busy ? null : _refresh,
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const _TechnicalBoundaryNotice(),
          const SizedBox(height: 12),
          _CandidateCard(candidate: widget.candidate),
          if (_error != null) ...[
            const SizedBox(height: 12),
            _ErrorCard(message: _error!),
          ],
          const SizedBox(height: 12),
          if (snapshot == null)
            FilledButton.icon(
              onPressed: _busy ? null : _request,
              icon: _busy
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.rule_folder_outlined),
              label: const Text('Gemeinsame Anfrage technisch prüfen'),
            )
          else ...[
            _QuoteCard(
              snapshot: snapshot,
              listingTitles: _listingTitles(widget.candidate),
            ),
            if (snapshot.requiresCounterofferConsent) ...[
              const SizedBox(height: 12),
              _CounterofferConsentCard(
                snapshot: snapshot,
                value: _exactConsent,
                busy: _busy,
                onChanged: (value) =>
                    setState(() => _exactConsent = value ?? false),
                onAccept: _acceptCounteroffer,
              ),
            ],
            const SizedBox(height: 12),
            _StateBoundaryCard(state: snapshot.state),
            if (_handover != null) ...[
              const SizedBox(height: 12),
              _HandoverCard(
                handover: _handover!,
                listingTitles: _listingTitles(widget.candidate),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _TechnicalBoundaryNotice extends StatelessWidget {
  const _TechnicalBoundaryNotice();

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.tertiaryContainer,
      child: const Padding(
        padding: EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.science_outlined),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Nur technische Vorschau. Keine Reservierung, kein Vertrag und keine Zahlung. Öffentliche Nutzung bleibt gesperrt.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CandidateCard extends StatelessWidget {
  final RentalCartGroupCandidate candidate;

  const _CandidateCard({required this.candidate});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${candidate.items.length} Artikel desselben Vermieters',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text('${_date(candidate.startDate)} – ${_date(candidate.endDate)}'),
            const Divider(height: 24),
            for (final item in candidate.items)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.inventory_2_outlined),
                title: Text(_listingTitle(item.listing, item.listingId)),
                subtitle: const Text('Wird serverseitig neu geprüft'),
              ),
            const Text(
              'Gleicher Ort, Zeitraum und Vermieter werden erst auf dem Server verbindlich auf technische Kompatibilität geprüft.',
            ),
          ],
        ),
      ),
    );
  }
}

class _QuoteCard extends StatelessWidget {
  final BookingGroupSnapshot snapshot;
  final Map<String, String> listingTitles;

  const _QuoteCard({
    required this.snapshot,
    required this.listingTitles,
  });

  @override
  Widget build(BuildContext context) {
    final quote = snapshot.quote;
    final previous = snapshot.previousQuote;
    final isCounteroffer = previous != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    isCounteroffer
                        ? 'Gegenangebot – Revision ${quote.revision}'
                        : 'Gruppenangebot – Revision ${quote.revision}',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                Text(
                  bookingGroupMoney(quote.totalMinor, quote.currency),
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Mietsumme ${bookingGroupMoney(quote.rentalSubtotalMinor, quote.currency)} · Service ${bookingGroupMoney(quote.platformFeeMinor, quote.currency)}',
            ),
            if (isCounteroffer) ...[
              const Divider(height: 24),
              _ComparisonSummary(
                current: quote,
                previous: previous,
                listingTitles: listingTitles,
              ),
            ],
            const Divider(height: 24),
            Text(
              'Artikelaufteilung',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            for (final item in quote.items)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text(listingTitles[item.listingId] ?? item.listingId),
                subtitle: Text(
                  'Miete ${bookingGroupMoney(item.rentalSubtotalMinor, item.currency)} + Service ${bookingGroupMoney(item.platformFeeMinor, item.currency)}',
                ),
                trailing: Text(
                  bookingGroupMoney(item.totalMinor, item.currency),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            const Divider(height: 24),
            Text(
              'Gültig bis ${_dateTime(quote.expiresAt)}. Zustimmung bindet ausschließlich diese Revision und ihren unveränderlichen Angebots-Hash.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _ComparisonSummary extends StatelessWidget {
  final BookingGroupQuote current;
  final BookingGroupQuote previous;
  final Map<String, String> listingTitles;

  const _ComparisonSummary({
    required this.current,
    required this.previous,
    required this.listingTitles,
  });

  @override
  Widget build(BuildContext context) {
    final currentIds = current.items.map((item) => item.listingId).toSet();
    final previousIds = previous.items.map((item) => item.listingId).toSet();
    final removed = previousIds.difference(currentIds).toList(growable: false);
    final added = currentIds.difference(previousIds).toList(growable: false);
    final previousByListing = <String, BookingGroupQuoteItem>{
      for (final item in previous.items) item.listingId: item,
    };
    final changed = current.items
        .where((item) =>
            previousByListing[item.listingId]?.totalMinor != item.totalMinor)
        .where((item) => previousByListing.containsKey(item.listingId))
        .toList(growable: false);
    final delta = current.totalMinor - previous.totalMinor;
    final deltaPrefix = delta > 0 ? '+' : '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Vorher ${bookingGroupMoney(previous.totalMinor, previous.currency)} → jetzt ${bookingGroupMoney(current.totalMinor, current.currency)}',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          'Differenz $deltaPrefix${bookingGroupMoney(delta, current.currency)} · ${removed.length} entfernt · ${added.length} hinzugefügt',
        ),
        for (final listingId in removed)
          Text('Entfernt: ${listingTitles[listingId] ?? listingId}'),
        for (final listingId in added)
          Text('Hinzugefügt: ${listingTitles[listingId] ?? listingId}'),
        for (final item in changed)
          Text(
            'Preis geändert: ${listingTitles[item.listingId] ?? item.listingId} · ${bookingGroupMoney(previousByListing[item.listingId]!.totalMinor, previous.currency)} → ${bookingGroupMoney(item.totalMinor, current.currency)}',
          ),
      ],
    );
  }
}

class _CounterofferConsentCard extends StatelessWidget {
  final BookingGroupSnapshot snapshot;
  final bool value;
  final bool busy;
  final ValueChanged<bool?> onChanged;
  final VoidCallback onAccept;

  const _CounterofferConsentCard({
    required this.snapshot,
    required this.value,
    required this.busy,
    required this.onChanged,
    required this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    final quote = snapshot.quote;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: value,
              onChanged: busy ? null : onChanged,
              title: Text(
                'Ich akzeptiere ausdrücklich Revision ${quote.revision} über ${bookingGroupMoney(quote.totalMinor, quote.currency)}.',
              ),
              subtitle: const Text(
                'Eine frühere Revision oder eine stillschweigende Teilannahme wird nicht akzeptiert.',
              ),
              controlAffinity: ListTileControlAffinity.leading,
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: value && !busy ? onAccept : null,
                child: const Text('Exaktes Gegenangebot akzeptieren'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StateBoundaryCard extends StatelessWidget {
  final String state;

  const _StateBoundaryCard({required this.state});

  @override
  Widget build(BuildContext context) {
    final label = switch (state) {
      'requested' => 'Anfrage wartet auf Entscheidung des Vermieters.',
      'counteroffered' =>
        'Gegenangebot wartet auf deine ausdrückliche Zustimmung.',
      'owner_accepted' => 'Alle Artikel wurden technisch angenommen.',
      'counteroffer_accepted' =>
        'Das exakte Gegenangebot wurde technisch angenommen.',
      'declined' => 'Die komplette Mehrfachanfrage wurde abgelehnt.',
      _ => 'Technischer Gruppenstatus: $state',
    };
    return Card(
      child: ListTile(
        leading: const Icon(Icons.info_outline),
        title: Text(label),
        subtitle: const Text(
          'Artikelverträge, Zahlungen, Storno/Refund und Schäden bleiben getrennt.',
        ),
      ),
    );
  }
}

class _HandoverCard extends StatelessWidget {
  final BookingGroupHandover handover;
  final Map<String, String> listingTitles;

  const _HandoverCard({
    required this.handover,
    required this.listingTitles,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Gemeinsame Übergabe und Rückgabe',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            const Text(
              'Die exakte Adresse bleibt in der jeweiligen Einzelbuchung geschützt.',
            ),
            for (final appointment in handover.sharedAppointments)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                    appointment.type == 'pickup' ? Icons.login : Icons.logout),
                title: Text(appointment.type == 'pickup'
                    ? 'Gemeinsame Übergabe'
                    : 'Gemeinsame Rückgabe'),
                subtitle: Text(
                  '${_dateTime(appointment.scheduledAt)} · ${appointment.timezone}',
                ),
              ),
            const Divider(height: 24),
            Text(
              'Nachweise je Artikel',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
            for (final item in handover.items)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(listingTitles[item.listingId] ?? item.listingId),
                subtitle: Text(item.needsReview
                    ? 'Nur dieser Artikel: Prüfung nötig'
                    : 'Eigenständiger Artikelstatus'),
                leading: Icon(
                  item.needsReview
                      ? Icons.report_problem_outlined
                      : Icons.inventory_2_outlined,
                ),
                children: [
                  _EvidenceChecklist(
                    title: 'Übergabe',
                    segment: item.pickup,
                  ),
                  _EvidenceChecklist(
                    title: 'Rückgabe',
                    segment: item.returnEvidence,
                  ),
                  ListTile(
                    dense: true,
                    title: const Text('Chat und Fristen'),
                    subtitle: Text(_itemOperations(item)),
                  ),
                ],
              ),
            if (handover.systemRiskHold)
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.gpp_bad_outlined),
                title: Text('Gesamte Gruppe wegen Systemrisiko angehalten'),
              ),
          ],
        ),
      ),
    );
  }
}

class _EvidenceChecklist extends StatelessWidget {
  final String title;
  final BookingGroupEvidenceSegment segment;

  const _EvidenceChecklist({required this.title, required this.segment});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final slot in bookingGroupRequiredEvidenceSlots)
                Chip(
                  avatar: Icon(
                    segment.completedPresenterSlots.contains(slot)
                        ? Icons.check_circle_outline
                        : Icons.radio_button_unchecked,
                    size: 16,
                  ),
                  label: Text(_slotLabel(slot)),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(segment.confirmed
              ? 'Gegenseite hat diesen Artikel bestätigt.'
              : 'Bestätigung der Gegenseite für diesen Artikel offen.'),
          Text(segment.accessoriesEvidenceId != null
              ? 'Artikelbezogener Zubehörnachweis vorhanden.'
              : 'Artikelbezogener Zubehörnachweis offen.'),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;

  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.errorContainer,
      child: ListTile(
        leading: const Icon(Icons.error_outline),
        title: Text(message),
      ),
    );
  }
}

Map<String, String> _listingTitles(RentalCartGroupCandidate candidate) =>
    <String, String>{
      for (final item in candidate.items)
        item.listingId: _listingTitle(item.listing, item.listingId),
    };

String _listingTitle(Map<String, dynamic> listing, String fallback) {
  final title = (listing['title'] ?? '').toString().trim();
  return title.isEmpty ? fallback : title;
}

String _date(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';

String _dateTime(DateTime value) {
  final local = value.toLocal();
  return '${_date(local)} · ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')} Uhr';
}

String _slotLabel(String slot) => switch (slot) {
      'overview' => 'Übersicht',
      'detail' => 'Detail',
      'accessories' => 'Zubehör',
      'critical' => 'kritisch',
      _ => slot,
    };

String _itemOperations(BookingGroupHandoverItem item) {
  final parts = <String>[
    item.chatThreadId == null
        ? 'Artikelbezogener Chat noch nicht angelegt'
        : 'Eigener Buchungs-Chat vorhanden',
    if (item.returnState != null) 'Rückgabe: ${item.returnState}',
    if (item.returnCaseId != null) 'eigener Rückgabefall vorhanden',
    if (item.reportDeadline != null)
      'Meldegrenze ${_dateTime(item.reportDeadline!)}',
    if (item.clarificationDeadline != null)
      'Klärungsgrenze ${_dateTime(item.clarificationDeadline!)}',
  ];
  return '${parts.join(' · ')}. Keine Gruppenvermischung.';
}
