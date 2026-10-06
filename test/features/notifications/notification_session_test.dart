import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/domain/notification_device.dart';
import 'package:tally/features/notifications/domain/notification_platform.dart';
import 'package:tally/features/notifications/domain/notification_preferences.dart';
import 'package:tally/features/notifications/domain/reminder_entry.dart';
import 'package:tally/features/notifications/presentation/notification_session.dart';
import 'package:tally/shared/domain/data_page.dart';

import '../../support/notification_fixtures.dart';

class PlatformStub implements NotificationPlatform {
  NotificationCapability capability = const NotificationCapability(
    platform: NotificationDevicePlatform.web,
    permission: NotificationPermission.granted,
    pushAvailable: true,
    localAvailable: false,
    token: 'synthetic-notification-token-browser',
    message: 'Available',
  );
  int requests = 0;
  final tokens = StreamController<String>.broadcast();
  final opens = StreamController<ReminderIntent>.broadcast();
  @override
  Stream<String> get tokenChanges => tokens.stream;
  @override
  Stream<ReminderIntent> get openedEvents => opens.stream;
  @override
  Future<ReminderIntent?> initialMessage() async => null;
  @override
  Future<NotificationCapability> inspect() async => capability;
  @override
  Future<NotificationCapability> requestPermission() async {
    requests++;
    return capability;
  }

  @override
  Future<void> clear() async {}
  Future<void> close() async {
    await tokens.close();
    await opens.close();
  }
}

class LocalStub implements LocalReminderScheduler {
  final cancelled = <OwnerUid>[], plans = <List<ReminderEntry>>[];
  @override
  Future<void> cancelOwner(OwnerUid owner) async {
    cancelled.add(owner);
  }

  @override
  Future<void> reconcile(
    OwnerUid owner,
    Iterable<ReminderEntry> entries, {
    int limit = 50,
  }) async {
    plans.add(entries.take(limit).toList());
  }
}

class StalledSubscription extends Fake implements StreamSubscription<String> {
  final release = Completer<void>();
  @override
  Future<void> cancel() => release.future;
}

class StalledStream extends Stream<String> {
  final subscription = StalledSubscription();
  @override
  StreamSubscription<String> listen(
    void Function(String)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => subscription;
}

class StalledPlatform extends PlatformStub {
  final stalled = StalledStream();
  @override
  Stream<String> get tokenChanges => stalled;
}

NotificationPreferences enabled(
  FakeNotifications repo, {
  bool push = true,
  bool local = false,
}) => NotificationPreferences.fromPolicyMap(repo.owner, {
  ...repo.preferences.toPolicyMap(),
  'pushEnabled': push,
  'localEnabled': local,
});
Future<void> drain() async {
  for (var i = 0; i < 8; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  test(
    'stalled SDK cancellation cannot prevent owner cleanup and sign-out',
    () async {
      final repo = FakeNotifications(),
          platform = StalledPlatform(),
          local = LocalStub();
      final session = NotificationSession(
        repository: repo,
        platform: platform,
        local: local,
        installationId: () => Future.value('browser'),
        unregisterTimeout: const Duration(milliseconds: 10),
      );
      await session.start();
      final closing = session.close();
      final completed = await Future.any([
        closing.then((_) => true),
        Future<bool>.delayed(const Duration(milliseconds: 100), () => false),
      ]);
      platform.stalled.subscription.release.complete();
      await closing;
      await platform.close();
      await repo.dispose();
      expect(completed, isTrue);
      expect(local.cancelled, contains(repo.owner));
      expect(session.state.closed, isTrue);
    },
  );
  test('sign-out does not wait for a paused UI state listener', () async {
    final repo = FakeNotifications(), platform = PlatformStub();
    final session = NotificationSession(
      repository: repo,
      platform: platform,
      local: LocalStub(),
      installationId: () => Future.value('browser'),
    );
    await session.start();
    final subscription = session.watch().listen((_) {});
    await drain();
    subscription.pause();
    final closed = session.close();
    final completed = await Future.any([
      closed.then((_) => true),
      Future<bool>.delayed(const Duration(milliseconds: 100), () => false),
    ]);
    subscription.resume();
    await closed;
    await subscription.cancel();
    await platform.close();
    await repo.dispose();
    expect(completed, isTrue);
  });
  test(
    'session never prompts passively and rotates current-owner registration',
    () async {
      final repo = FakeNotifications()
            ..preferences = enabled(FakeNotifications()),
          platform = PlatformStub(),
          local = LocalStub();
      final session = NotificationSession(
        repository: repo,
        platform: platform,
        local: local,
        installationId: () => Future.value('browser'),
      );
      await session.start();
      expect(platform.requests, 0);
      expect(repo.device!.channel, NotificationChannel.push);
      platform.tokens.add('synthetic-notification-token-rotated');
      await drain();
      final registrations = repo.commands
          .where((c) => c.$1 == 'register')
          .toList();
      expect(
        (registrations.last.$3 as NotificationDeviceRegistration).token,
        'synthetic-notification-token-rotated',
      );
      await session.close();
      expect(local.cancelled, contains(repo.owner));
      expect(repo.device!.active, isFalse);
      await platform.close();
      await repo.dispose();
    },
  );
  test('denied, unsupported and missing push capability keep the inbox without a push binding', () async {
    for (final permission in [
      NotificationPermission.denied,
      NotificationPermission.unsupported,
      NotificationPermission.granted,
    ]) {
      final repo = FakeNotifications(),
          platform = PlatformStub(),
          local = LocalStub();
      repo.preferences = enabled(repo);
      platform.capability = NotificationCapability(
        platform: NotificationDevicePlatform.web,
        permission: permission,
        pushAvailable: false,
        localAvailable: false,
        token: null,
        message: 'Inbox available',
      );
      final session = NotificationSession(
        repository: repo,
        platform: platform,
        local: local,
        installationId: () => Future.value('browser'),
      );
      await session.start();
      expect(repo.device!.active, isFalse);
      expect(platform.requests, 0);
      await session.requestPermission();
      expect(platform.requests, 1);
      await session.close();
      await platform.close();
      await repo.dispose();
    }
  });
  test('push and local preferences use only one device channel and cached plans never schedule', () async {
    final repo = FakeNotifications(),
        platform = PlatformStub(),
        local = LocalStub();
    repo.preferences = enabled(repo, push: false, local: true);
    platform.capability = const NotificationCapability(
      platform: NotificationDevicePlatform.android,
      permission: NotificationPermission.granted,
      pushAvailable: true,
      localAvailable: true,
      token: 'synthetic-notification-token-browser',
      message: 'Available',
    );
    final session = NotificationSession(
      repository: repo,
      platform: platform,
      local: local,
      installationId: () => Future.value('phone'),
    );
    await session.start();
    expect(repo.device!.channel, NotificationChannel.local);
    final entries = List.generate(
      60,
      (i) => repo.entry(
        'reminder-$i',
        patch: {'status': 'pending', 'visible': false, 'visibleAt': null},
      ),
    );
    repo.scheduled.add(
      DataPage(
        items: entries,
        nextCursor: null,
        hasMore: true,
        isFromCache: false,
      ),
    );
    await drain();
    expect(local.plans.last.length, 50);
    repo.scheduled.add(
      DataPage(
        items: entries,
        nextCursor: null,
        hasMore: true,
        isFromCache: true,
      ),
    );
    await drain();
    expect(local.cancelled, contains(repo.owner));
    repo.preferences = enabled(repo, push: true, local: true);
    repo.updates.add(repo.preferences);
    await drain();
    expect(repo.device!.channel, NotificationChannel.push);
    await session.close();
    await platform.close();
    await repo.dispose();
  });
  test(
    'sign-out invalidates late registration and bounds unavailable unregister',
    () async {
      final repo = FakeNotifications(),
          platform = PlatformStub(),
          local = LocalStub();
      repo.preferences = enabled(repo);
      final session = NotificationSession(
        repository: repo,
        platform: platform,
        local: local,
        installationId: () => Future.value('browser'),
        unregisterTimeout: const Duration(milliseconds: 10),
      );
      await session.start();
      repo.unregistration = Completer<NotificationDevice>();
      final watch = Stopwatch()..start();
      await session.close();
      expect(watch.elapsedMilliseconds, lessThan(1000));
      expect(local.cancelled.last, repo.owner);
      final count = repo.commands.length;
      platform.tokens.add('synthetic-notification-token-late');
      await drain();
      expect(repo.commands.length, count);
      repo.unregistration!.complete(repo.device!);
      await drain();
      expect(session.state.closed, isTrue);
      await platform.close();
      await repo.dispose();
    },
  );
  test(
    'an old registration completion cannot re-enable a disposed session',
    () async {
      final repo = FakeNotifications(),
          platform = PlatformStub(),
          local = LocalStub();
      repo.preferences = enabled(repo);
      final deviceRepo = FakeNotifications();
      await deviceRepo.registerDevice(
        CommandId('fixture'),
        NotificationDeviceRegistration(
          installationId: 'browser',
          platform: NotificationDevicePlatform.web,
          permission: NotificationPermission.granted,
          channel: NotificationChannel.push,
          token: 'synthetic-notification-token-browser',
          appVersion: '0.1.0',
          expectedRevision: 0,
        ),
      );
      repo.registration = Completer<NotificationDevice>();
      final session = NotificationSession(
        repository: repo,
        platform: platform,
        local: local,
        installationId: () => Future.value('browser'),
        unregisterTimeout: const Duration(milliseconds: 10),
      );
      final start = session.start();
      await drain();
      await session.close();
      repo.registration!.complete(deviceRepo.device!);
      await start;
      expect(session.state.closed, isTrue);
      expect(session.state.device, isNull);
      await platform.close();
      await repo.dispose();
      await deviceRepo.dispose();
    },
  );
  test('notification intents contain only validated IDs and must resolve to an owned inbox entry', () async {
    expect(
      () => ReminderIntent.fromData({
        'reminderId': '../other',
        'obligationId': 'loan',
        'instanceId': 'period',
      }),
      throwsA(anything),
    );
    expect(
      () => ReminderIntent.fromData({
        'reminderId': 'one',
        'obligationId': 'loan',
        'instanceId': 'period',
        'amount': '500',
      }),
      throwsA(anything),
    );
    final repo = FakeNotifications(),
        platform = PlatformStub(),
        local = LocalStub(),
        opened = <Uri>[];
    repo.entries.add(repo.entry('one'));
    final session = NotificationSession(
      repository: repo,
      platform: platform,
      local: local,
      installationId: () => Future.value('browser'),
      onOpen: opened.add,
    );
    await session.start();
    platform.opens.add(
      ReminderIntent.fromData({
        'reminderId': 'one',
        'obligationId': 'loan-1',
        'instanceId': 'period-1',
      }),
    );
    await drain();
    expect(opened.single.queryParameters['period'], 'period-1');
    platform.opens.add(
      ReminderIntent.fromData({
        'reminderId': 'foreign',
        'obligationId': 'loan-1',
        'instanceId': 'period-1',
      }),
    );
    await drain();
    expect(opened.length, 1);
    await session.close();
    await platform.close();
    await repo.dispose();
  });
}
