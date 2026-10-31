import 'package:flutter_test/flutter_test.dart';
import 'package:lendify/models/item.dart';
import 'package:lendify/services/data_service.dart';

import 'support/test_builders.dart';

void main() {
  final active = buildTestItem(id: 'email-policy-active', ownerId: 'owner');
  final draft = Item.fromJson(<String, dynamic>{
    ...active.toJson(),
    'status': 'draft',
    'isActive': false,
  });

  test('local listing persistence is draft-only for unverified users', () {
    expect(
      canPersistLocalListingForEmailVerification(
        emailVerified: false,
        requested: draft,
      ),
      isTrue,
    );
    expect(
      canPersistLocalListingForEmailVerification(
        emailVerified: false,
        requested: active,
      ),
      isFalse,
    );
    expect(
      canPersistLocalListingForEmailVerification(
        emailVerified: true,
        requested: active,
      ),
      isTrue,
    );
    // Deactivation is a protective local action: an active listing may be
    // changed to an explicit inactive draft without email verification.
    expect(
      canPersistLocalListingForEmailVerification(
        emailVerified: false,
        requested: draft,
      ),
      isTrue,
    );
  });

  test('local status mutation never activates an unverified listing', () {
    expect(
      canMutateLocalListingStatusForEmailVerification(
        emailVerified: false,
        status: 'active',
      ),
      isFalse,
    );
    expect(
      canMutateLocalListingStatusForEmailVerification(
        emailVerified: false,
        status: 'paused',
      ),
      isTrue,
    );
    expect(
      canMutateLocalListingStatusForEmailVerification(
        emailVerified: false,
        status: 'ended',
      ),
      isTrue,
    );
    expect(
      canMutateLocalListingStatusForEmailVerification(
        emailVerified: false,
        status: 'draft',
      ),
      isTrue,
    );
    expect(
      canMutateLocalListingStatusForEmailVerification(
        emailVerified: true,
        status: 'active',
      ),
      isTrue,
    );
  });
}
