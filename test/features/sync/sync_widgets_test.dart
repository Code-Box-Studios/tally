import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/frozen_command.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/features/sync/presentation/pending_actions.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../financial/repository_paging_test.dart' show FakeCommands;

void main() {
  final owner = OwnerUid('alice');
  final now = DateTime.utc(2026, 10, 8);
  late DriftOutboxStore store;
  setUp(() async {
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'emulator-demo-tally',
    );
  });
  tearDown(() async => store.close());
  Future<void> render(
    WidgetTester tester, {
    double width = 400,
    bool dark = false,
    double scale = 1,
  }) async {
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ownerUidProvider.overrideWithValue(owner),
          syncRuntimeProvider.overrideWith(
            (ref) async => SyncRuntime(
              owner: owner,
              capability: const SyncCapability(
                SyncAvailability.untrustedDevice,
              ),
              gateway: FakeCommands(owner),
            ),
          ),
          pendingActionsProvider.overrideWith(
            (ref) => store.watch(limit: 1000, unresolvedOnly: true),
          ),
        ],
        child: MaterialApp(
          theme: dark ? TallyTheme.dark() : TallyTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: const Scaffold(
            body: SingleChildScrollView(child: PendingActions()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  FrozenCommand action(String id, String currency, int amount) => FrozenCommand(
    owner: owner,
    id: CommandId(id),
    name: CommandName.recordPayment,
    payload: {
      'obligationId': 'loan-$id',
      'obligationInstanceId': 'period-$id',
      'amountMinor': amount,
      'currency': currency,
    },
    resourceKey: 'obligation:loan-$id',
    createdAt: now,
  );
  testWidgets(
    'pending money remains individually labeled by currency and state at all widths',
    (tester) async {
      await store.enqueue(action('php', 'PHP', 250000));
      await store.enqueue(action('usd', 'USD', 50000));
      for (final width in [360.0, 800.0, 1440.0]) {
        for (final dark in [false, true]) {
          await render(tester, width: width, dark: dark, scale: 2);
          expect(find.text('Waiting to sync'), findsWidgets);
          expect(find.textContaining('PHP'), findsOneWidget);
          expect(find.textContaining('USD'), findsOneWidget);
          expect(find.textContaining('Saved on this device'), findsOneWidget);
          expect(tester.takeException(), isNull);
        }
      }
    },
  );
  testWidgets(
    'unverified acknowledgement is visible as review rather than confirmed payment',
    (tester) async {
      await store.enqueue(action('uncertain', 'PHP', 250000));
      final dispatch = (await store.claimDispatch(now, token: 'review'))!;
      final lease = (await store.claimNext(dispatch, now))!;
      await store.defer(
        lease,
        const FinancialFailure(FinancialFailureCode.recovery, 'Review.'),
        now,
        now,
      );
      await render(tester);
      expect(find.text('Needs verification'), findsOneWidget);
      expect(find.text('Confirmed'), findsNothing);
    },
  );
}
