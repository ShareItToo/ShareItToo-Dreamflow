import 'package:flutter/material.dart';
import 'package:lendify/models/multi_criteria_review.dart';
import 'package:lendify/services/backend_config.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/qa_runtime_service.dart';
import 'package:lendify/services/review_metrics_service.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/blur_modal.dart';
import 'package:lendify/widgets/app_popup.dart';

class ReviewFormCriterionDefinition {
  final String key;
  final String label;
  final String helpText;

  const ReviewFormCriterionDefinition({
    required this.key,
    required this.label,
    required this.helpText,
  });
}

bool areAllReviewCriteriaRated(Iterable<int> starValues) =>
    starValues.length == buildReviewFormCriteria().length &&
    starValues.every((stars) => stars >= 1);

List<ReviewFormCriterionDefinition> buildReviewFormCriteria() => const [
      ReviewFormCriterionDefinition(
        key: ReviewMetricsService.communication,
        label: 'Kommunikation',
        helpText:
            'Bewerte Erreichbarkeit, Verständlichkeit, rechtzeitige Rückmeldungen und hilfreiche Abstimmung.',
      ),
      ReviewFormCriterionDefinition(
        key: ReviewMetricsService.reliability,
        label: 'Zuverlässigkeit',
        helpText:
            'Bewerte Einhaltung von Vereinbarungen, Pünktlichkeit, Verbindlichkeit und Durchführung wie vereinbart.',
      ),
      ReviewFormCriterionDefinition(
        key: ReviewMetricsService.articleAsDescribed,
        label: 'Artikel wie beschrieben',
        helpText:
            'Bewerte, ob Zustand, Ausstattung, Funktion und bekannte Gebrauchsspuren der Anzeige entsprachen – nicht, ob der Artikel neu oder hochwertig war.',
      ),
      ReviewFormCriterionDefinition(
        key: ReviewMetricsService.handoverReturn,
        label: 'Übergabe & Rückgabe',
        helpText:
            'Bewerte den gesamten Ablauf einschließlich Pünktlichkeit, Sauberkeit, Funktionsfähigkeit, Zubehör und Rückgabe.',
      ),
    ];

class ReviewPromptSheet extends StatefulWidget {
  final String requestId;
  final String itemId;
  final String reviewerId;
  final String reviewedUserId;
  final String direction;

  const ReviewPromptSheet({
    super.key,
    required this.requestId,
    required this.itemId,
    required this.reviewerId,
    required this.reviewedUserId,
    required this.direction,
  });

  static Future<bool?> show(
    BuildContext context, {
    required String requestId,
    required String itemId,
    required String reviewerId,
    required String reviewedUserId,
    required String direction,
  }) async {
    final isDark = AppTheme.isDark(context);
    if (!BackendConfig.enabled || QaRuntimeService.isEnabled) {
      try {
        final already = await DataService.hasSubmittedReview(
          requestId: requestId,
          reviewerId: reviewerId,
        );
        if (already) return false;
      } catch (_) {
        if (context.mounted) {
          AppPopup.error(
            context,
            title: 'Bewertung nicht verfügbar',
            message:
                'Bitte prüfe deine Anmeldung und öffne die Bewertung erneut.',
          );
        }
        return false;
      }
    }
    final request = await DataService.getRentalRequestById(requestId);
    if (request?.needsReview == true) {
      if (context.mounted) {
        AppPopup.info(
          context,
          title: 'Bewertung vorübergehend gesperrt',
          message:
              'Bewertungen sind blockiert, solange dieser Fall geprüft wird.',
        );
      }
      return false;
    }
    if (!context.mounted) return false;
    return showBlurBottomSheet<bool>(
      context,
      barrierOpacity: isDark ? 0.30 : 0.16,
      blurSigma: 10,
      showHandle: false,
      child: ReviewPromptSheet(
        requestId: requestId,
        itemId: itemId,
        reviewerId: reviewerId,
        reviewedUserId: reviewedUserId,
        direction: direction,
      ),
    );
  }

  @override
  State<ReviewPromptSheet> createState() => _ReviewPromptSheetState();
}

class _ReviewPromptSheetState extends State<ReviewPromptSheet> {
  late List<_CriterionState> _criteria;
  bool _submitting = false;
  String? _reviewedName;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _criteria = [
      for (final definition in buildReviewFormCriteria())
        _CriterionState(
          key: definition.key,
          label: definition.label,
          helpText: definition.helpText,
        ),
    ];
    Future.microtask(() async {
      try {
        final u = await DataService.getUserById(widget.reviewedUserId);
        if (mounted) setState(() => _reviewedName = u?.displayName);
      } catch (e) {
        debugPrint('[reviews] failed to resolve reviewed user name: $e');
      }
    });
  }

  bool get _allCriteriaRated =>
      areAllReviewCriteriaRated(_criteria.map((criterion) => criterion.stars));

  @override
  void dispose() {
    for (final criterion in _criteria) {
      criterion.note.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    if (!_allCriteriaRated) {
      AppPopup.info(
        context,
        title: 'Bewertung noch unvollständig',
        message: 'Bitte bewerte alle vier Kriterien.',
      );
      return;
    }
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final list = _criteria
          .map(
            (c) => ReviewCriterion(
              key: c.key,
              stars: c.stars.clamp(1, 5),
              note: c.note.text.trim().isEmpty ? null : c.note.text.trim(),
            ),
          )
          .toList();
      if (BackendConfig.enabled && !QaRuntimeService.isEnabled) {
        await BackendRepository.createBookingReview(
          bookingId: widget.requestId,
          direction: widget.direction,
          criteria: list.map((criterion) => criterion.toJson()).toList(),
        );
      } else {
        await DataService.addMultiReview(
          requestId: widget.requestId,
          itemId: widget.itemId,
          reviewerId: widget.reviewerId,
          reviewedUserId: widget.reviewedUserId,
          direction: widget.direction,
          criteria: list,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      debugPrint('[reviews] submit failed: $e');
      if (!mounted) return;
      setState(() {
        _submitError =
            'Die Bewertung wurde nicht gespeichert. Deine Eingaben bleiben erhalten – bitte versuche es erneut.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = AppTheme.isDark(context);
    final baseRole =
        widget.direction == 'renter_to_owner' ? 'Vermieter' : 'Mieter';
    final name = _reviewedName;
    final title =
        '${(name != null && name.isNotEmpty) ? name : baseRole} bewerten';
    final panelColor = isDark
        ? Colors.black.withValues(alpha: 0.42)
        : AppTheme.surfacePrimary(context).withValues(alpha: 0.98);
    return Material(
      color: Colors.transparent,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: SheetScaffold(
            title: title,
            actions: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: Icon(Icons.close, color: AppTheme.textSecondary(context)),
              ),
            ],
            body: Theme(
              data: theme.copyWith(
                inputDecorationTheme: theme.inputDecorationTheme.copyWith(
                  filled: true,
                  fillColor: AppTheme.surfaceMuted(context),
                ),
              ),
              child: Container(
                decoration: BoxDecoration(
                  color: panelColor,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.glassStroke(context)),
                ),
                padding: const EdgeInsets.all(4),
                child: Column(
                  children: [
                    for (final c in _criteria)
                      _CriterionTile(
                        data: c,
                        onStarsChanged: (stars) {
                          setState(() => c.stars = stars);
                        },
                      ),
                  ],
                ),
              ),
            ),
            bottomBar: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_submitError != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _submitError!,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    key: const ValueKey('review_submit_button'),
                    onPressed:
                        (_submitting || !_allCriteriaRated) ? null : _submit,
                    icon: const Icon(Icons.send_rounded),
                    label: Text(
                      _submitting
                          ? 'Sende…'
                          : _submitError == null
                              ? 'Bewertung senden'
                              : 'Erneut versuchen',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CriterionState {
  final String key;
  final String label;
  final String helpText;
  int stars = 0;
  final TextEditingController note;

  _CriterionState({
    required this.key,
    required this.label,
    required this.helpText,
  }) : note = TextEditingController();
}

class _CriterionTile extends StatelessWidget {
  final _CriterionState data;
  final ValueChanged<int> onStarsChanged;

  const _CriterionTile({required this.data, required this.onStarsChanged});

  @override
  Widget build(BuildContext context) {
    final d = data;
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppTheme.surfaceSecondary(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.glassStroke(context)),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            d.label,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.textPrimary(context),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            d.helpText,
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppTheme.textSecondary(context),
              height: 1.35,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (int i = 1; i <= 5; i++)
                IconButton(
                  key: ValueKey('review_${d.key}_stars_$i'),
                  padding: const EdgeInsets.all(6),
                  constraints: const BoxConstraints(),
                  splashRadius: 20,
                  onPressed: () => onStarsChanged(i),
                  icon: Icon(
                    i <= d.stars ? Icons.star : Icons.star_border,
                    color: const Color(0xFFFB923C),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          TextField(
            key: ValueKey('review_${d.key}_note'),
            controller: d.note,
            maxLength: 2000,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Kommentar (optional)',
              hintStyle: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.textSecondary(context),
              ),
              filled: true,
              fillColor: AppTheme.surfaceMuted(context),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppTheme.glassStroke(context)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppTheme.glassStroke(context)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: theme.colorScheme.primary,
                  width: 1.4,
                ),
              ),
            ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppTheme.textPrimary(context),
            ),
          ),
        ],
      ),
    );
  }
}
