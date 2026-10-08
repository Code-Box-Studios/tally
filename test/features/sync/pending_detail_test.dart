import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/durable_owner_commands.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_dependencies.dart';
import 'package:tally/features/sync/domain/command_identity.dart';
import 'package:tally/features/sync/domain/command_name.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/pending_obligation_detail.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/failing_ack_outbox.dart';

import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_forms_test.dart' show UiDocuments, UiCommands;
import '../financial/financial_scope_test.dart' show draft;

void main() {
  final owner = OwnerUid('alice'), id = CommandId('borrow-offline');
  late DriftOutboxStore store;
  late SyncRuntime runtime;
  late UiDocuments canonical;
  setUp(() async {
    canonical = UiDocuments();
    store = await DriftOutboxStore.open(
      OutboxDatabase(NativeDatabase.memory()),
      owner: owner,
      environmentKey: 'emulator-demo-tally',
    );
    final dependencies = CommandDependencies(store: store);
    await store.enqueue(
      await dependencies.freeze(
        CommandName.createObligation,
        id,
        draft().toPayload(),
        DateTime.now().toUtc(),
      ),
    );
    final transport = FirebaseCommandTransport(
      owner: owner,
      isOwnerActive: () => true,
      invoke: (_, _) async => throw const FinancialFailure(
        FinancialFailureCode.offline,
        'Reconnect.',
      ),
    );
    final engine = SyncEngine(
      store: store,
      transport: transport,
      validateResult: validateCommandResult,
    );
    runtime = SyncRuntime(
      owner: owner,
      capability: const SyncCapability(SyncAvailability.durable),
      store: store,
      engine: engine,
      gateway: DurableOwnerCommands(
        raw: UiCommands(canonical),
        engine: engine,
        dependencies: dependencies,
      ),
    );
  });
  tearDown(() async {
    await runtime.dispose();
    await canonical.changes.close();
  });
  Future<void> render(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ownerUidProvider.overrideWithValue(owner),
          userProfileProvider.overrideWithValue(profile('alice')),
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(projectId: 'demo-tally'),
          ),
          ownerDocumentsFactoryProvider.overrideWithValue((_) => canonical),
          ownerCommandsFactoryProvider.overrideWithValue(
            (_) => UiCommands(canonical),
          ),
          syncRuntimeProvider.overrideWith((ref) {
            ref.onDispose(() => unawaited(runtime.engine!.dispose()));
            return Future.value(runtime);
          }),
        ],
        child: MaterialApp(
          theme: TallyTheme.light(),
          home: Scaffold(body: PendingObligationDetail(commandId: id)),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> pay(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('pending-add-payment')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('pending-payment-amount')),
      '2000',
    );
    await tester.tap(find.byKey(const Key('pending-payment-save')));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'new pending finite loan accepts a dependent payment without creating canonical records',
    (tester) async {
      await render(tester);
      await pay(tester);
      final rows = (await store.getPage()).items;
      expect(rows.length, 2);
      final payment = rows.first.command;
      expect(payment.name, CommandName.recordPayment);
      expect(payment.dependencies.single.id, id);
      expect(payment.payload['amountMinor'], 200000);
      expect(payment.resourceKey, rows.last.command.resourceKey);
      expect(canonical.data['obligations'], isEmpty);
      expect(canonical.data['payments'], isEmpty);
      expect(find.textContaining('Waiting to sync'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'a rejected action can move to history while its original intent stays intact',
    (tester) async {
      final dispatch = (await store.claimDispatch(
        DateTime.now().toUtc(),
        token: 'reject',
      ))!;
      final lease = (await store.claimNext(dispatch, DateTime.now().toUtc()))!;
      await store.reject(
        lease,
        const FinancialFailure(FinancialFailureCode.invalid, 'Check details.'),
        DateTime.now().toUtc(),
      );
      await store.releaseDispatch(dispatch);
      await render(tester);
      final dismiss = find.text('Move to history');
      expect(dismiss, findsOneWidget);
      await tester.ensureVisible(dismiss);
      await tester.tap(dismiss);
      await tester.pumpAndSettle();
      expect(find.text('Rejected · moved to history'), findsOneWidget);
      expect(find.text('Move to history'), findsNothing);
      final original = (await store.get(id))!;
      expect(original.state.name, 'dismissed');
      expect(original.command.sameIdentity(lease.entry.command), isTrue);
      expect((await store.getPage(unresolvedOnly: true)).items, isEmpty);
    },
  );

  testWidgets(
    'post-dispatch quota freezes the original payment draft for reconciliation',
    (tester) async {
      await runtime.engine!.dispose();
      final faulty = FailingAckOutbox(store)..failAcknowledgements = false;
      final transport = FirebaseCommandTransport(
        owner: owner,
        isOwnerActive: () => true,
        invoke: (name, _) async {
          if (name == 'recordPayment') faulty.failAcknowledgements = true;
          return {
            if (name == 'recordPayment') 'paymentId': 'one-canonical-payment',
            'obligationId': predictedCommandId(owner, id, 'obligation'),
            'obligationInstanceId': predictedCommandId(owner, id, 'instance'),
            'obligationRevision': 1,
            'instanceRevision': 1,
          };
        },
      );
      final engine = SyncEngine(
        store: faulty,
        transport: transport,
        validateResult: validateCommandResult,
      );
      runtime = SyncRuntime(
        owner: owner,
        capability: const SyncCapability(SyncAvailability.durable),
        store: store,
        engine: engine,
        gateway: DurableOwnerCommands(
          raw: UiCommands(canonical),
          engine: engine,
          dependencies: CommandDependencies(store: store),
        ),
      );
      await render(tester);
      await pay(tester);
      expect(find.text('Retry original payment'), findsOneWidget);
      final field = tester.widget<TextFormField>(
        find.byKey(const Key('pending-payment-amount')),
      );
      expect(
        tester
            .widget<EditableText>(
              find.descendant(
                of: find.byKey(const Key('pending-payment-amount')),
                matching: find.byType(EditableText),
              ),
            )
            .readOnly,
        isTrue,
      );
      expect(field.controller!.text, '2000');
      expect(find.textContaining('confirm'), findsWidgets);
      expect(find.textContaining('not saved'), findsNothing);
      expect((await store.getPage()).items, hasLength(2));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a real local write denial keeps the payment draft and reports no saved payment',
    (tester) async {
      await render(tester);
      await store.database.customStatement('PRAGMA query_only=ON');
      await pay(tester);
      expect((await store.getPage()).items.length, 1);
      expect(find.byKey(const Key('pending-payment-amount')), findsOneWidget);
      final field = tester.widget<TextFormField>(
        find.byKey(const Key('pending-payment-amount')),
      );
      expect(field.controller!.text, '2000');
      expect(
        find.textContaining('Keep your draft'),
        findsOneWidget,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((w) => w.data)
            .join(' | '),
      );
      expect(canonical.data['payments'], isEmpty);
    },
  );
}
