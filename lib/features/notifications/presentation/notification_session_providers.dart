import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/environment.dart';
import '../../../core/config/environment_providers.dart';
import '../../../shared/presentation/private_session_cleanup_provider.dart';
import '../data/firebase_messaging_adapter.dart';
import '../data/installation_store.dart';
import '../data/local_notification_adapter.dart';
import '../data/native_local_alert_gateway.dart';
import 'notification_providers.dart';
import 'notification_session.dart';

final installationStoreProvider = Provider<InstallationStore>(
  (_) => InstallationStore(SharedNotificationValues()),
);
final notificationSessionProvider = Provider.autoDispose<NotificationSession>(
  (ref) {
    final repo = ref.watch(notificationRepositoryProvider),
        config = ref.watch(environmentProvider),
        store = ref.watch(installationStoreProvider);
    final native =
        !kIsWeb &&
        {
          TargetPlatform.android,
          TargetPlatform.iOS,
        }.contains(defaultTargetPlatform) &&
        config.mode != AppEnvironment.preview &&
        config.mode != AppEnvironment.emulator;
    final gateway = native ? NativeLocalAlertGateway() : null;
    final platform = FirebaseMessagingAdapter(
      config,
      localEvents: gateway?.openedEvents,
      localInitial: gateway?.initialMessage,
    );
    final session = NotificationSession(
      repository: repo,
      platform: platform,
      local: LocalNotificationAdapter(gateway ?? NoLocalAlertGateway(), store),
      installationId: store.getOrCreate,
    );
    final remove = ref
        .read(privateSessionCleanupProvider)
        .register(repo.owner, session.close);
    ref.onDispose(() {
      remove();
      unawaited(
        session.close().whenComplete(() async {
          await gateway?.dispose();
        }),
      );
    });
    unawaited(session.start());
    return session;
  },
  dependencies: [
    notificationRepositoryProvider,
    environmentProvider,
    installationStoreProvider,
    privateSessionCleanupProvider,
  ],
);
final notificationSessionStateProvider =
    StreamProvider.autoDispose<NotificationSessionState>(
      (ref) => ref.watch(notificationSessionProvider).watch(),
      dependencies: [notificationSessionProvider],
    );

class NotificationSessionHost extends ConsumerWidget {
  const NotificationSessionHost({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(notificationSessionProvider);
    session.onOpen = (uri) {
      if (context.mounted) context.go(uri.toString());
    };
    return child;
  }
}
