import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/data/firestore_notification_repository.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/sync/domain/command_submission.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';

import '../notifications/notification_repository_test.dart'
    show NotificationDocuments, NotificationCommands;

class QueuedPreferences implements OwnerCommandGateway {
  @override
  OwnerUid get owner => OwnerUid('alice');
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async => throw QueuedCommand(owner, id);
}

void main() {
  test('notification repository preserves queued preferences without inventing a revision', () async {
    final commands = QueuedPreferences();
    final repository = FirestoreNotificationRepository(
      NotificationDocuments(commands.owner),
      commands,
    );
    await expectLater(
      repository.updatePreferences(
        CommandId('preference'),
        NotificationPreferences.defaults(commands.owner),
      ),
      throwsA(isA<QueuedCommand>()),
    );
  });
  test(
    'mark-read bypasses the financial outbox through the injected raw gateway',
    () async {
      final queued = QueuedPreferences(),
          raw = NotificationCommands(OwnerUid('alice'));
      final repository = FirestoreNotificationRepository(
        NotificationDocuments(queued.owner),
        queued,
        rawCommands: raw,
      );
      expect(await repository.markRead(CommandId('read'), 'reminder', 1), 2);
      expect(raw.calls.single.$1, 'markReminderRead');
    },
  );
}
