import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync('lib/services/app_link_service.dart', 'utf8');
const destination = readFileSync(
  'lib/screens/app_link_destination_screen.dart',
  'utf8',
);

test('app-link ingress owns every target before its first resumed await', () => {
  assert.match(
    service,
    /class PrincipalBoundAppLinkTarget[\s\S]*AppLinkTarget target;[\s\S]*AppLinkPrincipalOwner owner;/u,
  );
  assert.match(
    service,
    /Future<void> _refreshNativePendingActionLink\(\) async \{[\s\S]*final owner = _capturePrincipalOwner\(\);[\s\S]*final uri = await _takeNativePendingActionLink\(\);/u,
  );
  assert.match(
    service,
    /_lastAcceptedPrincipalToken == owner\.principalToken[\s\S]*_lastAcceptedEpoch == owner\.epoch/u,
  );
});

test('remote results require the same principal before invocation and return', () => {
  const operation = service.slice(
    service.indexOf('Future<T> runPrincipalBoundAppLinkOperation'),
    service.indexOf('class AppLinkTargetInbox'),
  );
  assert.equal((operation.match(/await owner\.isCurrent\(\)/gu) ?? []).length, 2);
  assert.ok(
    operation.indexOf('if (!await owner.isCurrent())') <
      operation.indexOf('final result = await operation();'),
  );
  assert.ok(
    operation.lastIndexOf('if (!await owner.isCurrent())') >
      operation.indexOf('final result = await operation();'),
  );
  for (const call of [
    'DataService.getPublicItems',
    'DataService.getRentalRequestById',
    'DataService.getCurrentUser',
    'FirebaseRuntime.recordControlledStagingCrashDiagnostic',
    'launchUrl',
  ]) {
    assert.match(destination, new RegExp(`_runOwned\\([\\s\\S]*${call}`, 'u'));
  }
});

test('principal transition removes only the exact owned route', () => {
  const hostRemoval = destination.slice(
    destination.indexOf('void _removeStaleOwnedRoute()'),
    destination.indexOf('@override\n  void dispose()', destination.indexOf('void _removeStaleOwnedRoute()')),
  );
  const destinationRemoval = destination.slice(
    destination.indexOf('void _removeIfPrincipalChanged()'),
    destination.indexOf('Future<AuthSession?> _resolveSession()'),
  );
  assert.match(
    hostRemoval,
    /if \(!identical\(route, _activeOwnedRoute\) \|\|[\s\S]*!identical\(owner, _activeOwner\)\)[\s\S]*navigator\.removeRoute\(route\);/u,
  );
  assert.match(destinationRemoval, /navigator\.removeRoute\(route\);/u);
  assert.doesNotMatch(hostRemoval, /\.pop\(/u);
  assert.doesNotMatch(destinationRemoval, /\.pop\(/u);
  assert.match(
    destination,
    /snapshot\.hasError[\s\S]*Anzeige konnte nicht geladen werden[\s\S]*Status wurde nicht als entfernt oder pausiert bewertet/u,
  );
});
