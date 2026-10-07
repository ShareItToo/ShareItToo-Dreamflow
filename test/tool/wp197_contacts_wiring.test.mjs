import assert from 'node:assert/strict';
import fs from 'node:fs';

const contacts = fs.readFileSync('lib/screens/contacts_screen.dart', 'utf8');
const profile = fs.readFileSync('lib/screens/profile_screen.dart', 'utf8');
const service = fs.readFileSync('lib/services/contacts_service.dart', 'utf8');

assert.match(profile, /const ContactsScreen\(\)/u);
assert.match(contacts, /getArchivedMessageThreadsForUser[\s\S]*?getMessageThreadsForUser/u);
assert.match(contacts, /deriveAccountContacts\(/u);
assert.match(contacts, /_activeContext/u);
assert.match(contacts, /isContextCurrent\(owner\)/u);
assert.match(contacts, /PublicProfileScreen\(userId: contact\.user\.id\)/u);
assert.match(contacts, /MessageThreadScreen\([\s\S]*?threadId: contact\.thread\.id/u);
assert.match(contacts, /Kontakte konnten nicht geladen werden[\s\S]*?Erneut laden/u);
assert.doesNotMatch(contacts, /contact\.user\.email/u);
assert.match(service, /thread\.deletedForUserIds\.contains\(currentUser\.id\)/u);
assert.match(service, /thread\.threadType.*support/u);
assert.match(service, /byUser\[other\.id\]/u);

console.log('WP197 contacts wiring: PASS');
