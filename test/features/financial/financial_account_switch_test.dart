import 'package:tally/features/sync/presentation/sync_providers.dart';

import '../../support/online_commands.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/tally_app.dart';
import 'package:tally/app/app_router.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/auth/domain/auth_repository.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/notifications/data/installation_store.dart';
import 'package:tally/features/notifications/presentation/notification_session_providers.dart';
import 'package:tally/shared/presentation/financial_providers.dart';
import 'package:tally/shared/domain/financial_failure.dart';

import '../auth/session_controller_test.dart'
    show AuthFixture, ProfileFixture, profile;
import 'financial_forms_test.dart' show UiDocuments, UiCommands, enter, tap;
import 'financial_dto_test.dart' show obligationData;
import '../notifications/local_notification_adapter_test.dart'
    show MemoryValues;

void main() {
  testWidgets(
    'real private UID scope removes old financial data and discards a late payment response',
    (tester) async {
      final auth = AuthFixture();
      final profiles = ProfileFixture();
      final alice = UiDocuments();
      final bob = UiDocuments(uid: 'bob');
      bob.documentFailure = const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed or this record is unavailable. Sign in again.',
      );
      alice.data['obligations']!['loan-1'] = {
        ...obligationData(),
        'title': 'Alice private loan',
      };
      final aliceCommands = UiCommands(alice);
      final bobCommands = UiCommands(bob);
      final container = ProviderContainer(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(projectId: 'demo-tally'),
          ),
          authRepositoryProvider.overrideWithValue(auth),
          profileRepositoryProvider.overrideWithValue(profiles),
          installationStoreProvider.overrideWithValue(
            InstallationStore(MemoryValues()),
          ),
          ownerDocumentsFactoryProvider.overrideWithValue(
            (owner) => owner.value == 'alice' ? alice : bob,
          ),
          syncRuntimeFactoryProvider.overrideWithValue(onlineOnlyTestRuntime),
          ownerCommandsFactoryProvider.overrideWithValue(
            (owner) => owner.value == 'alice' ? aliceCommands : bobCommands,
          ),
        ],
      );
      addTearDown(container.dispose);
      addTearDown(auth.identities.close);
      addTearDown(alice.changes.close);
      addTearDown(bob.changes.close);
      addTearDown(() async {
        for (final stream in profiles.streams.values) {
          await stream.close();
        }
      });
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const TallyApp(),
        ),
      );
      await tester.pump();
      auth.identities.add(AuthIdentity(OwnerUid('alice')));
      await tester.pump();
      await tester.pump();
      profiles.responses['alice']!.complete(profile('alice'));
      await tester.pumpAndSettle();
      container.read(appRouterProvider).go('/obligations/loan-1');
      await tester.pumpAndSettle();
      expect(find.text('Alice private loan'), findsWidgets);
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '1000');
      aliceCommands.delay = Completer<void>();
      await tester.ensureVisible(find.byKey(const Key('payment-save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('payment-save')));
      await tester.pump();
      expect(aliceCommands.requests, ['recordPayment']);
      auth.identities.add(AuthIdentity(OwnerUid('bob')));
      await tester.runAsync(() async {
        await Future<void>.delayed(Duration.zero);
      });
      await tester.pump();
      profiles.responses['bob']!.complete(profile('bob'));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.text(
          'Your sign-in changed or this record is unavailable. Sign in again.',
        ),
        findsOneWidget,
      );
      await tester.pumpAndSettle();
      aliceCommands.delay!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Alice private loan'), findsNothing);
      expect(find.byKey(const Key('payment-save')), findsNothing);
      expect(find.text('₱7,000 PHP'), findsNothing);
      expect(bobCommands.requests, isEmpty);
      expect(
        find.text(
          'Your sign-in changed or this record is unavailable. Sign in again.',
        ),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);
      expect(tester.takeException(), isNull);
      // The searchable branch now subscribes to the civil-day clock. Unmount
      // the externally owned container's view and let autoDispose cancel it.
      await tester.pumpWidget(const SizedBox.shrink());
      container.dispose();
      // Let bounded startup/SDK cancellation deadlines expire in fake time.
      // A closed owner cannot resume a command after these late completions.
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      // The sign-out cleanup may read this owner's device metadata; it may
      // never resume the pending financial command in the replacement scope.
      expect(bobCommands.requests, everyElement('listNotificationDevices'));
      expect(tester.takeException(), isNull);
    },
  );
}
