import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/sync/domain/command_identity.dart';

import '../../fixtures/sync/command_identity_fixtures.dart';

void main() {
  test('client creation predictions match the literal owner-scoped server fixtures', () {
    for (final row in commandIdentityFixtures) {
      expect(
        predictedCommandId(
          OwnerUid(row['owner']!),
          CommandId(row['commandId']!),
          row['role']!,
        ),
        row['expectedId'],
      );
    }
    expect(
      () =>
          predictedCommandId(OwnerUid('alice'), CommandId('pay-1'), 'payment'),
      throwsArgumentError,
    );
    expect(
      () => predictedCommandId(
        OwnerUid('alice'),
        CommandId('pay-1'),
        'instance\n',
      ),
      throwsArgumentError,
    );
  });
}
