import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/features/sync/presentation/sync_screen.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

void main() {
  final owner = OwnerUid('alice'), now = DateTime.utc(2026, 10, 8);
  late DriftOutboxStore store;
  late SyncRuntime runtime;
  setUp(() async {
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'emulator-demo-tally',
    );
    runtime = SyncRuntime(
      owner: owner,
      capability: const SyncCapability(SyncAvailability.durable),
      gateway: FakeCommands(owner),
      store: store,
      engine: SyncEngine(
        store: store,
        transport: FirebaseCommandTransport(
          owner: owner,
          isOwnerActive: () => true,
          invoke: (_, _) async =>
              throw StateError('No network in this fixture.'),
        ),
        validateResult: validateCommandResult,
      ),
    );
  });
  tearDown(() async => runtime.dispose());
  FrozenCommand command(String id) => FrozenCommand(
    owner: owner,
    id: CommandId(id),
    name: CommandName.recordPayment,
    payload: {
      'obligationId': 'loan',
      'obligationInstanceId': 'period',
      'amountMinor': 200000,
      'currency': 'PHP',
    },
    resourceKey: 'obligation:loan',
    createdAt: now,
  );
  Future<void> render(
    WidgetTester tester, {
    double width = 400,
    bool dark = false,
  }) async {
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ownerUidProvider.overrideWithValue(owner),
          syncRuntimeProvider.overrideWith((_) async => runtime),
        ],
        child: MaterialApp(
          theme: dark ? TallyTheme.dark() : TallyTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: const Scaffold(body: SyncScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'Sync labels pending money honestly at all widths and offers history separately',
    (tester) async {
      await store.enqueue(command('pending'));
      for (final width in [360.0, 800.0, 1440.0]) {
        for (final dark in [false, true]) {
          await render(tester, width: width, dark: dark);
          expect(find.text('Saved actions'), findsOneWidget);
          expect(find.text('Waiting to sync'), findsWidgets);
          expect(find.textContaining('PHP'), findsOneWidget);
          expect(find.textContaining('confirmed balances'), findsOneWidget);
          expect(tester.takeException(), isNull);
        }
      }
    },
  );
  testWidgets(
    'history loads additional local pages without hiding unresolved actions',
    (tester) async {
      for (var n = 0; n < 102; n++) {
        final cmd = command('cancelled-$n');
        await store.enqueue(cmd);
        await store.cancelUnsent(cmd.id, now);
      }
      await store.enqueue(command('still-pending'));
      await render(tester);
      await tester.ensureVisible(find.text('History'));
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      expect(find.text('Cancelled on this device'), findsNWidgets(99));
      final more = find.text('Load more');
      await tester.ensureVisible(more);
      await tester.tap(more);
      await tester.pumpAndSettle();
      expect(find.text('Cancelled on this device'), findsNWidgets(102));
      expect(find.textContaining('PHP'), findsNWidgets(103));
      expect(tester.takeException(), isNull);
    },
  );
}
