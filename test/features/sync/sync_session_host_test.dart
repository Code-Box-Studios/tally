import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/outbox_entry.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/features/sync/presentation/sync_session_host.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

void main() {
  testWidgets(
    'owner host wakes persisted actions at startup and on connectivity; disposal removes the listener',
    (tester) async {
      final owner = OwnerUid('alice'), now = DateTime.now().toUtc();
      final store = await DriftOutboxStore.open(
        OutboxDatabase(NativeDatabase.memory()),
        owner: owner,
        environmentKey: 'demo-tally',
      );
      final events = StreamController<void>.broadcast();
      var calls = 0;
      final engine = SyncEngine(
        store: store,
        transport: FirebaseCommandTransport(
          owner: owner,
          isOwnerActive: () => true,
          invoke: (_, _) async {
            calls++;
            return {'preferenceRevision': 1};
          },
        ),
        validateResult: validateCommandResult,
      );
      final runtime = SyncRuntime(
        owner: owner,
        capability: const SyncCapability(SyncAvailability.durable),
        gateway: FakeCommands(owner),
        store: store,
        engine: engine,
      );
      FrozenCommand command(String id) => FrozenCommand(
        owner: owner,
        id: CommandId(id),
        name: CommandName.updateNotificationPreferences,
        payload: const {},
        resourceKey: 'notifications:alice',
        createdAt: now,
      );
      await store.enqueue(command('startup'));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ownerUidProvider.overrideWithValue(owner),
            syncRuntimeProvider.overrideWith((_) async => runtime),
            syncOnlineEventsProvider.overrideWithValue(events.stream),
          ],
          child: const MaterialApp(
            home: SyncSessionHost(child: Text('Workspace')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      for (var i = 0; i < 100 && calls == 0; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      await tester.pumpAndSettle();
      expect(calls, 1);
      expect(
        (await store.get(CommandId('startup')))!.state,
        OutboxState.accepted,
      );
      await store.enqueue(command('online'));
      events.add(null);
      await tester.pumpAndSettle();
      for (var i = 0; i < 100 && calls < 2; i++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(calls, 2);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await store.enqueue(command('after-dispose'));
      events.add(null);
      await tester.pumpAndSettle();
      expect(calls, 2);
      await engine.dispose();
      await events.close();
      await store.close();
    },
  );
}
