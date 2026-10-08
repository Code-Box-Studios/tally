import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/sync/data/command_result_validation.dart';
import 'package:tally/features/sync/data/drift_outbox_store.dart';
import 'package:tally/features/sync/data/durable_owner_commands.dart';
import 'package:tally/features/sync/data/firebase_command_transport.dart';
import 'package:tally/features/sync/data/outbox_database.dart';
import 'package:tally/features/sync/domain/command_dependencies.dart';
import 'package:tally/features/sync/domain/sync_capability.dart';
import 'package:tally/features/sync/domain/sync_engine.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../features/auth/session_controller_test.dart'
    show profile, AuthFixture, ProfileFixture;
import '../features/financial/financial_forms_test.dart'
    show UiDocuments, enter, tap;
import '../features/sync/financial_submission_test.dart'
    show SubmissionCommands;

class RouteCommands extends SubmissionCommands {
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    final result = await super.call(name, id, payload);
    return name == 'createRecurring'
        ? {...result, 'generationRevision': 1, 'firstInstanceId': null}
        : result;
  }
}

void main() {
  for (final recurring in [false, true]) {
    for (final offline in [false, true]) {
      testWidgets(
        offline
            ? 'queued obligation navigates to its local identity without inventing a canonical record'
            : 'accepted ${recurring ? "monthly due" : "loan"} opens canonical identity even before its record stream arrives',
        (tester) async {
          tester.view.physicalSize = const Size(400, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          final owner = OwnerUid('alice'),
              docs = UiDocuments(),
              raw = RouteCommands();
          final auth = AuthFixture();
          addTearDown(auth.identities.close);
          final store = await DriftOutboxStore.open(
            OutboxDatabase(NativeDatabase.memory()),
            owner: owner,
            environmentKey: 'emulator-demo-tally',
          );
          final engine = SyncEngine(
            store: store,
            transport: FirebaseCommandTransport(
              owner: owner,
              isOwnerActive: () => true,
              invoke: (_, _) async => throw const FinancialFailure(
                FinancialFailureCode.offline,
                'Reconnect.',
              ),
            ),
            validateResult: validateCommandResult,
          );
          final runtime = offline
              ? SyncRuntime(
                  owner: owner,
                  capability: const SyncCapability(SyncAvailability.durable),
                  store: store,
                  engine: engine,
                  gateway: DurableOwnerCommands(
                    raw: raw,
                    engine: engine,
                    dependencies: CommandDependencies(store: store),
                  ),
                )
              : SyncRuntime(
                  owner: owner,
                  capability: const SyncCapability(
                    SyncAvailability.unavailable,
                  ),
                  gateway: raw,
                );
          addTearDown(() async {
            await engine.dispose();
            await runtime.dispose();
            if (!offline) await store.close();
            await docs.changes.close();
          });
          final router = createAppRouter(
            initialLocation: recurring
                ? '/obligations/recurring/new'
                : '/obligations/new',
          );
          addTearDown(router.dispose);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                appRouterProvider.overrideWithValue(router),
                authRepositoryProvider.overrideWithValue(auth),
                profileRepositoryProvider.overrideWithValue(ProfileFixture()),
                environmentProvider.overrideWithValue(
                  const EnvironmentConfig.emulator(projectId: 'demo-tally'),
                ),
                ownerUidProvider.overrideWithValue(owner),
                userProfileProvider.overrideWithValue(profile('alice')),
                ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
                ownerCommandsFactoryProvider.overrideWithValue((_) => raw),
                syncRuntimeProvider.overrideWith((ref) {
                  ref.onDispose(() => unawaited(engine.dispose()));
                  return Future.value(runtime);
                }),
              ],
              child: const TallyApp(),
            ),
          );
          await tester.pumpAndSettle();
          if (recurring) {
            await enter(tester, 'recurring-title', 'A saved private loan');
            await enter(tester, 'recurring-amount', '1000');
            await tap(tester, 'recurring-save');
          } else {
            await enter(tester, 'obligation-title', 'A saved private loan');
            await enter(tester, 'obligation-amount', '1000');
            await enter(tester, 'obligation-due', '2026-11-15');
            await tap(tester, 'obligation-save');
          }
          if (offline) {
            final row = (await store.getPage()).items.single;
            expect(
              router.routeInformationProvider.value.uri.path,
              '/settings/sync/${row.command.id.value}',
            );
            expect(find.text('A saved private loan'), findsOneWidget);
            expect(
              find.textContaining('Confirmed balances do not include'),
              findsOneWidget,
            );
          } else {
            expect(
              router.routeInformationProvider.value.uri.path,
              '/obligations/canonical',
            );
            expect(find.text('Saved · updating records'), findsOneWidget);
          }
          expect(docs.data['obligations'], isEmpty);
          expect(docs.data['payments'], isEmpty);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
