import 'package:flutter/material.dart';
import 'package:lendify/models/message.dart';
import 'package:lendify/models/user.dart';
import 'package:lendify/screens/message_thread_screen.dart';
import 'package:lendify/screens/public_profile_screen.dart';
import 'package:lendify/services/contacts_service.dart';
import 'package:lendify/services/data_service.dart';
import 'package:lendify/services/safety_action_service.dart';
import 'package:lendify/theme.dart';
import 'package:lendify/widgets/user_avatar.dart';

class ContactsScreen extends StatefulWidget {
  final SafetyActionService? safetyActionService;

  const ContactsScreen({super.key, this.safetyActionService});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  late final SafetyActionService _safetyService;
  List<AccountContact> _contacts = const <AccountContact>[];
  bool _isLoading = true;
  bool _loadFailed = false;
  int _loadRevision = 0;
  String _query = '';
  SafetyActionContext? _activeContext;

  @override
  void initState() {
    super.initState();
    _safetyService = widget.safetyActionService ?? const SafetyActionService();
    _load();
  }

  Future<void> _load() async {
    final revision = ++_loadRevision;
    if (mounted) {
      setState(() {
        _isLoading = true;
        _loadFailed = false;
        _activeContext = null;
        _contacts = const <AccountContact>[];
      });
    }
    try {
      final owner = await _safetyService.loadCurrentContext();
      if (!mounted || revision != _loadRevision) return;
      if (owner == null) {
        setState(() => _isLoading = false);
        return;
      }
      final archived =
          await DataService.getArchivedMessageThreadsForUser(owner.user.id);
      final active = await DataService.getMessageThreadsForUser(owner.user.id);
      final users = await DataService.getUsers();
      if (!mounted ||
          revision != _loadRevision ||
          !await _safetyService.isContextCurrent(owner)) {
        return;
      }
      final contacts = deriveAccountContacts(
        currentUser: owner.user,
        threads: <MessageThread>[...active, ...archived],
        usersById: <String, User>{for (final user in users) user.id: user},
      );
      setState(() {
        _activeContext = owner;
        _contacts = contacts;
        _isLoading = false;
      });
    } catch (error) {
      debugPrint('[ContactsScreen] load failed: $error');
      if (mounted && revision == _loadRevision) {
        setState(() {
          _isLoading = false;
          _loadFailed = true;
        });
      }
    }
  }

  List<AccountContact> get _visibleContacts {
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) return _contacts;
    return _contacts
        .where((contact) =>
            contact.user.displayName.toLowerCase().contains(query) ||
            contact.thread.itemTitle.toLowerCase().contains(query))
        .toList(growable: false);
  }

  Future<void> _openProfile(AccountContact contact) async {
    final owner = _activeContext;
    if (!mounted || owner == null) return;
    final current = await _safetyService.isContextCurrent(owner);
    if (!mounted) return;
    if (!current) {
      _invalidateStaleContacts();
      return;
    }
    final stillListed = _contacts.any((entry) =>
        entry.user.id == contact.user.id &&
        entry.thread.id == contact.thread.id);
    if (!stillListed) return;
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => PublicProfileScreen(userId: contact.user.id),
    ));
  }

  Future<void> _openChat(AccountContact contact) async {
    final owner = _activeContext;
    if (!mounted || owner == null) return;
    final current = await _safetyService.isContextCurrent(owner);
    if (!mounted) return;
    if (!current) {
      _invalidateStaleContacts();
      return;
    }
    final stillListed = _contacts.any((entry) =>
        entry.user.id == contact.user.id &&
        entry.thread.id == contact.thread.id);
    if (!stillListed) return;
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => MessageThreadScreen(
        threadId: contact.thread.id,
        requestId: contact.thread.requestId,
        participantName: contact.user.displayName,
        avatarUrl: contact.user.photoURL,
        itemTitle: contact.thread.itemTitle,
      ),
    ));
    if (mounted) await _load();
  }

  void _invalidateStaleContacts() {
    if (!mounted) return;
    setState(() {
      _activeContext = null;
      _contacts = const <AccountContact>[];
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Kontakte'),
        actions: [
          IconButton(
            tooltip: 'Kontakte suchen',
            icon: const Icon(Icons.search),
            onPressed: () async {
              final query = await showDialog<String>(
                context: context,
                builder: (dialogContext) => _ContactSearchDialog(
                  initialQuery: _query,
                ),
              );
              if (query != null && mounted) setState(() => _query = query);
            },
          ),
          IconButton(
            tooltip: 'Neu laden',
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _load,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _loadFailed
              ? _ContactsError(onRetry: _load)
              : _visibleContacts.isEmpty
                  ? _ContactsEmpty(hasQuery: _query.isNotEmpty)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                      itemCount: _visibleContacts.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, index) {
                        final contact = _visibleContacts[index];
                        return _ContactTile(
                          contact: contact,
                          isDark: isDark,
                          onProfile: () => _openProfile(contact),
                          onChat: () => _openChat(contact),
                        );
                      },
                    ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  final AccountContact contact;
  final bool isDark;
  final VoidCallback onProfile;
  final VoidCallback onChat;

  const _ContactTile({
    required this.contact,
    required this.isDark,
    required this.onProfile,
    required this.onChat,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: SitUserAvatar(url: contact.user.photoURL, radius: 24),
        title: Text(contact.user.displayName),
        subtitle: Text(contact.thread.itemTitle),
        onTap: onChat,
        trailing: PopupMenuButton<String>(
          onSelected: (value) => value == 'profile' ? onProfile() : onChat(),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'profile', child: Text('Profil öffnen')),
            PopupMenuItem(value: 'chat', child: Text('Chat öffnen')),
          ],
        ),
      ),
    );
  }
}

class _ContactsEmpty extends StatelessWidget {
  final bool hasQuery;
  const _ContactsEmpty({required this.hasQuery});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            hasQuery
                ? 'Keine passenden Kontakte in deinen Chats gefunden.'
                : 'Kontakte entstehen aus deinen echten Miet- und Nachrichtenthreads.',
            textAlign: TextAlign.center,
          ),
        ),
      );
}

class _ContactsError extends StatelessWidget {
  final VoidCallback onRetry;
  const _ContactsError({required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Kontakte konnten nicht geladen werden. Deine Daten wurden nicht verändert.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Erneut laden'),
              ),
            ],
          ),
        ),
      );
}

class _ContactSearchDialog extends StatefulWidget {
  final String initialQuery;
  const _ContactSearchDialog({required this.initialQuery});

  @override
  State<_ContactSearchDialog> createState() => _ContactSearchDialogState();
}

class _ContactSearchDialogState extends State<_ContactSearchDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialQuery);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Kontakte suchen'),
        content: TextField(
          controller: _controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Name oder Artikel'),
          onSubmitted: (_) =>
              Navigator.of(context).pop(_controller.text.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Abbrechen'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
            child: const Text('Suchen'),
          ),
        ],
      );
}
