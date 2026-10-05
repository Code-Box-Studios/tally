import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/notifications/domain/notification_repository.dart';
import 'package:tally/features/notifications/presentation/notification_providers.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import 'notification_repository_test.dart';

final class PendingNotificationDocuments extends NotificationDocuments {
  PendingNotificationDocuments(super.owner, this.stream);
  final Stream<RawPage> stream;
  @override
  Stream<RawPage> watchPage(DocumentQuery query) => stream;
}

void main() {
  test(
    'nested owner scopes do not share preference repository or values',
    () async {
      final root = ProviderContainer.test(
        overrides: [
          ownerDocumentsFactoryProvider.overrideWithValue(
            NotificationDocuments.new,
          ),
          ownerCommandsFactoryProvider.overrideWithValue(
            NotificationCommands.new,
          ),
        ],
      );
      final alice = ProviderContainer.test(
        parent: root,
        overrides: [ownerUidProvider.overrideWithValue(OwnerUid('alice'))],
      );
      final bob = ProviderContainer.test(
        parent: root,
        overrides: [ownerUidProvider.overrideWithValue(OwnerUid('bob'))],
      );
      final a = alice.listen(notificationPreferencesProvider, (_, _) {});
      final b = bob.listen(notificationPreferencesProvider, (_, _) {});
      expect(
        (await alice.read(notificationPreferencesProvider.future)).owner.value,
        'alice',
      );
      expect(
        (await bob.read(notificationPreferencesProvider.future)).owner.value,
        'bob',
      );
      expect(
        identical(
          alice.read(notificationRepositoryProvider),
          bob.read(notificationRepositoryProvider),
        ),
        isFalse,
      );
      a.close();
      b.close();
    },
  );
  test(
    'disposing inbox during a permission failure leaves no uncaught rejection',
    () async {
      final failures = <Object>[], owner = OwnerUid('alice');
      final source = StreamController<RawPage>.broadcast(sync: true);
      await runZonedGuarded(() async {
        final container = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            ownerUidProvider.overrideWithValue(owner),
            ownerDocumentsFactoryProvider.overrideWithValue(
              (_) => PendingNotificationDocuments(owner, source.stream),
            ),
            ownerCommandsFactoryProvider.overrideWithValue(
              NotificationCommands.new,
            ),
          ],
        );
        final subscription = container.listen(
          reminderInboxProvider(
            NotificationInboxQuery(until: DateTime.utc(2026, 10, 5)),
          ),
          (_, _) {},
        );
        await Future<void>.delayed(Duration.zero);
        source.addError(
          FirebaseException(
            plugin: 'cloud_firestore',
            code: 'permission-denied',
          ),
        );
        subscription.close();
        container.dispose();
        await Future<void>.delayed(Duration.zero);
        await source.close();
        await Future<void>.delayed(Duration.zero);
      }, (error, _) => failures.add(error));
      expect(failures, isEmpty);
    },
  );
}
