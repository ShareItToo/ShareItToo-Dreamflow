import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:lendify/navigation/main_nav_controller.dart';
import 'package:lendify/models/invoice.dart';
import 'package:lendify/screens/create_listing_screen.dart';
import 'package:lendify/screens/invoice_detail_screen.dart';
import 'package:lendify/services/invoices_service.dart';
import 'package:provider/provider.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen>
    with SingleTickerProviderStateMixin {
  bool _loading = true;
  List<Invoice> _all = const [];
  InvoiceFilter _filter = InvoiceFilter.all;
  int? _year;
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (_tabController.indexIsChanging) return;
      // Keep filters intuitive per tab.
      if (mounted) setState(() => _filter = InvoiceFilter.all);
    });
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await InvoicesService.getInvoicesForCurrentUser();
      final years = InvoicesService.availableYears(list);
      setState(() {
        _all = list;
        _year = years.isEmpty
            ? null
            : (years.contains(DateTime.now().year)
                ? DateTime.now().year
                : years.first);
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final isRenterTab = _tabController.index == 0;
    final base = _all
        .where((e) => isRenterTab ? _isRenterDoc(e) : _isOwnerDoc(e))
        .toList();

    final years = InvoicesService.availableYears(base);
    final effectiveYear =
        _year ?? (years.isNotEmpty ? years.first : DateTime.now().year);
    final filtered =
        InvoicesService.filter(invoices: base, filter: _filter, year: _year);
    final yearTotal = InvoicesService.sumAmountForYear(base, effectiveYear);

    final cardRadius = 18.0;
    final cardColor = Colors.black.withValues(alpha: 0.30);
    final borderColor = Colors.white.withValues(alpha: 0.07);

    return Stack(children: [
      Positioned.fill(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(color: Colors.black.withValues(alpha: 0.34)),
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
          centerTitle: true,
          title: const Text('Rechnungen & Belege'),
          leading: IconButton(
              tooltip: MaterialLocalizations.of(context).backButtonTooltip,
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: () => Navigator.of(context).maybePop()),
        ),
        body: RefreshIndicator(
          color: cs.primary,
          backgroundColor: cs.surface,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, kToolbarHeight + 14, 16, 28),
            children: [
              Text(
                isRenterTab
                    ? 'Alle Rechnungen und Belege zu deinen Anmietungen.'
                    : 'Auszahlungen, Gebühren und Belege zu deinen Vermietungen.',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: Colors.white.withValues(alpha: 0.82)),
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(16),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: TabBar(
                  controller: _tabController,
                  dividerColor: Colors.transparent,
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: cs.primary.withValues(alpha: 0.20),
                    borderRadius: BorderRadius.circular(14),
                    border:
                        Border.all(color: cs.primary.withValues(alpha: 0.28)),
                  ),
                  labelColor: Colors.white,
                  unselectedLabelColor: Colors.white.withValues(alpha: 0.75),
                  labelStyle: theme.textTheme.labelSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                  unselectedLabelStyle: theme.textTheme.labelSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                  tabs: const [
                    Tab(text: 'Mieter'),
                    Tab(text: 'Vermieter'),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Yearly summary
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: cardColor,
                  borderRadius: BorderRadius.circular(cardRadius),
                  border: Border.all(color: borderColor),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withValues(alpha: 0.35),
                        blurRadius: 18,
                        offset: const Offset(0, 10))
                  ],
                ),
                child: Row(children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      color: cs.primary.withValues(alpha: 0.20),
                      border:
                          Border.all(color: cs.primary.withValues(alpha: 0.30)),
                    ),
                    child: Icon(Icons.insights_rounded, color: cs.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Dieses Jahr',
                              style: theme.textTheme.labelSmall?.copyWith(
                                  color: Colors.white.withValues(alpha: 0.80))),
                          const SizedBox(height: 2),
                          Text('${_formatEuro(yearTotal)} Gesamtvolumen',
                              style: theme.textTheme.titleMedium),
                        ]),
                  ),
                  if (years.isNotEmpty)
                    _YearSelector(
                        value: _year,
                        years: years,
                        onChanged: (v) => setState(() => _year = v)),
                ]),
              ),
              const SizedBox(height: 12),

              // Filters
              _FilterChips(
                  renter: isRenterTab,
                  value: _filter,
                  onChanged: (v) => setState(() => _filter = v)),
              const SizedBox(height: 10),

              if (_loading)
                const _InvoicesLoadingSkeleton()
              else if (filtered.isEmpty)
                _EmptyInvoicesState(
                  renter: isRenterTab,
                  onAction: isRenterTab
                      ? () {
                          context.read<MainNavController>().setIndex(0);
                          Navigator.of(context).popUntil((r) => r.isFirst);
                        }
                      : () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => const CreateListingScreen())),
                )
              else
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  child: Column(
                    key: ValueKey(
                        '${isRenterTab ? 'r' : 'o'}_${_filter.name}_${_year ?? 'all'}_${filtered.length}'),
                    children: [
                      for (final inv in filtered) ...[
                        _InvoiceCard(invoice: inv),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    ]);
  }
}

class _YearSelector extends StatelessWidget {
  final int? value;
  final List<int> years;
  final ValueChanged<int?> onChanged;
  const _YearSelector(
      {required this.value, required this.years, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<int>(
          value: value,
          dropdownColor: cs.surface,
          borderRadius: BorderRadius.circular(12),
          iconEnabledColor: Colors.white.withValues(alpha: 0.85),
          style: theme.textTheme.labelSmall,
          items: [
            for (final y in years)
              DropdownMenuItem<int>(
                value: y,
                child: Text(y.toString(), style: theme.textTheme.labelSmall),
              ),
          ],
          onChanged: (v) => onChanged(v),
        ),
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  final bool renter;
  final InvoiceFilter value;
  final ValueChanged<InvoiceFilter> onChanged;
  const _FilterChips(
      {required this.renter, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    Widget chip(String label, InvoiceFilter v) {
      final selected = value == v;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          selected: selected,
          showCheckmark: false,
          label: Text(label,
              style: theme.textTheme.labelSmall?.copyWith(
                  color: selected
                      ? cs.onPrimary
                      : Colors.white.withValues(alpha: 0.90))),
          selectedColor: cs.primary,
          backgroundColor: Colors.black.withValues(alpha: 0.22),
          side: BorderSide(
              color: selected
                  ? Colors.transparent
                  : Colors.white.withValues(alpha: 0.12)),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          onSelected: (_) => onChanged(v),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: [
        chip('Alle', InvoiceFilter.all),
        if (renter) ...[
          chip('Zahlungen', InvoiceFilter.bookings),
          chip('Rückerstattungen', InvoiceFilter.refunds),
        ] else ...[
          chip('Auszahlungen', InvoiceFilter.rentals),
          chip('Gebühren', InvoiceFilter.fees),
        ],
      ]),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  final Invoice invoice;
  const _InvoiceCard({required this.invoice});

  IconData get _icon {
    switch (invoice.type) {
      case InvoiceType.bookingPaymentReceipt:
        return Icons.receipt_long_rounded;
      case InvoiceType.ownerPayoutStatement:
        return Icons.payments_rounded;
      case InvoiceType.refundReceipt:
        return Icons.replay_rounded;
      case InvoiceType.sitFeeReceipt:
        return Icons.percent_rounded;
    }
  }

  String get _typeLabel {
    switch (invoice.type) {
      case InvoiceType.bookingPaymentReceipt:
        return 'Zahlungsübersicht';
      case InvoiceType.ownerPayoutStatement:
        return 'Auszahlungsnachweis';
      case InvoiceType.refundReceipt:
        return 'Erstattungsbeleg';
      case InvoiceType.sitFeeReceipt:
        return 'SIT-Gebührenbeleg';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final cardRadius = 18.0;
    final cardColor = Colors.black.withValues(alpha: 0.30);
    final borderColor = Colors.white.withValues(alpha: 0.07);

    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => InvoiceDetailScreen(invoice: invoice))),
      borderRadius: BorderRadius.circular(cardRadius),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cardColor,
          borderRadius: BorderRadius.circular(cardRadius),
          border: Border.all(color: borderColor),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.30),
                blurRadius: 16,
                offset: const Offset(0, 10))
          ],
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              color: cs.primary.withValues(alpha: 0.18),
              border: Border.all(color: cs.primary.withValues(alpha: 0.28)),
            ),
            child: Icon(_icon, color: cs.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${invoice.booking.itemTitle} – $_typeLabel',
                  style: theme.textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                '${_formatDate(invoice.date)}\nBuchung: ${invoice.bookingId}',
                style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.white.withValues(alpha: 0.78), height: 1.35),
              ),
            ]),
          ),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(_formatEuro(invoice.amount),
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => InvoiceDetailScreen(
                      invoice: invoice, autoStartDownload: true))),
              icon: Icon(Icons.picture_as_pdf_rounded,
                  size: 18, color: cs.primary),
              label: Text('PDF herunterladen',
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: Colors.white)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Colors.white.withValues(alpha: 0.14)),
                backgroundColor: Colors.black.withValues(alpha: 0.18),
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _InvoicesLoadingSkeleton extends StatelessWidget {
  const _InvoicesLoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    Widget box({double h = 14, double w = double.infinity}) => Container(
          height: h,
          width: w,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(10),
          ),
        );

    Widget card() => Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.26),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(14)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    box(h: 14, w: 200),
                    const SizedBox(height: 8),
                    box(h: 11, w: 150),
                    const SizedBox(height: 6),
                    box(h: 11, w: 120),
                  ]),
            ),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              box(h: 14, w: 70),
              const SizedBox(height: 10),
              box(h: 34, w: 140),
            ]),
          ]),
        );

    return Column(children: [for (int i = 0; i < 6; i++) card()]);
  }
}

class _EmptyInvoicesState extends StatelessWidget {
  final bool renter;
  final VoidCallback onAction;
  const _EmptyInvoicesState({required this.renter, required this.onAction});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;

    final actionLabel = renter ? 'Artikel entdecken' : 'Anzeige erstellen';
    final actionIcon = renter ? Icons.search_rounded : Icons.add_rounded;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
                color: cs.primary.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: cs.primary.withValues(alpha: 0.25))),
            child: Icon(Icons.receipt_long_rounded, color: cs.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Text(
                  renter
                      ? 'Noch keine Belege als Mieter'
                      : 'Noch keine Belege als Vermieter',
                  style: theme.textTheme.titleMedium)),
        ]),
        const SizedBox(height: 10),
        Text(
          renter
              ? 'Nach einer tatsächlich erfassten Zahlung erscheinen hier Zahlungs-, Gebühren- und Erstattungsbelege.'
              : 'Nach einer tatsächlich ausgeführten Auszahlung erscheint hier dein Auszahlungsnachweis.',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: Colors.white.withValues(alpha: 0.82)),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: onAction,
            icon: Icon(actionIcon, color: cs.onPrimary),
            label: Text(actionLabel,
                style: theme.textTheme.bodyMedium?.copyWith(
                    color: cs.onPrimary, fontWeight: FontWeight.w700)),
            style: FilledButton.styleFrom(
              backgroundColor: cs.primary,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
      ]),
    );
  }
}

bool _isRenterDoc(Invoice i) =>
    i.type == InvoiceType.bookingPaymentReceipt ||
    i.type == InvoiceType.sitFeeReceipt ||
    i.type == InvoiceType.refundReceipt;

bool _isOwnerDoc(Invoice i) => i.type == InvoiceType.ownerPayoutStatement;

String _formatEuro(double v) {
  final s = v.toStringAsFixed(2).replaceAll('.', ',');
  return '$s €';
}

String _formatDate(DateTime dt) {
  const months = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  final m = months[(dt.month - 1).clamp(0, 11)];
  return '${dt.day}. $m ${dt.year}';
}
