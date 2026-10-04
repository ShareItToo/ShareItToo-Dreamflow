class Message {
  final String id;
  final String senderId;
  final String text;
  final DateTime timestamp;
  final bool isRead;
  final List<Map<String, dynamic>> attachments;

  Message({
    required this.id,
    required this.senderId,
    required this.text,
    required this.timestamp,
    this.isRead = false,
    this.attachments = const <Map<String, dynamic>>[],
  });

  Message copyWith({bool? isRead}) => Message(
        id: id,
        senderId: senderId,
        text: text,
        timestamp: timestamp,
        isRead: isRead ?? this.isRead,
        attachments: attachments,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'senderId': senderId,
        'text': text,
        'timestamp': timestamp.toIso8601String(),
        'isRead': isRead,
        'attachments': attachments,
      };

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String,
        senderId: json['senderId'] as String,
        text: json['text'] as String,
        timestamp: DateTime.parse(json['timestamp'] as String),
        isRead: (json['isRead'] as bool?) ?? false,
        attachments: (json['attachments'] as List?)
                ?.whereType<Map>()
                .map((entry) => Map<String, dynamic>.from(entry))
                .toList(growable: false) ??
            const <Map<String, dynamic>>[],
      );
}

class MessageThread {
  final String id;
  final String requestId; // Die zugehörige Mietanfrage
  final String itemId; // Der zugehörige Artikel
  final String itemTitle; // Titel des Artikels (für Anzeige)
  final String user1Id; // Mieter
  final String user2Id; // Vermieter
  /// Optional: classify a thread as a special type (e.g. support).
  ///
  /// - 'support' => SIT support chat
  /// - null/'booking' => regular booking/chat thread
  final String? threadType;

  /// Optional booking/request status snapshot for list rendering.
  ///
  /// When connected to a RentalRequest, the UI will prefer the live request
  /// status; otherwise this value provides a stable demo fallback.
  ///
  /// Examples: 'pending', 'accepted', 'running', 'completed', 'cancelled'.
  final String? bookingStatus;

  /// Optional “USP” appointment line for the list: Übergabe/Rückgabe time.
  final DateTime? handoverAt;
  final DateTime? returnAt;

  /// Optional presence snapshot (demo/local only).
  final bool? otherUserOnline;
  final DateTime? otherUserLastActive;

  /// Per-user archive flag.
  ///
  /// If a userId is present here, the thread is hidden from that user's
  /// message list (but still preserved in local storage).
  final List<String> archivedForUserIds;

  /// Per-user local deletion tombstone.
  ///
  /// Deleting a conversation must never erase the counterparty's copy. A
  /// participant listed here no longer sees the thread, while the shared
  /// record remains available to the other participant and for later server
  /// reconciliation.
  final List<String> deletedForUserIds;
  final List<Message> messages;
  final DateTime createdAt;
  final DateTime? lastMessageAt;

  MessageThread({
    required this.id,
    required this.requestId,
    required this.itemId,
    required this.itemTitle,
    required this.user1Id,
    required this.user2Id,
    this.threadType,
    this.bookingStatus,
    this.handoverAt,
    this.returnAt,
    this.otherUserOnline,
    this.otherUserLastActive,
    this.archivedForUserIds = const <String>[],
    this.deletedForUserIds = const <String>[],
    required this.messages,
    required this.createdAt,
    this.lastMessageAt,
  });

  MessageThread copyWith({
    List<Message>? messages,
    DateTime? lastMessageAt,
    List<String>? archivedForUserIds,
    List<String>? deletedForUserIds,
    String? threadType,
    String? bookingStatus,
    DateTime? handoverAt,
    DateTime? returnAt,
    bool? otherUserOnline,
    DateTime? otherUserLastActive,
  }) =>
      MessageThread(
        id: id,
        requestId: requestId,
        itemId: itemId,
        itemTitle: itemTitle,
        user1Id: user1Id,
        user2Id: user2Id,
        threadType: threadType ?? this.threadType,
        bookingStatus: bookingStatus ?? this.bookingStatus,
        handoverAt: handoverAt ?? this.handoverAt,
        returnAt: returnAt ?? this.returnAt,
        otherUserOnline: otherUserOnline ?? this.otherUserOnline,
        otherUserLastActive: otherUserLastActive ?? this.otherUserLastActive,
        archivedForUserIds: archivedForUserIds ?? this.archivedForUserIds,
        deletedForUserIds: deletedForUserIds ?? this.deletedForUserIds,
        messages: messages ?? this.messages,
        createdAt: createdAt,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'requestId': requestId,
        'itemId': itemId,
        'itemTitle': itemTitle,
        'user1Id': user1Id,
        'user2Id': user2Id,
        'threadType': threadType,
        'bookingStatus': bookingStatus,
        'handoverAt': handoverAt?.toIso8601String(),
        'returnAt': returnAt?.toIso8601String(),
        'otherUserOnline': otherUserOnline,
        'otherUserLastActive': otherUserLastActive?.toIso8601String(),
        'archivedForUserIds': archivedForUserIds,
        'deletedForUserIds': deletedForUserIds,
        'messages': messages.map((m) => m.toJson()).toList(),
        'createdAt': createdAt.toIso8601String(),
        'lastMessageAt': lastMessageAt?.toIso8601String(),
      };

  factory MessageThread.fromJson(Map<String, dynamic> json) {
    final messagesList = (json['messages'] as List?)
            ?.map((e) => Message.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList() ??
        <Message>[];
    final archived = (json['archivedForUserIds'] as List?)
            ?.map((e) => e.toString())
            .toList() ??
        const <String>[];
    final deleted = (json['deletedForUserIds'] as List?)
            ?.map((e) => e.toString())
            .toList() ??
        const <String>[];
    return MessageThread(
      id: json['id'] as String,
      requestId: json['requestId'] as String,
      itemId: json['itemId'] as String,
      itemTitle: json['itemTitle'] as String,
      user1Id: json['user1Id'] as String,
      user2Id: json['user2Id'] as String,
      threadType: (json['threadType'] as String?),
      bookingStatus: (json['bookingStatus'] as String?),
      handoverAt: json['handoverAt'] != null
          ? DateTime.tryParse(json['handoverAt'].toString())
          : null,
      returnAt: json['returnAt'] != null
          ? DateTime.tryParse(json['returnAt'].toString())
          : null,
      otherUserOnline: json['otherUserOnline'] is bool
          ? (json['otherUserOnline'] as bool)
          : null,
      otherUserLastActive: json['otherUserLastActive'] != null
          ? DateTime.tryParse(json['otherUserLastActive'].toString())
          : null,
      archivedForUserIds: archived,
      deletedForUserIds: deleted,
      messages: messagesList,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastMessageAt: json['lastMessageAt'] != null
          ? DateTime.parse(json['lastMessageAt'] as String)
          : null,
    );
  }
}
