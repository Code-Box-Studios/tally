import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/notifications/domain/notification_device.dart';
import 'package:tally/features/notifications/domain/notification_platform.dart';
import 'package:tally/features/notifications/presentation/notification_session.dart';
import 'package:tally/features/notifications/presentation/notification_session_providers.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../../support/notification_fixtures.dart';
import 'notification_session_test.dart'
    show PlatformStub, LocalStub, enabled, drain;

class DeviceServer {
  NotificationDevice? device;
  final receipts = <CommandId, NotificationDevice>{};
}

class RecoveringRepository extends FakeNotifications {
  RecoveringRepository([DeviceServer? server])
    : server = server ?? DeviceServer();
  final DeviceServer server;
  bool loseResponse = false, rejectRegistration = false;
  int failedLists = 0, listCalls = 0;
  @override
  Future<DataPage<NotificationDevice>> listDevices(
    CommandId id,
    NotificationDeviceQuery query, {
    PageCursor? after,
  }) async {
    listCalls++;
    if (failedLists > 0) {
      failedLists--;
      throw const FinancialFailure(FinancialFailureCode.offline, 'Offline');
    }
    return DataPage(
      items: server.device == null ? [] : [server.device!],
      nextCursor: null,
      hasMore: false,
      isFromCache: false,
    );
  }

  @override
  Future<NotificationDevice> registerDevice(
    CommandId id,
    NotificationDeviceRegistration value,
  ) async {
    commands.add(('register', id, value));
    if (rejectRegistration) {
      throw const FinancialFailure(FinancialFailureCode.offline, 'Offline');
    }
    final receipt = server.receipts[id];
    if (receipt != null) return receipt;
    if (value.expectedRevision != (server.device?.revision ?? 0)) {
      throw const FinancialFailure(FinancialFailureCode.conflict, 'Changed');
    }
    final result = NotificationDevice(
      owner: owner,
      installationId: value.installationId,
      platform: value.platform,
      permission: value.permission,
      channel: value.channel,
      appVersion: value.appVersion,
      active: value.channel != NotificationChannel.none,
      revision: value.expectedRevision + 1,
      lastSeenAt: DateTime.now().toUtc(),
    );
    device = server.device = result;
    server.receipts[id] = result;
    if (loseResponse) {
      loseResponse = false;
      throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Lost response',
      );
    }
    return result;
  }

  @override
  Future<NotificationDevice> unregisterDevice(
    CommandId id,
    NotificationDevice value,
  ) async {
    if (value.revision != server.device?.revision) {
      throw const FinancialFailure(FinancialFailureCode.conflict, 'Changed');
    }
    return server.device = await super.unregisterDevice(id, value);
  }
}

class OpeningPlatform extends PlatformStub {
  ReminderIntent? initial;
  Completer<NotificationCapability>? inspection;
  int initialCalls = 0;
  @override
  Future<ReminderIntent?> initialMessage() async {
    initialCalls++;
    return initial;
  }

  @override
  Future<NotificationCapability> inspect() =>
      inspection?.future ?? super.inspect();
}

NotificationSession sessionFor(
  RecoveringRepository repo,
  OpeningPlatform platform,
  LocalStub local, {
  void Function(Uri)? onOpen,
}) => NotificationSession(
  repository: repo,
  platform: platform,
  local: local,
  installationId: () async => 'shared-installation',
  onOpen: onOpen,
  unregisterTimeout: const Duration(milliseconds: 20),
);

ReminderIntent intent(String id) => ReminderIntent.fromData({
  'reminderId': id,
  'obligationId': 'loan-1',
  'instanceId': 'period-1',
});

void nativeLocal(RecoveringRepository repo, OpeningPlatform platform) {
  repo.preferences = enabled(repo, push: false, local: true);
  platform.capability = const NotificationCapability(
    platform: NotificationDevicePlatform.android,
    permission: NotificationPermission.granted,
    pushAvailable: false,
    localAvailable: true,
    token: null,
    message: 'Local available',
  );
}

void main() {
  testWidgets(
    'foreground resume repairs a transient binding without prompting',
    (tester) async {
      final repo = RecoveringRepository()..failedLists = 1;
      repo.preferences = enabled(repo);
      final platform = OpeningPlatform();
      late NotificationSession session;
      await tester.runAsync(() async {
        session = sessionFor(repo, platform, LocalStub());
        await session.start();
      });
      expect(repo.server.device, isNull);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [notificationSessionProvider.overrideWithValue(session)],
          child: const MaterialApp(
            home: NotificationSessionHost(child: Text('Private workspace')),
          ),
        ),
      );
      await tester.runAsync(() async {
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await drain();
      });
      expect(repo.server.device?.channel, NotificationChannel.push);
      expect(platform.requests, 0);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        await session.close();
        await platform.close();
        await repo.dispose();
      });
    },
  );
  test(
    'two tabs sharing an installation recover the current device revision',
    () async {
      final server = DeviceServer();
      final first = RecoveringRepository(server),
          second = RecoveringRepository(server);
      first.preferences = enabled(first);
      second.preferences = enabled(second);
      final firstPlatform = OpeningPlatform(),
          secondPlatform = OpeningPlatform();
      final a = sessionFor(first, firstPlatform, LocalStub());
      final b = sessionFor(second, secondPlatform, LocalStub());
      await a.start();
      await b.start();
      firstPlatform.tokens.add('synthetic-notification-token-newest');
      await drain();
      final last = first.commands.lastWhere((entry) => entry.$1 == 'register');
      final accepted = server.receipts[last.$2];
      expect(accepted, isNotNull);
      expect(a.state.device?.revision, server.device!.revision);
      expect(a.state.message, contains('Push alerts are ready'));
      await a.close();
      await b.close();
      await firstPlatform.close();
      await secondPlatform.close();
      await first.dispose();
      await second.dispose();
    },
  );

  test(
    'a lost committed registration retries its frozen command receipt',
    () async {
      final repo = RecoveringRepository()..loseResponse = true;
      repo.preferences = enabled(repo);
      final platform = OpeningPlatform();
      final session = sessionFor(repo, platform, LocalStub());
      await session.start();
      final original = repo.commands.firstWhere(
        (entry) => entry.$1 == 'register',
      );
      await session.requestPermission();
      final registrations = repo.commands
          .where((entry) => entry.$1 == 'register')
          .toList();
      expect(registrations[1].$2, original.$2);
      expect(identical(registrations[1].$3, original.$3), isTrue);
      expect(repo.server.receipts.length, 1);
      expect(session.state.device?.revision, 1);
      await session.close();
      await platform.close();
      await repo.dispose();
    },
  );

  test('sign-out refreshes a revision advanced by another tab', () async {
    final repo = RecoveringRepository();
    repo.preferences = enabled(repo);
    final platform = OpeningPlatform();
    final session = sessionFor(repo, platform, LocalStub());
    await session.start();
    final other = RecoveringRepository(repo.server);
    await other.registerDevice(
      CommandId('other-tab'),
      NotificationDeviceRegistration(
        installationId: 'shared-installation',
        platform: NotificationDevicePlatform.web,
        permission: NotificationPermission.granted,
        channel: NotificationChannel.push,
        token: 'synthetic-notification-token-browser',
        appVersion: '0.1.0',
        expectedRevision: repo.server.device!.revision,
      ),
    );
    await session.close();
    expect(repo.server.device!.active, isFalse);
    await platform.close();
    await repo.dispose();
    await other.dispose();
  });

  test(
    'queued local pages cannot restore alerts after disabling fails offline',
    () async {
      final repo = RecoveringRepository(),
          platform = OpeningPlatform(),
          local = LocalStub();
      nativeLocal(repo, platform);
      final session = sessionFor(repo, platform, local);
      await session.start();
      platform.inspection = Completer<NotificationCapability>();
      repo.rejectRegistration = true;
      repo.preferences = enabled(repo, push: false, local: false);
      repo.updates.add(repo.preferences);
      await drain();
      repo.scheduled.add(
        DataPage(
          items: [
            repo.entry(
              'stale-local',
              patch: {'status': 'pending', 'visible': false, 'visibleAt': null},
            ),
          ],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      );
      await drain();
      platform.inspection!.complete(platform.capability);
      await drain();
      expect(local.plans, isEmpty);
      expect(local.cancelled, contains(repo.owner));
      await session.close();
      await platform.close();
      await repo.dispose();
    },
  );

  test('a due pending native reminder opens its exact owned period before publication', () async {
    final repo = RecoveringRepository(),
        platform = OpeningPlatform(),
        opened = <Uri>[];
    nativeLocal(repo, platform);
    repo.entries.add(
      repo.entry(
        'local-due',
        patch: {
          'status': 'pending',
          'visible': false,
          'visibleAt': null,
          'scheduledAt': DateTime.now().toUtc().subtract(
            const Duration(minutes: 1),
          ),
        },
      ),
    );
    final session = sessionFor(repo, platform, LocalStub(), onOpen: opened.add);
    await session.start();
    platform.opens.add(intent('local-due'));
    await drain();
    expect(opened.single.path, '/obligations/loan-1');
    expect(opened.single.queryParameters['period'], 'period-1');
    await session.close();
    await platform.close();
    await repo.dispose();
  });

  test(
    'a future pending or cancelled local target cannot open a period',
    () async {
      final repo = RecoveringRepository(),
          platform = OpeningPlatform(),
          opened = <Uri>[];
      nativeLocal(repo, platform);
      repo.entries.addAll([
        repo.entry(
          'future',
          patch: {
            'status': 'pending',
            'visible': false,
            'visibleAt': null,
            'scheduledAt': DateTime.now().toUtc().add(const Duration(days: 1)),
          },
        ),
        repo.entry(
          'cancelled',
          patch: {'status': 'cancelled', 'visible': false, 'visibleAt': null},
        ),
      ]);
      final session = sessionFor(
        repo,
        platform,
        LocalStub(),
        onOpen: opened.add,
      );
      await session.start();
      platform.opens.add(intent('future'));
      platform.opens.add(intent('cancelled'));
      await drain();
      expect(opened, isEmpty);
      await session.close();
      await platform.close();
      await repo.dispose();
    },
  );

  test(
    'startup device-list failure still consumes the initial owned notification',
    () async {
      final repo = RecoveringRepository()..failedLists = 1;
      repo.entries.add(repo.entry('initial'));
      final platform = OpeningPlatform()..initial = intent('initial');
      final opened = <Uri>[];
      final session = sessionFor(
        repo,
        platform,
        LocalStub(),
        onOpen: opened.add,
      );
      await session.start();
      await drain();
      expect(opened.single.queryParameters['period'], 'period-1');
      expect(platform.initialCalls, 1);
      await session.start();
      platform.tokens.add('synthetic-notification-token-reconnected');
      await drain();
      expect(repo.server.device, isNotNull);
      expect(platform.initialCalls, 1);
      expect(platform.requests, 0);
      await session.close();
      await platform.close();
      await repo.dispose();
    },
  );

  test(
    'opens and preference listeners survive an initial online list failure',
    () async {
      final repo = RecoveringRepository()..failedLists = 1;
      repo.entries.add(repo.entry('later'));
      final platform = OpeningPlatform(), local = LocalStub(), opened = <Uri>[];
      nativeLocal(repo, platform);
      final session = sessionFor(repo, platform, local, onOpen: opened.add);
      await session.start();
      platform.opens.add(intent('later'));
      repo.updates.add(repo.preferences);
      await drain();
      expect(opened.single.queryParameters['period'], 'period-1');
      expect(repo.server.device?.channel, NotificationChannel.local);
      await session.close();
      await platform.close();
      await repo.dispose();
    },
  );
}
