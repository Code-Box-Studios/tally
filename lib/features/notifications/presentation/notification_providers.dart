import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_providers.dart';
import '../data/firestore_notification_repository.dart';
import '../domain/notification_preferences.dart';
import '../domain/notification_repository.dart';
import '../domain/reminder_entry.dart';

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => FirestoreNotificationRepository(
    ref.watch(ownerDocumentGatewayProvider),
    ref.watch(ownerCommandGatewayProvider),
  ),
  dependencies: [ownerDocumentGatewayProvider, ownerCommandGatewayProvider],
);
final notificationPreferencesProvider =
    StreamProvider.autoDispose<NotificationPreferences>(
      (ref) => ref.watch(notificationRepositoryProvider).watchPreferences(),
      dependencies: [notificationRepositoryProvider],
    );
final reminderInboxProvider = StreamProvider.autoDispose
    .family<DataPage<ReminderEntry>, NotificationInboxQuery>(
      (ref, query) =>
          ref.watch(notificationRepositoryProvider).watchInbox(query),
      dependencies: [notificationRepositoryProvider],
    );
