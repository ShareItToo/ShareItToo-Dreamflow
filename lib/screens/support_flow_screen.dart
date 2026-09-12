import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/app_image.dart';
import 'package:lendify/widgets/support_principal_controller.dart';

/// Quelle, aus der der Support-Flow gestartet wurde
enum SupportFlowSource {
  bookingChat,
  bookingDetail,
  ownerRequestDetail,
  helpCenter,
}

/// Rolle des aktuellen Nutzers
enum SupportFlowRole {
  renter,
  owner,
}

/// Kontext-Modell für den Support-Flow
class SupportFlowContext {
  final String itemTitle;
  final String itemId;
  final String requestId;
  final String bookingStatus;
  final SupportFlowSource source;
  final SupportFlowRole role;
  final String? otherUserName;
  final String? threadId;
  final String? itemImageUrl;
  final String? otherUserImageUrl;

  const SupportFlowContext({
    required this.itemTitle,
    required this.itemId,
    required this.requestId,
    required this.bookingStatus,
    required this.source,
    required this.role,
    this.otherUserName,
    this.threadId,
    this.itemImageUrl,
    this.otherUserImageUrl,
  });

  /// Factory für Chat-Kontext
  factory SupportFlowContext.fromChat({
    required String itemTitle,
    required String itemId,
    required String requestId,
    required String bookingStatus,
    required bool viewerIsOwner,
    String? otherUserName,
    String? threadId,
    String? itemImageUrl,
    String? otherUserImageUrl,
  }) {
    return SupportFlowContext(
      itemTitle: itemTitle,
      itemId: itemId,
      requestId: requestId,
      bookingStatus: bookingStatus,
      source: SupportFlowSource.bookingChat,
      role: viewerIsOwner ? SupportFlowRole.owner : SupportFlowRole.renter,
      otherUserName: otherUserName,
      threadId: threadId,
      itemImageUrl: itemImageUrl,
      otherUserImageUrl: otherUserImageUrl,
    );
  }

  /// Factory für Buchungsdetail-Kontext
  factory SupportFlowContext.fromBookingDetail({
    required String itemTitle,
    required String itemId,
    required String requestId,
    required String bookingStatus,
    required bool viewerIsOwner,
    String? otherUserName,
    String? itemImageUrl,
    String? otherUserImageUrl,
  }) {
    return SupportFlowContext(
      itemTitle: itemTitle,
      itemId: itemId,
      requestId: requestId,
      bookingStatus: bookingStatus,
      source: SupportFlowSource.bookingDetail,
      role: viewerIsOwner ? SupportFlowRole.owner : SupportFlowRole.renter,
      otherUserName: otherUserName,
      itemImageUrl: itemImageUrl,
      otherUserImageUrl: otherUserImageUrl,
    );
  }

  /// Factory für Owner-Request-Detail-Kontext
  factory SupportFlowContext.fromOwnerRequestDetail({
    required String itemTitle,
    required String itemId,
    required String requestId,
    required String bookingStatus,
    String? otherUserName,
    String? itemImageUrl,
    String? otherUserImageUrl,
  }) {
    return SupportFlowContext(
      itemTitle: itemTitle,
      itemId: itemId,
      requestId: requestId,
      bookingStatus: bookingStatus,
      source: SupportFlowSource.ownerRequestDetail,
      role: SupportFlowRole.owner,
      otherUserName: otherUserName,
      itemImageUrl: itemImageUrl,
      otherUserImageUrl: otherUserImageUrl,
    );
  }

  /// Konvertiert den Kontext zu einer Map für den Support-Fall
  Map<String, dynamic> toSupportContext() {
    return {
      'itemTitle': itemTitle,
      'itemId': itemId,
      'requestId': requestId,
      'threadId': threadId ?? '',
      'bookingStatus': bookingStatus,
      'otherUserName': otherUserName ?? '',
      'currentUserRole': role == SupportFlowRole.owner ? 'owner' : 'renter',
      'source': source.name,
      'createdAt': DateTime.now().toIso8601String(),
    };
  }
}

/// Versionierter Nachweis der Sicherheitsfrage vor der normalen Support-Aufnahme.
class SupportSafetyTriage {
  static const version = 'sit_support_safety_triage_v1';
  static const packetVersion = 'SIT_SUPPORT_PACKET_V1_2026-08-20';
  static const guidanceVersion = 'T-003@1.0.0';

  final bool immediateDanger;
  final bool guidanceShown;

  const SupportSafetyTriage({
    required this.immediateDanger,
    required this.guidanceShown,
  });

  Map<String, dynamic> toMap() => {
        'version': version,
        'packetVersion': packetVersion,
        'guidanceVersion': guidanceVersion,
        'immediateDanger': immediateDanger,
        'guidanceShown': guidanceShown,
      };
}

/// Versionierter Nachweis, dass ein Support-Fall genau ein Problem enthält.
class SupportIssueScope {
  static const version = 'sit_support_single_issue_scope_v1';

  final bool singleIssueConfirmed;
  final bool separationGuidanceShown;

  const SupportIssueScope({
    required this.singleIssueConfirmed,
    required this.separationGuidanceShown,
  });

  Map<String, dynamic> toMap() => {
        'version': version,
        'singleIssueConfirmed': singleIssueConfirmed,
        'separationGuidanceShown': separationGuidanceShown,
      };
}

/// Strukturierte Angaben für eine gesonderte DSA-Notice-and-Action-Meldung.
class SupportDsaNotice {
  static const version = 'sit_dsa_notice_intake_v1';

  final String contentType;
  final String contentLocator;
  final String illegalityStatement;
  final String? jurisdictionOrLegalBasis;
  final bool goodFaithConfirmed;

  const SupportDsaNotice({
    required this.contentType,
    required this.contentLocator,
    required this.illegalityStatement,
    required this.goodFaithConfirmed,
    this.jurisdictionOrLegalBasis,
  });

  Map<String, dynamic> toMap() => {
        'version': version,
        'contentType': contentType,
        'contentLocator': contentLocator.trim(),
        'illegalityStatement': illegalityStatement.trim(),
        'jurisdictionOrLegalBasis':
            jurisdictionOrLegalBasis?.trim().isEmpty == true
                ? null
                : jurisdictionOrLegalBasis?.trim(),
        'goodFaithConfirmed': goodFaithConfirmed,
      };
}

/// Strukturierte, nicht-live Produktsicherheitsmeldung für die Schnelltriage.
class SupportProductSafetyNotice {
  static const version = 'sit_product_safety_intake_v1';
  static const contactPointVersion = 'sit_product_safety_contact_point_v1';

  final String issueKind;
  final String productIdentification;
  final String riskDescription;
  final bool injuryOccurred;
  final bool safetyGuidanceAcknowledged;

  const SupportProductSafetyNotice({
    required this.issueKind,
    required this.productIdentification,
    required this.riskDescription,
    required this.injuryOccurred,
    required this.safetyGuidanceAcknowledged,
  });

  Map<String, dynamic> toMap() => {
        'version': version,
        'contactPointVersion': contactPointVersion,
        'issueKind': issueKind,
        'productIdentification': productIdentification.trim(),
        'riskDescription': riskDescription.trim(),
        'injuryOccurred': injuryOccurred,
        'safetyGuidanceAcknowledged': safetyGuidanceAcknowledged,
      };
}

/// Eindeutige, versionierte Art eines Betroffenenrechts.
class SupportPrivacyRightsRequest {
  static const version = 'sit_privacy_rights_request_v1';

  final String requestKind;

  const SupportPrivacyRightsRequest(this.requestKind);

  Map<String, dynamic> toMap() => {
        'version': version,
        'requestKind': requestKind,
      };
}

/// Kontrollierte Einordnung eines ausdrücklich nicht dringenden Feedbacks.
class SupportFeedbackContext {
  static const version = 'sit_support_feedback_context_v1';

  final String feedbackKind;
  final String productArea;

  const SupportFeedbackContext({
    required this.feedbackKind,
    required this.productArea,
  });

  Map<String, dynamic> toMap() => {
        'version': version,
        'feedbackKind': feedbackKind,
        'productArea': productArea,
        'nonUrgentConfirmed': true,
      };
}

class SupportCaseRoute {
  final String caseType;
  final String caseSubType;

  const SupportCaseRoute(this.caseType, this.caseSubType);
}

/// Ergebnis des Support-Flows
class SupportFlowResult {
  final String mainCategory;
  final String subCategory;
  final String userDescription;
  final SupportFlowContext context;
  final SupportSafetyTriage safetyTriage;
  final SupportIssueScope issueScope;
  final SupportDsaNotice? dsaNotice;
  final SupportProductSafetyNotice? productSafetyNotice;
  final bool handoverSafeAbortAcknowledged;
  final bool handoverDoNotPayAcknowledged;
  final bool handoverContactAttemptAcknowledged;
  final Map<String, dynamic>? canonicalCase;

  const SupportFlowResult({
    required this.mainCategory,
    required this.subCategory,
    required this.userDescription,
    required this.context,
    required this.safetyTriage,
    required this.issueScope,
    this.dsaNotice,
    this.productSafetyNotice,
    this.handoverSafeAbortAcknowledged = false,
    this.handoverDoNotPayAcknowledged = false,
    this.handoverContactAttemptAcknowledged = false,
    this.canonicalCase,
  });

  static const _dsaContentTypes = <String, String>{
    'Anzeige / Artikel': 'listing',
    'Profil': 'profile',
    'Bewertung': 'review',
    'Nachricht / Chat': 'message',
    'Anderer Inhalt': 'other',
  };

  static const _privacyRightsRequests = <String, SupportPrivacyRightsRequest>{
    'Auskunft oder Kopie meiner Daten': SupportPrivacyRightsRequest('access'),
    'Daten übertragen': SupportPrivacyRightsRequest('portability'),
    'Daten berichtigen': SupportPrivacyRightsRequest('rectification'),
    'Daten löschen': SupportPrivacyRightsRequest('erasure'),
    'Verarbeitung widersprechen': SupportPrivacyRightsRequest('objection'),
    'Verarbeitung einschränken': SupportPrivacyRightsRequest('restriction'),
  };

  static const _feedbackContexts = <String, SupportFeedbackContext>{
    'Verbesserung für App und Bedienung': SupportFeedbackContext(
      feedbackKind: 'improvement_suggestion',
      productArea: 'app_experience',
    ),
    'Feedback zu Anzeigen und Katalog': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'listing_and_catalog',
    ),
    'Feedback zu Buchung und Terminen': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'booking_and_schedule',
    ),
    'Feedback zu Übergabe und Rückgabe': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'handover_and_return',
    ),
    'Feedback zu Zahlung und Dokumenten': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'payments_and_documents',
    ),
    'Feedback zu Nachrichten und Benachrichtigungen': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'messages_and_notifications',
    ),
    'Feedback zu Profil und Konto': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'profile_and_account',
    ),
    'Feedback zur Barrierefreiheit': SupportFeedbackContext(
      feedbackKind: 'improvement_suggestion',
      productArea: 'accessibility',
    ),
    'Nicht dringende Erklärung gewünscht': SupportFeedbackContext(
      feedbackKind: 'non_urgent_explanation',
      productArea: 'other',
    ),
    'Anderes nicht dringendes Feedback': SupportFeedbackContext(
      feedbackKind: 'general_feedback',
      productArea: 'other',
    ),
  };

  static const _backendRoutes = <String, Map<String, SupportCaseRoute>>{
    'handover': {
      'Mieter ist nicht erschienen':
          SupportCaseRoute('cancellation_no_show', 'handover_no_show'),
      'Vermieter ist nicht erschienen':
          SupportCaseRoute('cancellation_no_show', 'handover_no_show'),
      'Gegenpartei öffnet nicht / reagiert nicht':
          SupportCaseRoute('cancellation_no_show', 'handover_no_show'),
      'Übergabeort ist unklar':
          SupportCaseRoute('booking_pre_start', 'address_reveal'),
      'Falsche Person ist erschienen':
          SupportCaseRoute('active_handover', 'identity_or_person_mismatch'),
      'Artikel ist nicht wie beschrieben':
          SupportCaseRoute('active_handover', 'item_not_as_listed'),
      'Kaution oder Sicherheitszahlung wird verlangt':
          SupportCaseRoute('trust_safety', 'offplatform_deposit_request'),
      'Vermieter verweigert Übergabe':
          SupportCaseRoute('active_handover', 'handover_confirmation_conflict'),
      'Mieter verweigert Bestätigung':
          SupportCaseRoute('active_handover', 'handover_confirmation_conflict'),
      'QR-Code funktioniert nicht':
          SupportCaseRoute('active_handover', 'qr_or_code_failure'),
      '6-stelliger Code funktioniert nicht':
          SupportCaseRoute('active_handover', 'qr_or_code_failure'),
      'Kamera/Fotos funktionieren nicht':
          SupportCaseRoute('active_handover', 'handover_photo_missing'),
      'Ich fühle mich unsicher vor Ort':
          SupportCaseRoute('active_handover', 'unsafe_handover'),
      'Sonstiges Übergabeproblem':
          SupportCaseRoute('active_handover', 'handover_confirmation_conflict'),
    },
    'return': {
      'Mieter ist nicht zur Rückgabe erschienen':
          SupportCaseRoute('cancellation_no_show', 'return_no_show'),
      'Vermieter ist nicht zur Rückgabe erschienen':
          SupportCaseRoute('cancellation_no_show', 'return_no_show'),
      'Gegenpartei reagiert nicht':
          SupportCaseRoute('active_return', 'party_not_present'),
      'Rückgabeort ist unklar':
          SupportCaseRoute('active_return', 'return_location_or_time'),
      'Artikel wurde beschädigt zurückgegeben':
          SupportCaseRoute('post_return_dispute', 'damage_report'),
      'Artikel fehlt / wurde nicht zurückgegeben':
          SupportCaseRoute('post_return_dispute', 'missing_item_report'),
      'Rückgabe wird verweigert':
          SupportCaseRoute('active_return', 'return_confirmation_conflict'),
      'QR-Code funktioniert nicht':
          SupportCaseRoute('active_return', 'qr_or_code_failure'),
      '6-stelliger Rückgabecode funktioniert nicht':
          SupportCaseRoute('active_return', 'qr_or_code_failure'),
      'Rückgabefotos funktionieren nicht':
          SupportCaseRoute('active_return', 'return_photo_missing'),
      'Ich fühle mich unsicher vor Ort':
          SupportCaseRoute('active_return', 'unsafe_return'),
      'Sonstiges Rückgabeproblem':
          SupportCaseRoute('active_return', 'return_confirmation_conflict'),
    },
    'item_condition': {
      'Artikel funktioniert nicht':
          SupportCaseRoute('active_rental', 'item_failure_or_defect'),
      'Artikel ist beschädigt':
          SupportCaseRoute('active_rental', 'item_failure_or_defect'),
      'Zubehör fehlt':
          SupportCaseRoute('active_rental', 'usage_or_accessory_issue'),
      'Artikel entspricht nicht der Beschreibung':
          SupportCaseRoute('active_handover', 'item_not_as_listed'),
      'Artikel war schmutzig': SupportCaseRoute(
          'post_return_dispute', 'cleaning_or_condition_dispute'),
      'Falscher Artikel übergeben':
          SupportCaseRoute('active_handover', 'item_not_as_listed'),
      'Schaden wurde schon vor Übergabe bemerkt':
          SupportCaseRoute('active_handover', 'item_not_as_listed'),
      'Schaden wurde nach Rückgabe gemeldet':
          SupportCaseRoute('post_return_dispute', 'damage_report'),
      'Sonstiges Artikelproblem': SupportCaseRoute(
          'listing_quality', 'unclear_condition_or_accessories'),
    },
    'payment': {
      'Preis stimmt nicht':
          SupportCaseRoute('money_case', 'invoice_amount_or_fee'),
      'Gesamtbetrag unklar':
          SupportCaseRoute('money_case', 'invoice_amount_or_fee'),
      'Zahlung wurde doppelt angezeigt':
          SupportCaseRoute('money_case', 'duplicate_or_unrecognized_charge'),
      'Rückerstattung unklar':
          SupportCaseRoute('money_case', 'refund_processing_or_failure'),
      'Auszahlung unklar':
          SupportCaseRoute('money_case', 'payout_processing_or_failure'),
      'Stornierung und Zahlung unklar':
          SupportCaseRoute('money_case', 'refund_request_or_review'),
      'Gebühren unklar':
          SupportCaseRoute('money_case', 'invoice_amount_or_fee'),
      'Sonstiges Zahlungsproblem':
          SupportCaseRoute('money_case', 'payment_failed_or_requires_action'),
    },
    'person': {
      'Unangemessenes Verhalten':
          SupportCaseRoute('trust_safety', 'harassment_or_stalking'),
      'Drohung / Druck': SupportCaseRoute('trust_safety', 'threat_or_violence'),
      'Beleidigung': SupportCaseRoute('trust_safety', 'harassment_or_stalking'),
      'Verdächtiges Verhalten':
          SupportCaseRoute('trust_safety', 'suspected_fraud_or_impersonation'),
      'Profil wirkt falsch':
          SupportCaseRoute('trust_safety', 'suspected_fraud_or_impersonation'),
      'Andere Person will außerhalb von SIT abwickeln':
          SupportCaseRoute('trust_safety', 'suspected_fraud_or_impersonation'),
      'Sicherheitsgefühl vor Ort schlecht':
          SupportCaseRoute('trust_safety', 'threat_or_violence'),
      'Sonstiges Personenproblem':
          SupportCaseRoute('trust_safety', 'harassment_or_stalking'),
    },
    'technical': {
      'Chat funktioniert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'Kamera funktioniert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'Datei hochladen funktioniert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'Standort senden funktioniert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'QR-Code Scanner funktioniert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'App lädt nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'Button reagiert nicht':
          SupportCaseRoute('general_help', 'app_error_or_display'),
      'Sonstiges technisches Problem':
          SupportCaseRoute('general_help', 'app_error_or_display'),
    },
    'feedback': {
      'Verbesserung für App und Bedienung':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Anzeigen und Katalog':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Buchung und Terminen':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Übergabe und Rückgabe':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Zahlung und Dokumenten':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Nachrichten und Benachrichtigungen':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zu Profil und Konto':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Feedback zur Barrierefreiheit':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Nicht dringende Erklärung gewünscht':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
      'Anderes nicht dringendes Feedback':
          SupportCaseRoute('general_help', 'feedback_or_improvement'),
    },
    'privacy': {
      'Auskunft oder Kopie meiner Daten':
          SupportCaseRoute('privacy_security', 'access_or_copy_request'),
      'Daten übertragen':
          SupportCaseRoute('privacy_security', 'access_or_copy_request'),
      'Daten berichtigen': SupportCaseRoute(
          'privacy_security', 'correction_or_deletion_request'),
      'Daten löschen': SupportCaseRoute(
          'privacy_security', 'correction_or_deletion_request'),
      'Verarbeitung widersprechen': SupportCaseRoute(
          'privacy_security', 'objection_or_restriction_request'),
      'Verarbeitung einschränken': SupportCaseRoute(
          'privacy_security', 'objection_or_restriction_request'),
      'Meine Daten wurden unbefugt offengelegt':
          SupportCaseRoute('privacy_security', 'unauthorized_data_exposure'),
      'Mögliche Datenschutzverletzung melden': SupportCaseRoute(
          'privacy_security', 'suspected_personal_data_breach'),
      'Daten gingen an falsches Konto oder falsche Person': SupportCaseRoute(
          'privacy_security', 'wrong_recipient_or_wrong_account'),
      'Identität für Datenschutzanfrage bestätigen': SupportCaseRoute(
        'privacy_security',
        'identity_verification_for_rights_request',
      ),
    },
    'dsa_notice': {
      'Anzeige / Artikel':
          SupportCaseRoute('moderation_content', 'illegal_content_notice'),
      'Profil':
          SupportCaseRoute('moderation_content', 'illegal_content_notice'),
      'Bewertung':
          SupportCaseRoute('moderation_content', 'illegal_content_notice'),
      'Nachricht / Chat':
          SupportCaseRoute('moderation_content', 'illegal_content_notice'),
      'Anderer Inhalt':
          SupportCaseRoute('moderation_content', 'illegal_content_notice'),
    },
    'product_safety': {
      'Möglicherweise gefährliches Produkt':
          SupportCaseRoute('trust_safety', 'dangerous_item_or_injury'),
      'Unfall oder Verletzung durch Produkt':
          SupportCaseRoute('trust_safety', 'dangerous_item_or_injury'),
    },
    'other': {
      'Ich bin unsicher, was ich tun soll':
          SupportCaseRoute('general_help', 'general_how_to'),
      'Allgemeine Frage zur Buchung': SupportCaseRoute(
          'booking_pre_start', 'booking_request_or_acceptance'),
      'Ich brauche Hilfe vom Support':
          SupportCaseRoute('general_help', 'general_how_to'),
      'Anderes Problem': SupportCaseRoute('general_help', 'general_how_to'),
    },
    'profile_report': {
      'Falsche Identität':
          SupportCaseRoute('trust_safety', 'suspected_fraud_or_impersonation'),
      'Unangemessenes Verhalten':
          SupportCaseRoute('trust_safety', 'harassment_or_stalking'),
      'Betrugsverdacht':
          SupportCaseRoute('trust_safety', 'suspected_fraud_or_impersonation'),
      'Beleidigende/gefährliche Inhalte':
          SupportCaseRoute('moderation_content', 'image_or_text_violation'),
      'Spam': SupportCaseRoute('moderation_content', 'image_or_text_violation'),
      'Sonstiges': SupportCaseRoute(
          'moderation_content', 'account_or_service_restriction'),
    },
  };

  SupportCaseRoute get backendRoute {
    if (safetyTriage.immediateDanger) {
      return const SupportCaseRoute(
          'trust_safety', 'immediate_physical_danger');
    }
    final route = _backendRoutes[mainCategory]?[subCategory];
    if (route == null) throw StateError('support_case_route_unmapped');
    return route;
  }

  String? get handoverExceptionKind {
    if (safetyTriage.immediateDanger) return null;
    if (mainCategory == 'handover' &&
        const {
          'Mieter ist nicht erschienen',
          'Vermieter ist nicht erschienen',
          'Gegenpartei öffnet nicht / reagiert nicht',
        }.contains(subCategory)) {
      return 'party_no_show';
    }
    if ((mainCategory == 'handover' &&
            subCategory == 'Artikel ist nicht wie beschrieben') ||
        (mainCategory == 'item_condition' &&
            const {
              'Artikel entspricht nicht der Beschreibung',
              'Falscher Artikel übergeben',
              'Schaden wurde schon vor Übergabe bemerkt',
            }.contains(subCategory))) {
      return 'item_mismatch';
    }
    if (mainCategory == 'handover' &&
        subCategory == 'Kaution oder Sicherheitszahlung wird verlangt') {
      return 'offplatform_deposit_request';
    }
    return null;
  }

  Map<String, dynamic> toHandoverExceptionInput() {
    final kind = handoverExceptionKind;
    if (kind == null || context.requestId.trim().isEmpty) {
      throw const FormatException('invalid_handover_exception_context');
    }
    final details = userDescription.trim();
    if (details.length < 10) {
      throw const FormatException('handover_exception_details_required');
    }
    return <String, dynamic>{
      'kind': kind,
      'details': details,
      'immediateDanger': false,
      'safeAbortGuidanceAcknowledged': handoverSafeAbortAcknowledged,
      'doNotPayGuidanceAcknowledged': handoverDoNotPayAcknowledged,
      'contactAttemptAcknowledged': handoverContactAttemptAcknowledged,
    };
  }

  Map<String, dynamic> toBackendInput() {
    final route = backendRoute;
    final isDsaNotice = route.caseType == 'moderation_content' &&
        route.caseSubType == 'illegal_content_notice';
    final isProductSafetyNotice = route.caseType == 'trust_safety' &&
        route.caseSubType == 'dangerous_item_or_injury';
    final isFeedback = route.caseType == 'general_help' &&
        route.caseSubType == 'feedback_or_improvement';
    final feedbackContext = _feedbackContexts[subCategory];
    final expectedDsaContentType = _dsaContentTypes[subCategory];
    final privacyRightsRequest = _privacyRightsRequests[subCategory];
    if (isDsaNotice &&
        (dsaNotice == null ||
            dsaNotice!.contentType != expectedDsaContentType ||
            dsaNotice!.illegalityStatement.trim().length < 20 ||
            !dsaNotice!.goodFaithConfirmed)) {
      throw const FormatException('invalid_dsa_notice_intake');
    }
    if (!isDsaNotice && dsaNotice != null) {
      throw const FormatException('unexpected_dsa_notice_intake');
    }
    if (isProductSafetyNotice &&
        (productSafetyNotice == null ||
            !const {'dangerous_product', 'accident_or_injury'}
                .contains(productSafetyNotice!.issueKind) ||
            productSafetyNotice!.productIdentification.trim().length < 3 ||
            productSafetyNotice!.riskDescription.trim().length < 20 ||
            !productSafetyNotice!.safetyGuidanceAcknowledged)) {
      throw const FormatException('invalid_product_safety_intake');
    }
    if (!isProductSafetyNotice && productSafetyNotice != null) {
      throw const FormatException('unexpected_product_safety_intake');
    }
    if (isFeedback && feedbackContext == null) {
      throw const FormatException('invalid_feedback_intake');
    }
    final description = userDescription.trim();
    final summary = '$mainCategoryLabel: $subCategory.'
        '${description.isEmpty ? '' : ' $description'}';
    final requestId = context.requestId.trim();
    final itemId = context.itemId.trim();
    final profileContext =
        requestId.startsWith('profile:') || itemId.startsWith('profile:');
    final listingContext = requestId.startsWith('listing:');
    return <String, dynamic>{
      'caseType': route.caseType,
      'caseSubType': route.caseSubType,
      'summary': summary,
      'immediateDanger': safetyTriage.immediateDanger,
      'safetyTriage': safetyTriage.toMap(),
      'issueScope': issueScope.toMap(),
      if (isDsaNotice) 'dsaNotice': dsaNotice!.toMap(),
      if (isProductSafetyNotice)
        'productSafetyNotice': productSafetyNotice!.toMap(),
      if (privacyRightsRequest != null)
        'privacyRightsRequest': privacyRightsRequest.toMap(),
      if (isFeedback) 'feedbackContext': feedbackContext!.toMap(),
      if (!isFeedback &&
          !profileContext &&
          !listingContext &&
          requestId.isNotEmpty)
        'linkedBookingId': requestId,
      if (!isFeedback &&
          !profileContext &&
          itemId.isNotEmpty &&
          !itemId.contains(':'))
        'linkedListingId': itemId,
    };
  }

  SupportFlowResult withCanonicalCase(Map<String, dynamic> value) {
    final route = backendRoute;
    final isDsaNotice = route.caseType == 'moderation_content' &&
        route.caseSubType == 'illegal_content_notice';
    final isProductSafetyNotice = route.caseType == 'trust_safety' &&
        route.caseSubType == 'dangerous_item_or_injury';
    final isFeedback = route.caseType == 'general_help' &&
        route.caseSubType == 'feedback_or_improvement';
    final expectedFeedbackContext = _feedbackContexts[subCategory]?.toMap();
    final receivedFeedbackContext = value['feedbackContext'];
    final dsaNoticeNumber = value['dsaNoticeNumber']?.toString().trim();
    final dsaLocatorStatus = value['dsaNoticeLocatorStatus']?.toString().trim();
    final dsaLocatorPrompt = value['dsaNoticeLocatorPrompt']?.toString().trim();
    final productSafetyNoticeNumber =
        value['productSafetyNoticeNumber']?.toString().trim();
    final productSafetyTriageDueAt =
        value['productSafetyTriageDueAt']?.toString().trim();
    final productSafetyTriageDueDisplay =
        value['productSafetyTriageDueDisplay']?.toString().trim();
    final requiredTextFields = <String>[
      'id',
      'caseNumber',
      'status',
      'nextUpdateAt',
      'nextUpdateDisplay',
      'timezone',
      'operatingMode',
    ];
    if (requiredTextFields
            .any((field) => (value[field]?.toString().trim() ?? '').isEmpty) ||
        value['status'] != 'received' ||
        value['timezone'] != 'Europe/Berlin' ||
        value['operatingMode'] != 'simulation' ||
        value['caseType'] != route.caseType ||
        value['caseSubType'] != route.caseSubType ||
        (isDsaNotice
            ? !RegExp(r'^SIT-N-[A-HJ-NP-Z2-9]{12}$')
                .hasMatch(dsaNoticeNumber ?? '')
            : dsaNoticeNumber != null && dsaNoticeNumber.isNotEmpty) ||
        (isDsaNotice
            ? !const {'complete', 'needs_clarification'}
                .contains(dsaLocatorStatus)
            : dsaLocatorStatus != null && dsaLocatorStatus.isNotEmpty) ||
        (isDsaNotice &&
            dsaLocatorStatus == 'needs_clarification' &&
            ((dsaLocatorPrompt ?? '').isEmpty ||
                value['dsaNoticeLocatorMaySubmit'] != true)) ||
        (isDsaNotice &&
            dsaLocatorStatus == 'complete' &&
            ((dsaLocatorPrompt ?? '').isNotEmpty ||
                value['dsaNoticeLocatorMaySubmit'] != false)) ||
        (isProductSafetyNotice
            ? !RegExp(r'^SIT-P-[A-HJ-NP-Z2-9]{12}$')
                    .hasMatch(productSafetyNoticeNumber ?? '') ||
                DateTime.tryParse(productSafetyTriageDueAt ?? '') == null ||
                (productSafetyTriageDueDisplay ?? '').isEmpty
            : (productSafetyNoticeNumber ?? '').isNotEmpty ||
                (productSafetyTriageDueAt ?? '').isNotEmpty ||
                (productSafetyTriageDueDisplay ?? '').isNotEmpty) ||
        (isFeedback
            ? receivedFeedbackContext is! Map ||
                receivedFeedbackContext.length !=
                    expectedFeedbackContext!.length ||
                expectedFeedbackContext.entries.any((entry) =>
                    receivedFeedbackContext[entry.key] != entry.value)
            : receivedFeedbackContext != null) ||
        !RegExp(r'^SIT-[A-HJ-NP-Z2-9]{12}$')
            .hasMatch(value['caseNumber'].toString()) ||
        DateTime.tryParse(value['nextUpdateAt'].toString()) == null) {
      throw const FormatException('invalid_support_case_receipt');
    }
    return SupportFlowResult(
      mainCategory: mainCategory,
      subCategory: subCategory,
      userDescription: userDescription,
      context: context,
      safetyTriage: safetyTriage,
      issueScope: issueScope,
      dsaNotice: dsaNotice,
      productSafetyNotice: productSafetyNotice,
      handoverSafeAbortAcknowledged: handoverSafeAbortAcknowledged,
      handoverDoNotPayAcknowledged: handoverDoNotPayAcknowledged,
      handoverContactAttemptAcknowledged: handoverContactAttemptAcknowledged,
      canonicalCase: Map<String, dynamic>.unmodifiable(value),
    );
  }

  String get canonicalReceiptMessage {
    final supportCase = canonicalCase;
    if (supportCase == null) throw StateError('canonical_support_case_missing');
    final isDsaNotice = backendRoute.caseType == 'moderation_content' &&
        backendRoute.caseSubType == 'illegal_content_notice';
    final isProductSafetyNotice = backendRoute.caseType == 'trust_safety' &&
        backendRoute.caseSubType == 'dangerous_item_or_injury';
    final isFeedback = backendRoute.caseType == 'general_help' &&
        backendRoute.caseSubType == 'feedback_or_improvement';
    final routingLine = backendRoute.caseType == 'privacy_security'
        ? 'Deine Anfrage ist als eigener Datenschutz-Fall im '
            'Datenschutz-Prüfweg erfasst.'
        : isDsaNotice
            ? 'Deine Meldung ist im gesonderten DSA-Prüfweg als Notice '
                '${supportCase['dsaNoticeNumber']} erfasst. Die Eingangsbestätigung '
                'ist noch keine Entscheidung über die Rechtswidrigkeit.'
                '${supportCase['dsaNoticeLocatorStatus'] == 'needs_clarification' ? ' Der Fundort kann im Support-Fall gezielt ergänzt werden; die Meldung bleibt gespeichert.' : ''}'
            : isProductSafetyNotice
                ? 'Deine Produktsicherheitsmeldung '
                    '${supportCase['productSafetyNoticeNumber']} ist im '
                    'Trust-&-Safety-Schnelltriageweg erfasst. Nutze oder gib '
                    'den Gegenstand bis zur Prüfung nicht weiter. Die '
                    'Eingangsbestätigung ist noch keine technische oder '
                    'rechtliche Bewertung.'
                : isFeedback
                    ? 'Dein nicht dringendes Feedback wurde erfasst und dem '
                        'gewählten Produktbereich zugeordnet. Es löst keine '
                        'künstliche Eskalation und keine automatische '
                        'Produktentscheidung aus.'
                    : 'Der Fall ist serverseitig eingegangen. Ein finales Ergebnis ist '
                        'noch nicht entschieden.';
    final safetyLine = safetyTriage.immediateDanger
        ? 'Sicherheit geht vor: Bleib an einem sicheren Ort und nutze bei unmittelbarer Gefahr 110 oder 112. SIT ist kein Notfalldienst.'
        : routingLine;
    return 'Support-Fall ${supportCase['caseNumber']}\n'
        'Status: Eingegangen\n'
        'Nächstes Update spätestens: ${supportCase['nextUpdateDisplay']} Uhr (${supportCase['timezone']})\n'
        '$safetyLine\n'
        'Interner Testmodus: keine externe Nachricht und keine echte Zahlung, Erstattung oder Auszahlung.';
  }

  String get canonicalCaseNumber {
    final value = canonicalCase?['caseNumber']?.toString().trim() ?? '';
    if (value.isEmpty) throw StateError('canonical_support_case_missing');
    return value;
  }

  /// Konvertiert zu einer Map
  Map<String, dynamic> toMap() {
    return {
      'mainCategory': mainCategory,
      'subCategory': subCategory,
      'userDescription': userDescription,
      'immediateDanger': safetyTriage.immediateDanger,
      'safetyTriage': safetyTriage.toMap(),
      if (dsaNotice != null) 'dsaNotice': dsaNotice!.toMap(),
      if (productSafetyNotice != null)
        'productSafetyNotice': productSafetyNotice!.toMap(),
      if (handoverExceptionKind != null)
        'handoverException': toHandoverExceptionInput(),
      if (canonicalCase != null) 'supportCase': canonicalCase,
      ...context.toSupportContext(),
    };
  }

  /// Menschenlesbare Kategorie-Bezeichnung
  String get mainCategoryLabel {
    switch (mainCategory) {
      case 'handover':
        return 'Problem mit Übergabe';
      case 'return':
        return 'Problem mit Rückgabe';
      case 'item_condition':
        return 'Problem mit Artikel/Zustand';
      case 'payment':
        return 'Problem mit Zahlung';
      case 'person':
        return 'Problem mit anderer Person';
      case 'technical':
        return 'Technisches Problem';
      case 'feedback':
        return 'Feedback & Verbesserung';
      case 'privacy':
        return 'Datenschutz & Daten';
      case 'dsa_notice':
        return 'Rechtswidrigen Inhalt melden';
      case 'product_safety':
        return 'Produktsicherheit melden';
      case 'other':
        return 'Sonstiges';
      case 'profile_report':
        return 'Profil melden';
      default:
        return mainCategory;
    }
  }
}

typedef SupportCaseSubmitter = Future<Map<String, dynamic>> Function(
  Map<String, dynamic> intake,
  String idempotencyKey,
);

typedef HandoverExceptionSubmitter = Future<Map<String, dynamic>> Function(
  String bookingId,
  Map<String, dynamic> intake,
  String idempotencyKey,
);

/// Fullscreen Support-Kategorie-Auswahl-Seite
/// Wiederverwendbar aus Chat-Menü und Buchungsdetails
class SupportFlowScreen extends StatefulWidget {
  final SupportFlowContext context;
  final AuthSessionOwner? owner;
  final SupportCaseSubmitter? submitter;
  final HandoverExceptionSubmitter? handoverExceptionSubmitter;
  final String initialDescription;

  const SupportFlowScreen({
    super.key,
    required this.context,
    this.owner,
    this.submitter,
    this.handoverExceptionSubmitter,
    this.initialDescription = '',
  });

  /// Legacy-Konstruktor für Kompatibilität mit bestehendem Code
  factory SupportFlowScreen.legacy({
    required String itemTitle,
    required String itemId,
    required String requestId,
    required String bookingStatus,
  }) {
    return SupportFlowScreen(
      context: SupportFlowContext(
        itemTitle: itemTitle,
        itemId: itemId,
        requestId: requestId,
        bookingStatus: bookingStatus,
        source: SupportFlowSource.bookingChat,
        role: SupportFlowRole.renter,
      ),
    );
  }

  @override
  State<SupportFlowScreen> createState() => _SupportFlowScreenState();
}

class _SupportFlowScreenState extends State<SupportFlowScreen> {
  late final SupportPrincipalController _principal;
  Route<dynamic>? _screenRoute;
  VoidCallback? _releaseScreenRoute;
  late final String _submissionIdempotencyKey;
  bool? _immediateDanger;
  bool _safetyGuidanceAcknowledged = false;
  bool? _singleIssueConfirmed;
  bool _separationGuidanceShown = false;
  String? _selectedMainCategory;
  String? _selectedSubCategory;
  String? _selectedDetailSubCategory;
  final _descriptionController = TextEditingController();
  final _dsaContentLocatorController = TextEditingController();
  final _dsaLegalBasisController = TextEditingController();
  bool _dsaGoodFaithConfirmed = false;
  final _productIdentificationController = TextEditingController();
  bool _productSafetyGuidanceAcknowledged = false;
  bool _handoverSafeAbortAcknowledged = false;
  bool _handoverDoNotPayAcknowledged = false;
  bool _handoverContactAttemptAcknowledged = false;
  bool _sendingSupport = false;
  bool _cardsHidden = false;

  bool get _showSafetyQuestion => _immediateDanger == null;
  bool get _showSafetyGuidance =>
      _immediateDanger == true && !_safetyGuidanceAcknowledged;
  bool get _showIssueScopeQuestion =>
      !_showSafetyQuestion &&
      !_showSafetyGuidance &&
      _singleIssueConfirmed == null;
  bool get _showIssueSeparationGuidance => _singleIssueConfirmed == false;
  bool get _isDsaNoticeSelection =>
      _selectedMainCategory == 'dsa_notice' && _selectedSubCategory != null;
  bool get _isProductSafetySelection =>
      _selectedMainCategory == 'product_safety' && _selectedSubCategory != null;
  bool get _hasBookingContext {
    final requestId = widget.context.requestId.trim();
    return requestId.isNotEmpty &&
        !requestId.startsWith('profile:') &&
        !requestId.startsWith('listing:');
  }

  bool get _isHandoverExceptionSelection {
    if (_immediateDanger == true || !_hasBookingContext) return false;
    if (_selectedMainCategory == 'handover' &&
        const {
          'Mieter ist nicht erschienen',
          'Vermieter ist nicht erschienen',
          'Gegenpartei öffnet nicht / reagiert nicht',
          'Artikel ist nicht wie beschrieben',
          'Kaution oder Sicherheitszahlung wird verlangt',
        }.contains(_selectedSubCategory)) {
      return true;
    }
    return _selectedMainCategory == 'item_condition' &&
        const {
          'Artikel entspricht nicht der Beschreibung',
          'Falscher Artikel übergeben',
          'Schaden wurde schon vor Übergabe bemerkt',
        }.contains(_selectedSubCategory);
  }

  bool get _handoverExceptionReady {
    if (!_isHandoverExceptionSelection) return true;
    if (_descriptionController.text.trim().length < 10) return false;
    if (const {
      'Artikel ist nicht wie beschrieben',
      'Artikel entspricht nicht der Beschreibung',
      'Falscher Artikel übergeben',
      'Schaden wurde schon vor Übergabe bemerkt',
    }.contains(_selectedSubCategory)) {
      return _handoverSafeAbortAcknowledged;
    }
    if (_selectedSubCategory ==
        'Kaution oder Sicherheitszahlung wird verlangt') {
      return _handoverDoNotPayAcknowledged;
    }
    return _handoverContactAttemptAcknowledged;
  }

  bool get _dsaNoticeReady =>
      !_isDsaNoticeSelection ||
      _immediateDanger == true ||
      (_descriptionController.text.trim().length >= 20 &&
          _dsaGoodFaithConfirmed);
  bool get _productSafetyNoticeReady =>
      !_isProductSafetySelection ||
      _immediateDanger == true ||
      (_productIdentificationController.text.trim().length >= 3 &&
          _descriptionController.text.trim().length >= 20 &&
          _productSafetyGuidanceAcknowledged);
  bool get _submissionReady =>
      _dsaNoticeReady && _productSafetyNoticeReady && _handoverExceptionReady;

  @override
  void initState() {
    super.initState();
    _principal = SupportPrincipalController(expectedOwner: widget.owner)
      ..addListener(_principalChanged);
    _descriptionController.text = widget.initialDescription.trim();
    _productIdentificationController.text = widget.context.itemTitle.trim();
    final nonce = Random.secure().nextInt(0x7fffffff).toRadixString(16);
    _submissionIdempotencyKey =
        'support_intake_${DateTime.now().microsecondsSinceEpoch}_$nonce';
  }

  void _principalChanged() {
    if (!mounted) return;
    if (_principal.invalidated) {
      _descriptionController.clear();
      _dsaContentLocatorController.clear();
      _dsaLegalBasisController.clear();
      _productIdentificationController.clear();
    }
    setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (!identical(route, _screenRoute)) {
      _releaseScreenRoute?.call();
      _screenRoute = route;
      _releaseScreenRoute =
          route == null ? null : _principal.trackScreenRoute(route);
    }
  }

  @override
  void dispose() {
    _principal.removeListener(_principalChanged);
    _releaseScreenRoute?.call();
    _principal.dispose();
    _descriptionController.dispose();
    _dsaContentLocatorController.dispose();
    _dsaLegalBasisController.dispose();
    _productIdentificationController.dispose();
    super.dispose();
  }

  // Menschliche Titel/Sublines pro Hauptkategorie
  static const _categoryTitles = <String, Map<String, String>>{
    'handover': {
      'title': 'Hast du ein Problem mit der Übergabe?',
      'subline':
          'Wir helfen dir gerne dabei. Wähle den Grund, der am besten passt.',
    },
    'return': {
      'title': 'Hast du ein Problem mit der Rückgabe?',
      'subline':
          'Wir helfen dir gerne dabei. Wähle den genauesten Grund, damit wir schneller reagieren können.',
    },
    'item_condition': {
      'title': 'Gibt es ein Problem mit dem Artikel?',
      'subline':
          'Beschreibe zuerst den passenden Grund. So kann der Support den Zustand besser einordnen.',
    },
    'payment': {
      'title': 'Gibt es ein Problem mit der Zahlung?',
      'subline':
          'Wähle den passenden Zahlungsgrund, damit wir den Fall schneller prüfen können.',
    },
    'person': {
      'title': 'Gibt es ein Problem mit der anderen Person?',
      'subline':
          'Wenn du dich unwohl fühlst oder etwas nicht stimmt, wähle bitte den genauesten Grund.',
    },
    'technical': {
      'title': 'Gibt es ein technisches Problem?',
      'subline':
          'Wähle, was nicht funktioniert. So können wir den Fehler schneller finden.',
    },
    'feedback': {
      'title': 'Möchtest du nicht dringendes Feedback geben?',
      'subline': 'Wähle den Produktbereich. Dringende Probleme und Risiken '
          'gehören in die jeweilige Problem- oder Sicherheitskategorie.',
    },
    'privacy': {
      'title': 'Geht es um Datenschutz oder deine Daten?',
      'subline': 'Wähle den genauen Anlass. Die Anfrage wird als eigener '
          'Datenschutz-Fall geprüft.',
    },
    'dsa_notice': {
      'title': 'Welcher Inhalt soll rechtlich geprüft werden?',
      'subline': 'Diese Meldung wird als eigene DSA-Notice erfasst und nicht '
          'als allgemeiner Buchungsfall behandelt.',
    },
    'product_safety': {
      'title': 'Was möchtest du zur Produktsicherheit melden?',
      'subline': 'Dieser elektronische Kontakt führt die Meldung in einen '
          'eigenen Trust-&-Safety-Schnelltriageweg.',
    },
    'other': {
      'title': 'Wobei brauchst du Hilfe?',
      'subline':
          'Wähle den passendsten Grund oder beschreibe dein Anliegen im nächsten Schritt.',
    },
  };

  static const _categories = <String, _SupportCategory>{
    'handover': _SupportCategory(
      icon: Icons.inventory_2_outlined,
      label: 'Problem mit Übergabe',
      subcategories: [
        'Mieter ist nicht erschienen',
        'Vermieter ist nicht erschienen',
        'Gegenpartei öffnet nicht / reagiert nicht',
        'Übergabeort ist unklar',
        'Falsche Person ist erschienen',
        'Artikel ist nicht wie beschrieben',
        'Kaution oder Sicherheitszahlung wird verlangt',
        'Vermieter verweigert Übergabe',
        'Mieter verweigert Bestätigung',
        'QR-Code funktioniert nicht',
        '6-stelliger Code funktioniert nicht',
        'Kamera/Fotos funktionieren nicht',
        'Ich fühle mich unsicher vor Ort',
        'Sonstiges Übergabeproblem',
      ],
    ),
    'return': _SupportCategory(
      icon: Icons.assignment_return_outlined,
      label: 'Problem mit Rückgabe',
      subcategories: [
        'Mieter ist nicht zur Rückgabe erschienen',
        'Vermieter ist nicht zur Rückgabe erschienen',
        'Gegenpartei reagiert nicht',
        'Rückgabeort ist unklar',
        'Artikel wurde beschädigt zurückgegeben',
        'Artikel fehlt / wurde nicht zurückgegeben',
        'Rückgabe wird verweigert',
        'QR-Code funktioniert nicht',
        '6-stelliger Rückgabecode funktioniert nicht',
        'Rückgabefotos funktionieren nicht',
        'Ich fühle mich unsicher vor Ort',
        'Sonstiges Rückgabeproblem',
      ],
    ),
    'item_condition': _SupportCategory(
      icon: Icons.warning_amber_outlined,
      label: 'Problem mit Artikel/Zustand',
      subcategories: [
        'Artikel funktioniert nicht',
        'Artikel ist beschädigt',
        'Zubehör fehlt',
        'Artikel entspricht nicht der Beschreibung',
        'Artikel war schmutzig',
        'Falscher Artikel übergeben',
        'Schaden wurde schon vor Übergabe bemerkt',
        'Schaden wurde nach Rückgabe gemeldet',
        'Sonstiges Artikelproblem',
      ],
    ),
    'payment': _SupportCategory(
      icon: Icons.payments_outlined,
      label: 'Problem mit Zahlung',
      subcategories: [
        'Preis stimmt nicht',
        'Gesamtbetrag unklar',
        'Zahlung wurde doppelt angezeigt',
        'Rückerstattung unklar',
        'Auszahlung unklar',
        'Stornierung und Zahlung unklar',
        'Gebühren unklar',
        'Sonstiges Zahlungsproblem',
      ],
    ),
    'person': _SupportCategory(
      icon: Icons.person_off_outlined,
      label: 'Problem mit anderer Person',
      subcategories: [
        'Unangemessenes Verhalten',
        'Drohung / Druck',
        'Beleidigung',
        'Verdächtiges Verhalten',
        'Profil wirkt falsch',
        'Andere Person will außerhalb von SIT abwickeln',
        'Sicherheitsgefühl vor Ort schlecht',
        'Sonstiges Personenproblem',
      ],
    ),
    'technical': _SupportCategory(
      icon: Icons.bug_report_outlined,
      label: 'Technisches Problem',
      subcategories: [
        'Chat funktioniert nicht',
        'Kamera funktioniert nicht',
        'Datei hochladen funktioniert nicht',
        'Standort senden funktioniert nicht',
        'QR-Code Scanner funktioniert nicht',
        'App lädt nicht',
        'Button reagiert nicht',
        'Sonstiges technisches Problem',
      ],
    ),
    'feedback': _SupportCategory(
      icon: Icons.lightbulb_outline,
      label: 'Feedback & Verbesserung',
      subcategories: [
        'Verbesserung für App und Bedienung',
        'Feedback zu Anzeigen und Katalog',
        'Feedback zu Buchung und Terminen',
        'Feedback zu Übergabe und Rückgabe',
        'Feedback zu Zahlung und Dokumenten',
        'Feedback zu Nachrichten und Benachrichtigungen',
        'Feedback zu Profil und Konto',
        'Feedback zur Barrierefreiheit',
        'Nicht dringende Erklärung gewünscht',
        'Anderes nicht dringendes Feedback',
      ],
    ),
    'privacy': _SupportCategory(
      icon: Icons.privacy_tip_outlined,
      label: 'Datenschutz & Daten',
      subcategories: [
        'Auskunft oder Kopie meiner Daten',
        'Daten übertragen',
        'Daten berichtigen',
        'Daten löschen',
        'Verarbeitung widersprechen',
        'Verarbeitung einschränken',
        'Meine Daten wurden unbefugt offengelegt',
        'Mögliche Datenschutzverletzung melden',
        'Daten gingen an falsches Konto oder falsche Person',
        'Identität für Datenschutzanfrage bestätigen',
      ],
    ),
    'dsa_notice': _SupportCategory(
      icon: Icons.gavel_outlined,
      label: 'Rechtswidrigen Inhalt melden',
      subcategories: [
        'Anzeige / Artikel',
        'Profil',
        'Bewertung',
        'Nachricht / Chat',
        'Anderer Inhalt',
      ],
    ),
    'product_safety': _SupportCategory(
      icon: Icons.health_and_safety_outlined,
      label: 'Produktsicherheit melden',
      subcategories: [
        'Möglicherweise gefährliches Produkt',
        'Unfall oder Verletzung durch Produkt',
      ],
    ),
    'other': _SupportCategory(
      icon: Icons.more_horiz_rounded,
      label: 'Sonstiges',
      subcategories: [
        'Ich bin unsicher, was ich tun soll',
        'Allgemeine Frage zur Buchung',
        'Ich brauche Hilfe vom Support',
        'Profil melden',
        'Anderes Problem',
      ],
    ),
  };

  bool get _isProfileContext =>
      widget.context.requestId.startsWith('profile:') ||
      widget.context.itemId.startsWith('profile:');

  bool get _needsProfileReasonStep =>
      _isProfileContext &&
      _selectedMainCategory == 'other' &&
      _selectedSubCategory == 'Profil melden';

  static const List<String> _profileReportReasons = [
    'Falsche Identität',
    'Unangemessenes Verhalten',
    'Betrugsverdacht',
    'Beleidigende/gefährliche Inhalte',
    'Spam',
    'Sonstiges',
  ];

  void _handleBack() {
    if (_selectedDetailSubCategory != null) {
      setState(() => _selectedDetailSubCategory = null);
    } else if (_selectedSubCategory != null) {
      setState(() => _selectedSubCategory = null);
    } else if (_selectedMainCategory != null) {
      setState(() => _selectedMainCategory = null);
    } else if (_singleIssueConfirmed != null) {
      setState(() {
        _singleIssueConfirmed = null;
        _separationGuidanceShown = false;
      });
    } else if (_immediateDanger != null) {
      setState(() {
        _immediateDanger = null;
        _safetyGuidanceAcknowledged = false;
      });
    } else {
      Navigator.of(context).pop();
    }
  }

  String _currentTitle() {
    if (_showSafetyQuestion) return 'Bist du gerade in unmittelbarer Gefahr?';
    if (_showSafetyGuidance) return 'Sicherheit geht jetzt vor';
    if (_showIssueScopeQuestion) return 'Geht es um genau ein Problem?';
    if (_showIssueSeparationGuidance) return 'Trenne die Probleme zuerst';
    if (_selectedDetailSubCategory != null) {
      return 'Beschreibe kurz, was passiert ist';
    }
    if (_needsProfileReasonStep) {
      return 'Warum möchtest du dieses Profil melden?';
    }
    if (_selectedSubCategory != null) {
      if (_isDsaNoticeSelection) return 'Angaben zur Meldung';
      if (_isProductSafetySelection) return 'Produktsicherheit melden';
      return 'Beschreibe kurz, was passiert ist';
    }
    if (_selectedMainCategory != null) {
      return _categoryTitles[_selectedMainCategory]?['title'] ??
          'Wähle einen Grund';
    }
    return 'Wobei brauchst du Hilfe?';
  }

  String _currentSubline() {
    if (_showSafetyQuestion) {
      return 'Beantworte diese Frage zuerst. Danach kannst du dein Anliegen melden.';
    }
    if (_showSafetyGuidance) {
      return 'Beende zuerst die gefährliche Situation. SIT ist kein Notfalldienst.';
    }
    if (_showIssueScopeQuestion) {
      return 'Unabhängige Probleme brauchen getrennte Support-Fälle.';
    }
    if (_showIssueSeparationGuidance) {
      return 'Wähle für diesen Fall nur eines der Probleme aus.';
    }
    if (_selectedDetailSubCategory != null) {
      return 'Prüfe die Auswahl kurz und beschreibe danach den Fall für den Support.';
    }
    if (_needsProfileReasonStep) {
      return 'Wähle den genauesten Grund, damit der Support den Fall richtig einordnen kann.';
    }
    if (_selectedSubCategory != null) {
      if (_isDsaNoticeSelection) {
        return 'Nenne den exakten Inhalt und begründe, warum du ihn für '
            'rechtswidrig hältst. Die Meldung allein entscheidet noch nichts.';
      }
      if (_isProductSafetySelection) {
        return 'Nutze das Produkt nicht weiter. Beschreibe Produkt und Gefahr '
            'so konkret wie möglich; bei akuter Gefahr oder Verletzung rufe 112.';
      }
      return 'Je genauer du es beschreibst, desto schneller kann dir der Support helfen.';
    }
    if (_selectedMainCategory != null) {
      return _categoryTitles[_selectedMainCategory]?['subline'] ??
          'Wähle den genauesten Grund.';
    }
    return 'Wähle den genauesten Grund, damit wir dir schneller helfen können.';
  }

  void _toggleCardsVisibility() {
    setState(() => _cardsHidden = !_cardsHidden);
    // Nach 2.5s automatisch wieder einblenden
    if (_cardsHidden) {
      Future.delayed(const Duration(milliseconds: 2500), () {
        if (mounted && _cardsHidden) setState(() => _cardsHidden = false);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_principal.invalidated) {
      return const Scaffold(
          body: Center(
              child: Text(
        'Die Sitzung hat sich geändert. Bitte öffne den Support erneut.',
        key: ValueKey('support_principal_changed'),
      )));
    }
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final dark = theme.colorScheme.secondary;
    final isDark = theme.brightness == Brightness.dark;
    final isSafetyPage = _showSafetyQuestion || _showSafetyGuidance;
    final isIssueScopePage =
        _showIssueScopeQuestion || _showIssueSeparationGuidance;
    final isMainCategoryPage = !isSafetyPage &&
        !isIssueScopePage &&
        _selectedMainCategory == null &&
        _selectedSubCategory == null;
    final isSubcategoryPage =
        _selectedMainCategory != null && _selectedSubCategory == null;
    final shouldCenterTitle = isSafetyPage ||
        isIssueScopePage ||
        isMainCategoryPage ||
        isSubcategoryPage;

    return Scaffold(
      backgroundColor:
          isDark ? Colors.transparent : AppTheme.surfaceMuted(context),
      body: GestureDetector(
        // Tap außerhalb der Cards = Hintergrund-Preview
        onTap: () {
          // Nur im Dark Theme und nur auf Hauptkategorie/Subkategorie-Seite aktivieren
          if (isDark &&
              !isSafetyPage &&
              !isIssueScopePage &&
              _selectedSubCategory == null) {
            _toggleCardsVisibility();
          }
        },
        behavior: HitTestBehavior.translucent,
        child: Stack(
          children: [
            // SIT Background - Support background
            if (isDark)
              Positioned.fill(
                child: Image.asset(
                  'assets/images/Hintergrund_Support.png',
                  fit: BoxFit.cover,
                  alignment: Alignment.topCenter,
                ),
              ),
            if (!isDark)
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        AppTheme.surfaceMuted(context),
                        AppTheme.surfacePrimary(context),
                      ],
                    ),
                  ),
                ),
              ),
            // Base blur - reduziert bei Background-Preview
            Positioned.fill(
              child: AnimatedOpacity(
                opacity: _cardsHidden ? 0.0 : 1.0,
                duration: const Duration(milliseconds: 300),
                child: ClipRect(
                  child: BackdropFilter(
                    filter: ImageFilter.blur(
                        sigmaX: isDark ? 14 : 6, sigmaY: isDark ? 14 : 6),
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
            ),
            // Leichter Blur bleibt bei Background-Preview für sanften Look
            if (_cardsHidden)
              Positioned.fill(
                child: ClipRect(
                  child: BackdropFilter(
                    filter: ImageFilter.blur(
                        sigmaX: isDark ? 2 : 1, sigmaY: isDark ? 2 : 1),
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
            // Dunkler Color tint overlay - stark reduziert bei Background-Preview
            Positioned.fill(
              child: AnimatedOpacity(
                opacity: _cardsHidden ? 0.15 : 1.0,
                duration: const Duration(milliseconds: 300),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: isDark
                          ? [
                              Color.lerp(primary, BrandColors.logoGradientStart,
                                      0.35)!
                                  .withValues(alpha: 0.45),
                              Color.lerp(
                                      dark, BrandColors.logoGradientEnd, 0.55)!
                                  .withValues(alpha: 0.38),
                            ]
                          : [
                              BrandColors.primary.withValues(alpha: 0.06),
                              const Color(0xFFF8FAFC),
                            ],
                    ),
                  ),
                ),
              ),
            ),
            // Top gradient overlay - reduziert bei Background-Preview
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedOpacity(
                  opacity: _cardsHidden ? 0.2 : 1.0,
                  duration: const Duration(milliseconds: 300),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: isDark
                            ? [
                                Colors.black.withValues(alpha: 0.78),
                                Colors.black.withValues(alpha: 0.62),
                                Colors.black.withValues(alpha: 0.38),
                                Colors.black.withValues(alpha: 0.18),
                                Colors.transparent,
                              ]
                            : [
                                Colors.white.withValues(alpha: 0.68),
                                Colors.white.withValues(alpha: 0.38),
                                Colors.transparent,
                                Colors.transparent,
                                Colors.transparent,
                              ],
                        stops: const [0.0, 0.06, 0.14, 0.24, 0.40],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Bottom gradient overlay - reduziert bei Background-Preview
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedOpacity(
                  opacity: _cardsHidden ? 0.2 : 1.0,
                  duration: const Duration(milliseconds: 300),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: isDark
                            ? [
                                Colors.transparent,
                                Colors.transparent,
                                Colors.black.withValues(alpha: 0.12),
                                Colors.black.withValues(alpha: 0.28),
                                Colors.black.withValues(alpha: 0.48),
                                Colors.black.withValues(alpha: 0.65),
                                Colors.black.withValues(alpha: 0.80),
                              ]
                            : [
                                Colors.transparent,
                                Colors.transparent,
                                Colors.white.withValues(alpha: 0.12),
                                Colors.white.withValues(alpha: 0.26),
                                Colors.white.withValues(alpha: 0.42),
                                Colors.white.withValues(alpha: 0.56),
                                Colors.white.withValues(alpha: 0.72),
                              ],
                        stops: const [0.0, 0.50, 0.64, 0.75, 0.84, 0.92, 1.0],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // Content - mit AnimatedOpacity für Card-Hide-Feature
            SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header mit Back-Button - immer sichtbar
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    child: Row(
                      children: [
                        IconButton(
                          tooltip: MaterialLocalizations.of(context)
                              .backButtonTooltip,
                          onPressed: _handleBack,
                          icon: Icon(
                            Icons.arrow_back_ios_new_rounded,
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.9)
                                : AppTheme.textPrimary(context),
                            size: 20,
                          ),
                        ),
                        const Spacer(),
                        // SIT Logo
                        ClipOval(
                          child: Image.asset(
                            'assets/images/icononly_transparent_nobuffer.png',
                            width: 32,
                            height: 32,
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(width: 16),
                      ],
                    ),
                  ),
                  // Titel-Sektion - zentriert auf Hauptkategorie- und Subkategorie-Seite
                  AnimatedOpacity(
                    opacity: _cardsHidden ? 0.0 : 1.0,
                    duration: const Duration(milliseconds: 250),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        crossAxisAlignment: shouldCenterTitle
                            ? CrossAxisAlignment.center
                            : CrossAxisAlignment.start,
                        children: [
                          Text(
                            _currentTitle(),
                            textAlign: shouldCenterTitle
                                ? TextAlign.center
                                : TextAlign.start,
                            style: TextStyle(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.95)
                                  : AppTheme.textPrimary(context),
                              fontWeight: FontWeight.w800,
                              fontSize: shouldCenterTitle ? 26 : 24,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _currentSubline(),
                            textAlign: shouldCenterTitle
                                ? TextAlign.center
                                : TextAlign.start,
                            style: TextStyle(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.55)
                                  : AppTheme.textBody(context),
                              fontWeight: FontWeight.w500,
                              fontSize: 14,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Buchungs-Kontextkarte - immer sichtbar für Kontext
                  if (!isSafetyPage &&
                      (widget.context.requestId.isNotEmpty ||
                          widget.context.itemTitle.isNotEmpty))
                    AnimatedOpacity(
                      opacity: _cardsHidden ? 0.15 : 1.0,
                      duration: const Duration(milliseconds: 250),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: _DistinctBookingContextCard(
                          itemTitle: widget.context.itemTitle,
                          itemId: widget.context.itemId,
                          requestId: widget.context.requestId,
                          bookingStatus: widget.context.bookingStatus,
                          otherUserName: widget.context.otherUserName,
                          itemImageUrl: widget.context.itemImageUrl,
                          otherUserImageUrl: widget.context.otherUserImageUrl,
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  // Content: Categories oder Description
                  Expanded(
                    child: AnimatedOpacity(
                      opacity: _cardsHidden ? 0.0 : 1.0,
                      duration: const Duration(milliseconds: 250),
                      child: IgnorePointer(
                        ignoring: _cardsHidden,
                        child: _showSafetyQuestion
                            ? _buildSafetyQuestion()
                            : _showSafetyGuidance
                                ? _buildSafetyGuidance()
                                : _showIssueScopeQuestion
                                    ? _buildIssueScopeQuestion()
                                    : _showIssueSeparationGuidance
                                        ? _buildIssueSeparationGuidance()
                                        : _selectedDetailSubCategory != null
                                            ? _buildDescriptionStep()
                                            : _needsProfileReasonStep
                                                ? _buildProfileReportReasons()
                                                : _selectedSubCategory != null
                                                    ? _buildDescriptionStep()
                                                    : _selectedMainCategory ==
                                                            null
                                                        ? _buildMainCategories()
                                                        : _buildSubcategories(
                                                            _selectedMainCategory!),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Hint bei versteckten Cards
            if (_cardsHidden)
              Positioned(
                bottom: MediaQuery.of(context).padding.bottom + 24,
                left: 0,
                right: 0,
                child: Center(
                  child: AnimatedOpacity(
                    opacity: _cardsHidden ? 1.0 : 0.0,
                    duration: const Duration(milliseconds: 200),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: isDark
                            ? Colors.black.withValues(alpha: 0.55)
                            : AppTheme.surfacePrimary(context),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.12)
                                : AppTheme.glassStroke(context)),
                      ),
                      child: Text(
                        'Tippe erneut, um fortzufahren',
                        style: TextStyle(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.8)
                              : AppTheme.textPrimary(context),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSafetyQuestion() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      key: const ValueKey('support_safety_question'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        _SupportSafetyPanel(
          icon: Icons.health_and_safety_outlined,
          title: 'Akute Sicherheit vor dem normalen Ablauf',
          body:
              'Wenn du in Gefahr bist oder unsicher bist, zeigen wir dir zuerst die wichtigsten Sicherheitshinweise.',
          isDark: isDark,
        ),
        const SizedBox(height: 20),
        _GlassySubcategoryCard(
          key: const ValueKey('support_safety_answer_danger'),
          label: 'Ja – oder ich bin unsicher',
          onTap: () => setState(() => _immediateDanger = true),
        ),
        const SizedBox(height: 12),
        _GlassySubcategoryCard(
          key: const ValueKey('support_safety_answer_no_danger'),
          label: 'Nein, aktuell nicht',
          onTap: () => setState(() => _immediateDanger = false),
        ),
      ],
    );
  }

  Widget _buildSafetyGuidance() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      key: const ValueKey('support_safety_guidance'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        _SupportSafetyPanel(
          icon: Icons.warning_amber_rounded,
          title: 'Beende die Begegnung und geh an einen sicheren Ort.',
          body:
              'Übergib oder übernimm den Gegenstand vorerst nicht. Bei unmittelbarer Gefahr: Polizei 110 oder Rettungsdienst/Feuerwehr 112. SIT ist kein Notfalldienst.',
          isDark: isDark,
          urgent: true,
        ),
        const SizedBox(height: 14),
        _SupportSafetyPanel(
          icon: Icons.privacy_tip_outlined,
          title: 'Dokumentiere nur, wenn es gefahrlos möglich ist.',
          body:
              'Teile im Support keine Live-Standorte, Passwörter, PINs oder Zahlungsdaten.',
          isDark: isDark,
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 52,
          child: FilledButton(
            key: const ValueKey('support_safety_continue'),
            onPressed: () => setState(() => _safetyGuidanceAcknowledged = true),
            child: const Text('Hinweise verstanden – Bericht fortsetzen'),
          ),
        ),
      ],
    );
  }

  Widget _buildIssueScopeQuestion() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      key: const ValueKey('support_issue_scope_question'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        _SupportSafetyPanel(
          icon: Icons.call_split_outlined,
          title: 'Ein Problem pro Support-Fall',
          body:
              'So bleiben Zuständigkeit, Fristen, Entscheidungen und der Prüfverlauf für jedes Problem eindeutig.',
          isDark: isDark,
        ),
        const SizedBox(height: 20),
        _GlassySubcategoryCard(
          key: const ValueKey('support_issue_scope_single'),
          label: 'Ja, genau ein Problem',
          onTap: () => setState(() {
            _singleIssueConfirmed = true;
            _separationGuidanceShown = false;
          }),
        ),
        const SizedBox(height: 12),
        _GlassySubcategoryCard(
          key: const ValueKey('support_issue_scope_multiple'),
          label: 'Nein, es sind mehrere Probleme',
          onTap: () => setState(() {
            _singleIssueConfirmed = false;
            _separationGuidanceShown = true;
          }),
        ),
      ],
    );
  }

  Widget _buildIssueSeparationGuidance() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      key: const ValueKey('support_issue_separation_guidance'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        _SupportSafetyPanel(
          icon: Icons.account_tree_outlined,
          title: 'Erstelle für jedes unabhängige Problem einen eigenen Fall.',
          body:
              'Wähle jetzt das erste Problem aus. Nach dem Absenden kannst du für das nächste Problem einen weiteren Support-Fall erstellen.',
          isDark: isDark,
        ),
        const SizedBox(height: 20),
        SizedBox(
          height: 52,
          child: FilledButton(
            key: const ValueKey('support_issue_separation_continue'),
            onPressed: () => setState(() => _singleIssueConfirmed = true),
            child: const Text('Ein Problem für diesen Fall auswählen'),
          ),
        ),
      ],
    );
  }

  Widget _buildMainCategories() {
    // Kategorien gleichmäßig verteilt über verfügbaren Bereich
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableHeight = constraints.maxHeight;
        final cardCount = _categories.length;
        // Mindestens 54px pro Card, plus dynamischen Abstand
        final minCardHeight = 58.0;
        final totalMinHeight = cardCount * minCardHeight;
        final dynamicSpacing =
            ((availableHeight - totalMinHeight - 32) / (cardCount - 1))
                .clamp(10.0, 22.0);

        return ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          physics: availableHeight > totalMinHeight + (cardCount - 1) * 10
              ? const NeverScrollableScrollPhysics()
              : const AlwaysScrollableScrollPhysics(),
          itemCount: _categories.length,
          separatorBuilder: (_, __) => SizedBox(height: dynamicSpacing),
          itemBuilder: (context, index) {
            final key = _categories.keys.elementAt(index);
            final cat = _categories[key]!;
            return _GlassySupportCategoryCard(
              icon: cat.icon,
              label: cat.label,
              showChevron: true,
              onTap: () => setState(() => _selectedMainCategory = key),
            );
          },
        );
      },
    );
  }

  Widget _buildSubcategories(String mainKey) {
    final cat = _categories[mainKey]!;
    var subcategories = mainKey == 'other' && !_isProfileContext
        ? cat.subcategories.where((sub) => sub != 'Profil melden').toList()
        : List<String>.of(cat.subcategories);
    if (!_hasBookingContext) {
      const bookingBound = {
        'Mieter ist nicht erschienen',
        'Vermieter ist nicht erschienen',
        'Gegenpartei öffnet nicht / reagiert nicht',
        'Artikel ist nicht wie beschrieben',
        'Kaution oder Sicherheitszahlung wird verlangt',
        'Artikel entspricht nicht der Beschreibung',
        'Falscher Artikel übergeben',
        'Schaden wurde schon vor Übergabe bemerkt',
      };
      subcategories =
          subcategories.where((sub) => !bookingBound.contains(sub)).toList();
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      itemCount: subcategories.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final sub = subcategories[index];
        return _GlassySubcategoryCard(
          label: sub,
          onTap: () => setState(() {
            _selectedSubCategory = sub;
            _selectedDetailSubCategory = null;
            _handoverSafeAbortAcknowledged = false;
            _handoverDoNotPayAcknowledged = false;
            _handoverContactAttemptAcknowledged = false;
          }),
        );
      },
    );
  }

  Widget _buildProfileReportReasons() {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      itemCount: _profileReportReasons.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final reason = _profileReportReasons[index];
        return _GlassySubcategoryCard(
          label: reason,
          onTap: () => setState(() => _selectedDetailSubCategory = reason),
        );
      },
    );
  }

  Widget _supportTextField({
    required TextEditingController controller,
    required String fieldKey,
    required String label,
    required String hint,
    required int maxLength,
    int minLines = 1,
    int maxLines = 4,
  }) {
    return TextField(
      key: ValueKey(fieldKey),
      controller: controller,
      maxLength: maxLength,
      minLines: minLines,
      maxLines: maxLines,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        alignLabelWithHint: true,
        border: const OutlineInputBorder(),
      ),
    );
  }

  Widget _buildDsaNoticeFields() {
    return ListView(
      key: const ValueKey('support_dsa_notice_fields'),
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Pflichtangaben für die gesonderte Notice-and-Action-Prüfung',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        _supportTextField(
          controller: _dsaContentLocatorController,
          fieldKey: 'support_dsa_content_locator',
          label: 'Exakter Fundort des Inhalts (falls schon bekannt)',
          hint: 'Zum Beispiel URL, Anzeigen-ID oder Nachrichtenreferenz',
          maxLength: 2000,
          maxLines: 3,
        ),
        const SizedBox(height: 12),
        const Text(
          'Du kannst die Meldung auch ohne exakten Fundort absenden. Sie erhält '
          'sofort eine Notice-ID; den Fundort kannst du danach im Support-Fall '
          'gezielt ergänzen.',
          style: TextStyle(fontSize: 12),
        ),
        const SizedBox(height: 12),
        _supportTextField(
          controller: _descriptionController,
          fieldKey: 'support_dsa_illegality_statement',
          label: 'Warum ist genau dieser Inhalt rechtswidrig? *',
          hint: 'Begründe konkret, welches Recht verletzt sein könnte.',
          maxLength: 8000,
          minLines: 4,
          maxLines: 8,
        ),
        const SizedBox(height: 12),
        _supportTextField(
          controller: _dsaLegalBasisController,
          fieldKey: 'support_dsa_legal_basis',
          label: 'Rechtsgrundlage oder betroffenes Land (optional)',
          hint: 'Falls bekannt: Vorschrift, Rechtsgrundlage oder Staat',
          maxLength: 2000,
          maxLines: 4,
        ),
        CheckboxListTile(
          key: const ValueKey('support_dsa_good_faith'),
          value: _dsaGoodFaithConfirmed,
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'Ich bestätige nach bestem Wissen, dass die Angaben richtig '
            'und vollständig sind. *',
          ),
          onChanged: (value) => setState(
            () => _dsaGoodFaithConfirmed = value == true,
          ),
        ),
        const Text(
          'Die Eingangsbestätigung ist noch keine Entscheidung über die '
          'Rechtswidrigkeit und löst keine automatische Entfernung aus.',
          style: TextStyle(fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildProductSafetyFields() {
    return ListView(
      key: const ValueKey('support_product_safety_fields'),
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Direkter elektronischer Produktsicherheitskontakt',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        const Text(
          'Nutze das Produkt nicht weiter und gib es nicht an andere weiter. '
          'Bei akuter Gefahr oder Verletzung rufe 112. SIT ist kein Notruf und '
          'kann keine Ferndiagnose oder Sicherheitsgarantie geben.',
        ),
        const SizedBox(height: 14),
        _supportTextField(
          controller: _productIdentificationController,
          fieldKey: 'support_product_safety_identification',
          label: 'Produkt, Hersteller oder Modell *',
          hint: 'Zum Beispiel Produktname, Marke, Modell oder Kennzeichnung',
          maxLength: 300,
          maxLines: 3,
        ),
        const SizedBox(height: 12),
        _supportTextField(
          controller: _descriptionController,
          fieldKey: 'support_product_safety_risk_description',
          label: 'Welche Gefahr, welcher Unfall oder welche Verletzung? *',
          hint: 'Beschreibe Risiko, Ablauf, Datum und vorhandene Nachweise.',
          maxLength: 2000,
          minLines: 4,
          maxLines: 8,
        ),
        CheckboxListTile(
          key: const ValueKey('support_product_safety_guidance_acknowledged'),
          value: _productSafetyGuidanceAcknowledged,
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text(
            'Ich habe den Sicherheitshinweis gelesen und melde genau diesen '
            'Produktsicherheitsfall. *',
          ),
          onChanged: (value) => setState(
            () => _productSafetyGuidanceAcknowledged = value == true,
          ),
        ),
        const Text(
          'Die Meldung erhält eine eigene Referenz und eine servergebundene '
          'Schnelltriagefrist. Sie löst keine automatische Sperre, '
          'Behördenmeldung oder externe Nachricht aus.',
          style: TextStyle(fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildHandoverExceptionFields() {
    final selected = _selectedSubCategory ?? '';
    final isItemMismatch = const {
      'Artikel ist nicht wie beschrieben',
      'Artikel entspricht nicht der Beschreibung',
      'Falscher Artikel übergeben',
      'Schaden wurde schon vor Übergabe bemerkt',
    }.contains(selected);
    final isDeposit =
        selected == 'Kaution oder Sicherheitszahlung wird verlangt';
    final title = isItemMismatch
        ? 'Sichere Abbruch- und Support-Route'
        : isDeposit
            ? 'Keine Kaution oder Sicherheitszahlung leisten'
            : 'Nichterscheinen neutral dokumentieren';
    final guidance = isItemMismatch
        ? 'Nimm oder übergib den Artikel nicht, wenn er wesentlich von der '
            'Anzeige abweicht. Sichere die Situation und dokumentiere den '
            'Artikel, Zubehör und die Abweichung. Die Meldung entscheidet '
            'weder Schuld noch Geldfolgen.'
        : isDeposit
            ? 'Leiste keine Barzahlung, Kaution oder Sicherheitszahlung '
                'außerhalb des vorgesehenen SIT-Ablaufs und teile keine '
                'Zahlungsdaten im Chat. Besteht die Forderung fort, brich die '
                'Übergabe sicher ab. Trust & Safety prüft neutral; es erfolgt '
                'keine automatische Sperre oder Betrugsfeststellung.'
            : 'Sende der Gegenpartei zuerst eine kurze Nachricht im SIT-Chat. '
                'Der Server prüft den bestätigten Termin und einen vorhandenen '
                'Kontaktversuch. Die Meldung löst keine automatische Schuld-, '
                'Storno- oder 100%-Geldfolge aus.';
    final checkboxKey = isItemMismatch
        ? 'support_handover_safe_abort_acknowledged'
        : isDeposit
            ? 'support_handover_do_not_pay_acknowledged'
            : 'support_handover_contact_attempt_acknowledged';
    final checkboxValue = isItemMismatch
        ? _handoverSafeAbortAcknowledged
        : isDeposit
            ? _handoverDoNotPayAcknowledged
            : _handoverContactAttemptAcknowledged;
    final checkboxText = isItemMismatch
        ? 'Ich habe den Hinweis zum sicheren Nicht-Annehmen beziehungsweise '
            'Nicht-Übergeben gelesen. *'
        : isDeposit
            ? 'Ich habe verstanden, dass ich keine Kaution oder '
                'Sicherheitszahlung leisten soll. *'
            : 'Ich habe der Gegenpartei zum erreichten Termin eine kurze '
                'Nachricht im SIT-Chat gesendet. *';
    return ListView(
      key: const ValueKey('support_handover_exception_fields'),
      padding: const EdgeInsets.all(16),
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(guidance),
        const SizedBox(height: 14),
        _supportTextField(
          controller: _descriptionController,
          fieldKey: 'support_handover_exception_details',
          label: 'Was ist konkret passiert? *',
          hint:
              'Beschreibe beobachtbare Fakten, Zeitpunkt und vorhandene Nachweise.',
          maxLength: 1400,
          minLines: 4,
          maxLines: 8,
        ),
        CheckboxListTile(
          key: ValueKey(checkboxKey),
          value: checkboxValue,
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: Text(checkboxText),
          onChanged: (value) => setState(() {
            if (isItemMismatch) {
              _handoverSafeAbortAcknowledged = value == true;
            } else if (isDeposit) {
              _handoverDoNotPayAcknowledged = value == true;
            } else {
              _handoverContactAttemptAcknowledged = value == true;
            }
          }),
        ),
        const Text(
          'Der Eingang erstellt nur einen P1-Prüffall im internen Testmodus. '
          'Übergabestatus, Buchungsstatus, Zahlung, Erstattung, Schuld und '
          'Kontomaßnahmen bleiben unverändert.',
          style: TextStyle(fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildDescriptionStep() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final resolvedMainCategory =
        (_needsProfileReasonStep || _selectedDetailSubCategory != null)
            ? 'profile_report'
            : _selectedMainCategory;
    final resolvedSubCategory =
        _selectedDetailSubCategory ?? _selectedSubCategory;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          _SupportPreviewCard(
            mainCategory: resolvedMainCategory ?? '',
            subCategory: resolvedSubCategory ?? '',
            itemTitle: widget.context.itemTitle,
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: Container(
                  decoration: BoxDecoration(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.04)
                        : AppTheme.surfacePrimary(context),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.08)
                            : const Color(0xFFD9E2EC)),
                  ),
                  child: _isDsaNoticeSelection
                      ? _buildDsaNoticeFields()
                      : _isProductSafetySelection
                          ? _buildProductSafetyFields()
                          : _isHandoverExceptionSelection
                              ? _buildHandoverExceptionFields()
                              : TextField(
                                  controller: _descriptionController,
                                  maxLength: 1400,
                                  maxLines: null,
                                  expands: true,
                                  textAlignVertical: TextAlignVertical.top,
                                  style: TextStyle(
                                    color: isDark
                                        ? Colors.white.withValues(alpha: 0.95)
                                        : AppTheme.textPrimary(context),
                                    fontSize: 15,
                                    height: 1.5,
                                  ),
                                  decoration: InputDecoration(
                                    hintText:
                                        'Was ist passiert? Beschreibe die Situation so genau wie möglich …',
                                    hintStyle: TextStyle(
                                      color: isDark
                                          ? Colors.white.withValues(alpha: 0.35)
                                          : AppTheme.textDisabled(context),
                                      fontSize: 15,
                                    ),
                                    contentPadding: const EdgeInsets.all(18),
                                    border: InputBorder.none,
                                  ),
                                ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Send button
          SizedBox(
            width: double.infinity,
            height: 52,
            child: _SupportPressScale(
              onTap: _sendingSupport ||
                      !_submissionReady ||
                      _principal.capture() == null
                  ? null
                  : _submitSupportCase,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          BrandColors.primary.withValues(
                            alpha: _submissionReady ? 1 : 0.45,
                          ),
                          BrandColors.primary.withValues(
                            alpha: _submissionReady ? 0.85 : 0.35,
                          ),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.15)),
                    ),
                    child: Center(
                      child: _sendingSupport
                          ? SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: isDark
                                    ? Colors.white.withValues(alpha: 0.9)
                                    : AppTheme.textPrimary(context),
                              ),
                            )
                          : const Text(
                              'An Support schicken',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                              ),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Future<void> _submitSupportCase() async {
    final owner = _principal.capture();
    if (owner == null || _sendingSupport || _singleIssueConfirmed != true) {
      return;
    }
    setState(() => _sendingSupport = true);

    try {
      if (!await _principal.isCurrent(owner) || !mounted) return;
      final draft = SupportFlowResult(
        mainCategory:
            (_needsProfileReasonStep || _selectedDetailSubCategory != null)
                ? 'profile_report'
                : (_selectedMainCategory ?? ''),
        subCategory: _selectedDetailSubCategory ?? _selectedSubCategory ?? '',
        userDescription: _descriptionController.text.trim(),
        context: widget.context,
        safetyTriage: SupportSafetyTriage(
          immediateDanger: _immediateDanger!,
          guidanceShown: _immediateDanger == true,
        ),
        issueScope: SupportIssueScope(
          singleIssueConfirmed: true,
          separationGuidanceShown: _separationGuidanceShown,
        ),
        dsaNotice: _immediateDanger != true && _isDsaNoticeSelection
            ? SupportDsaNotice(
                contentType:
                    SupportFlowResult._dsaContentTypes[_selectedSubCategory]!,
                contentLocator: _dsaContentLocatorController.text,
                illegalityStatement: _descriptionController.text,
                jurisdictionOrLegalBasis: _dsaLegalBasisController.text,
                goodFaithConfirmed: _dsaGoodFaithConfirmed,
              )
            : null,
        productSafetyNotice: _immediateDanger != true &&
                _isProductSafetySelection
            ? SupportProductSafetyNotice(
                issueKind: _selectedSubCategory ==
                        'Unfall oder Verletzung durch Produkt'
                    ? 'accident_or_injury'
                    : 'dangerous_product',
                productIdentification: _productIdentificationController.text,
                riskDescription: _descriptionController.text,
                injuryOccurred: _selectedSubCategory ==
                    'Unfall oder Verletzung durch Produkt',
                safetyGuidanceAcknowledged: _productSafetyGuidanceAcknowledged,
              )
            : null,
        handoverSafeAbortAcknowledged: _handoverSafeAbortAcknowledged,
        handoverDoNotPayAcknowledged: _handoverDoNotPayAcknowledged,
        handoverContactAttemptAcknowledged: _handoverContactAttemptAcknowledged,
      );
      final Map<String, dynamic> supportCase;
      if (draft.handoverExceptionKind != null) {
        final submitter = widget.handoverExceptionSubmitter ??
            (bookingId, intake, idempotencyKey) =>
                BackendRepository.reportHandoverException(
                  owner: owner,
                  bookingId: bookingId,
                  intake: intake,
                  idempotencyKey: idempotencyKey,
                );
        supportCase = await submitter(
          widget.context.requestId.trim(),
          draft.toHandoverExceptionInput(),
          _submissionIdempotencyKey,
        );
      } else {
        final submitter = widget.submitter ??
            (intake, idempotencyKey) => BackendRepository.createSupportCase(
                  owner: owner,
                  intake: intake,
                  idempotencyKey: idempotencyKey,
                );
        supportCase = await submitter(
          draft.toBackendInput(),
          _submissionIdempotencyKey,
        );
      }
      final result = draft.withCanonicalCase(supportCase);
      if (!await _principal.isCurrent(owner) || !mounted) return;
      await _principal.showOwnedDialog(
        context: context,
        owner: owner,
        builder: (_, dismiss) => AlertDialog(
          key: const ValueKey('support_case_receipt'),
          title: Text('Fall ${supportCase['caseNumber']} eingegangen'),
          content: Text(result.canonicalReceiptMessage),
          actions: [
            TextButton(
              key: const ValueKey('support_case_receipt_continue'),
              onPressed: dismiss,
              child: const Text('Zum Support'),
            ),
          ],
        ),
      );
      if (!await _principal.isCurrent(owner) || !mounted) return;
      _principal.completeOwnedRoute(_screenRoute, owner, result);
    } catch (_) {
      if (!await _principal.isCurrent(owner) || !mounted) return;
      await _principal.showOwnedDialog(
        context: context,
        owner: owner,
        builder: (_, dismiss) => AlertDialog(
          icon: const Icon(Icons.error_outline_rounded),
          title: const Text('Support-Fall wurde nicht bestätigt'),
          content: const Text(
            'Bitte versuche es erneut; es wird kein lokaler Ersatzfall vorgetäuscht.',
          ),
          actions: [TextButton(onPressed: dismiss, child: const Text('OK'))],
        ),
      );
    } finally {
      if (mounted && _principal.isCurrentNow(owner)) {
        setState(() => _sendingSupport = false);
      }
    }
  }
}

class _SupportSafetyPanel extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final bool isDark;
  final bool urgent;

  const _SupportSafetyPanel({
    required this.icon,
    required this.title,
    required this.body,
    required this.isDark,
    this.urgent = false,
  });

  @override
  Widget build(BuildContext context) {
    final accent = urgent ? const Color(0xFFEF4444) : BrandColors.primary;
    return Semantics(
      container: true,
      label: '$title $body',
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.black.withValues(alpha: 0.36)
              : AppTheme.surfacePrimary(context),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: accent.withValues(alpha: 0.55)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: accent, size: 28),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color:
                          isDark ? Colors.white : AppTheme.textPrimary(context),
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    body,
                    style: TextStyle(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.78)
                          : AppTheme.textBody(context),
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SupportPreviewCard extends StatelessWidget {
  final String mainCategory;
  final String subCategory;
  final String itemTitle;

  const _SupportPreviewCard({
    required this.mainCategory,
    required this.subCategory,
    required this.itemTitle,
  });

  String _categoryLabel(String value) {
    switch (value) {
      case 'handover':
        return 'Problem mit Übergabe';
      case 'return':
        return 'Problem mit Rückgabe';
      case 'item_condition':
        return 'Problem mit Artikel/Zustand';
      case 'payment':
        return 'Problem mit Zahlung';
      case 'person':
        return 'Problem mit anderer Person';
      case 'technical':
        return 'Technisches Problem';
      case 'other':
        return 'Sonstiges';
      case 'profile_report':
        return 'Profil melden';
      default:
        return value;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.06)
            : AppTheme.surfacePrimary(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.10)
                : AppTheme.glassStroke(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Vorschau für den Support',
              style: TextStyle(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.92)
                      : AppTheme.textPrimary(context),
                  fontWeight: FontWeight.w700,
                  fontSize: 14)),
          const SizedBox(height: 8),
          Text('Kontext: $itemTitle',
              style: TextStyle(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.78)
                      : AppTheme.textSecondary(context),
                  fontSize: 13)),
          const SizedBox(height: 4),
          Text('Kategorie: ${_categoryLabel(mainCategory)}',
              style: TextStyle(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.78)
                      : AppTheme.textSecondary(context),
                  fontSize: 13)),
          const SizedBox(height: 4),
          Text('Grund: $subCategory',
              style: TextStyle(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.78)
                      : AppTheme.textSecondary(context),
                  fontSize: 13)),
        ],
      ),
    );
  }
}

class _SupportCategory {
  final IconData icon;
  final String label;
  final List<String> subcategories;

  const _SupportCategory({
    required this.icon,
    required this.label,
    required this.subcategories,
  });
}

/// Distinkte Buchungs-Kontextkarte - Premium Glass-Look
/// Mit quadratischem Artikelbild + Nutzer-Avatar-Overlay
class _DistinctBookingContextCard extends StatelessWidget {
  final String itemTitle;
  final String itemId;
  final String requestId;
  final String bookingStatus;
  final String? otherUserName;
  final String? itemImageUrl;
  final String? otherUserImageUrl;

  const _DistinctBookingContextCard({
    required this.itemTitle,
    required this.itemId,
    required this.requestId,
    required this.bookingStatus,
    this.otherUserName,
    this.itemImageUrl,
    this.otherUserImageUrl,
  });

  String _statusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'Angefragt';
      case 'accepted':
        return 'Bestätigt';
      case 'running':
        return 'Laufend';
      case 'completed':
        return 'Abgeschlossen';
      case 'declined':
        return 'Abgelehnt';
      case 'cancelled':
        return 'Storniert';
      default:
        return status;
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'accepted':
        return Colors.green;
      case 'running':
        return BrandColors.primary;
      case 'completed':
        return Colors.teal;
      case 'declined':
        return Colors.red;
      case 'cancelled':
        return Colors.grey;
      default:
        return BrandColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statusCol = _statusColor(bookingStatus);

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDark
                  ? [
                      Colors.white.withValues(alpha: 0.08),
                      Colors.white.withValues(alpha: 0.03),
                    ]
                  : [
                      AppTheme.surfacePrimary(context),
                      AppTheme.surfaceSecondary(context),
                    ],
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.12)
                  : const Color(0xFFD9E2EC),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: isDark
                    ? Colors.black.withValues(alpha: 0.25)
                    : Colors.black.withValues(alpha: 0.05),
                blurRadius: isDark ? 20 : 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              // Quadratisches Artikelbild mit Nutzer-Avatar-Overlay
              Stack(
                clipBehavior: Clip.none,
                children: [
                  // Artikel-Bild (quadratisch) - echtes Bild oder Placeholder
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      gradient: itemImageUrl == null || itemImageUrl!.isEmpty
                          ? LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                BrandColors.primary.withValues(alpha: 0.22),
                                BrandColors.primary.withValues(alpha: 0.08),
                              ],
                            )
                          : null,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: BrandColors.primary.withValues(alpha: 0.18)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: itemImageUrl != null && itemImageUrl!.isNotEmpty
                        ? AppImage(
                            url: itemImageUrl!,
                            fit: BoxFit.cover,
                            fallback: Center(
                              child: Icon(
                                Icons.inventory_2_rounded,
                                color:
                                    BrandColors.primary.withValues(alpha: 0.75),
                                size: 24,
                              ),
                            ),
                          )
                        : Center(
                            child: Icon(
                              Icons.inventory_2_rounded,
                              color:
                                  BrandColors.primary.withValues(alpha: 0.75),
                              size: 24,
                            ),
                          ),
                  ),
                  // Kleiner Nutzer-Avatar-Overlay unten rechts - echtes Bild oder Placeholder
                  Positioned(
                    right: -6,
                    bottom: -6,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: isDark
                            ? Colors.grey.shade800
                            : AppTheme.surfacePrimary(context),
                        border: Border.all(
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.25)
                                : const Color(0xFFE2E8F0),
                            width: 2),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.35),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: otherUserImageUrl != null &&
                              otherUserImageUrl!.isNotEmpty
                          ? AppImage(
                              url: otherUserImageUrl!,
                              fit: BoxFit.cover,
                              fallback: Center(
                                child: Icon(
                                  Icons.person_rounded,
                                  color: isDark
                                      ? Colors.white.withValues(alpha: 0.7)
                                      : AppTheme.textSecondary(context),
                                  size: 14,
                                ),
                              ),
                            )
                          : Center(
                              child: Icon(
                                Icons.person_rounded,
                                color: isDark
                                    ? Colors.white.withValues(alpha: 0.7)
                                    : AppTheme.textSecondary(context),
                                size: 14,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 14),
              // Info-Bereich
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (itemTitle.isNotEmpty)
                      Text(
                        itemTitle,
                        style: TextStyle(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.95)
                              : AppTheme.textPrimary(context),
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 3),
                    // Gegenüber + Buchungs-ID
                    Row(
                      children: [
                        Icon(
                          Icons.person_outline_rounded,
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.45)
                              : AppTheme.textSecondary(context),
                          size: 13,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            otherUserName ?? 'Gegenpartei',
                            style: TextStyle(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.50)
                                  : AppTheme.textSecondary(context),
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (requestId.isNotEmpty)
                          Text(
                            '#${requestId.length > 6 ? requestId.substring(0, 6) : requestId}',
                            style: TextStyle(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.35)
                                  : AppTheme.textDisabled(context),
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              fontFamily: 'monospace',
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              // Status-Chip rechts
              if (bookingStatus.isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: statusCol.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(8),
                    border:
                        Border.all(color: statusCol.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    _statusLabel(bookingStatus),
                    style: TextStyle(
                      color: statusCol,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Glassy Category card für Hauptkategorien - SIT Style
class _GlassySupportCategoryCard extends StatelessWidget {
  final IconData? icon;
  final String label;
  final bool showChevron;
  final VoidCallback onTap;

  const _GlassySupportCategoryCard({
    required this.icon,
    required this.label,
    required this.showChevron,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _SupportPressScale(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.045)
                  : AppTheme.surfacePrimary(context),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : const Color(0xFFD9E2EC)),
            ),
            child: Row(
              children: [
                if (icon != null) ...[
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          BrandColors.primary.withValues(alpha: 0.18),
                          BrandColors.primary.withValues(alpha: 0.08),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: BrandColors.primary.withValues(alpha: 0.15)),
                    ),
                    child: Center(
                      child: Icon(icon, color: BrandColors.primary, size: 22),
                    ),
                  ),
                  const SizedBox(width: 14),
                ],
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.92)
                          : AppTheme.textPrimary(context),
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
                if (showChevron)
                  Icon(
                    Icons.chevron_right_rounded,
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.4)
                        : AppTheme.textSecondary(context),
                    size: 22,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Leichtere Glassy Card für Subkategorien - unterscheidet sich von Hauptkategorien
class _GlassySubcategoryCard extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _GlassySubcategoryCard({
    super.key,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _SupportPressScale(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              // Transparenter und leichter als Hauptkategorien
              color: isDark
                  ? Colors.white.withValues(alpha: 0.035)
                  : AppTheme.surfacePrimary(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.06)
                      : const Color(0xFFD9E2EC)),
            ),
            child: Row(
              children: [
                // Kleiner Punkt-Indikator statt Icon
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isDark
                        ? BrandColors.primary.withValues(alpha: 0.6)
                        : BrandColors.primary,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.88)
                          : AppTheme.textPrimary(context),
                      fontWeight: FontWeight.w500,
                      fontSize: 14,
                      height: 1.3,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.32)
                      : AppTheme.textSecondary(context),
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// PressScale Widget für Support-Flow
class _SupportPressScale extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _SupportPressScale({required this.child, required this.onTap});

  @override
  State<_SupportPressScale> createState() => _SupportPressScaleState();
}

class _SupportPressScaleState extends State<_SupportPressScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapCancel: () => setState(() => _pressed = false),
      onTapUp: (_) => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.985 : 1.0,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
