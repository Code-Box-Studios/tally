import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/accounts/domain/account_deletion.dart';
import 'package:tally/features/accounts/domain/account_deletion_controller.dart';
import 'package:tally/features/accounts/domain/deletion_local_recovery.dart';
import 'package:tally/features/accounts/domain/deletion_handoff_store.dart';
import 'package:tally/features/accounts/data/deletion_handoff_store.dart';
import 'package:tally/features/accounts/presentation/account_deletion_form.dart';
import 'package:tally/features/accounts/presentation/account_deletion_providers.dart';
import 'package:tally/features/accounts/presentation/deletion_handoff_host.dart';
import 'package:tally/features/accounts/presentation/deletion_recovery_providers.dart';
import 'package:tally/features/sync/presentation/sync_providers.dart';

import 'account_deletion_controller_test.dart'
    show
        Authentication,
        Repository,
        Cleanup,
        alice,
        bob,
        environment,
        confirmation;

void main() {
  late SharedPreferencesDeletionHandoffs handoffs;
  late Authentication authentication;
  late Repository repository;
  late Cleanup cleanup;
  late AccountDeletionController controller;
  var cancelled = 0;
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    handoffs = SharedPreferencesDeletionHandoffs();
    authentication = Authentication();
    repository = Repository(authentication);
    cleanup = Cleanup(handoffs);
    controller = AccountDeletionController(
      scope: (owner: alice, environment: environment),
      repository: repository,
      authentication: authentication,
      handoffs: handoffs,
      cleanup: cleanup,
      newId: () => CommandId('delete-widget'),
    );
    cancelled = 0;
  });
  tearDown(() {
    controller.dispose();
    SharedPreferencesAsyncPlatform.instance = null;
  });
  Future<void> mount(
    WidgetTester tester, {
    double width = 400,
    bool dark = false,
    double scale = 1,
    double keyboard = 0,
  }) async {
    tester.view.physicalSize = Size(width, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: dark ? TallyTheme.dark() : TallyTheme.light(),
        home: MediaQuery(
          data: MediaQueryData(
            size: Size(width, 900),
            textScaler: TextScaler.linear(scale),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
          child: Scaffold(
            body: AccountDeletionForm(
              controller: controller,
              onCancel: () {
                cancelled++;
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> fill(WidgetTester tester) async {
    await tester.enterText(
      find.byKey(const Key('deletion-confirmation')),
      'DELETE',
    );
    await tester.enterText(
      find.byKey(const Key('deletion-password')),
      'synthetic-password',
    );
    await tester.ensureVisible(
      find.byKey(const Key('deletion-acknowledgement')),
    );
    await tester.tap(find.byKey(const Key('deletion-acknowledgement')));
    await tester.pumpAndSettle();
  }

  List<Override> rootOverrides({
    required DeletionRecoveryReport report,
    required OwnerUid? viewer,
  }) => [
    environmentProvider.overrideWithValue(
      const EnvironmentConfig.emulator(
        projectId: 'demo-tally',
        endpoints: EmulatorEndpoints(host: '127.0.0.1'),
      ),
    ),
    syncEnvironmentProvider.overrideWithValue(environment),
    deletionRecoveryProvider.overrideWithBuild((_, _) => report),
    deletionViewerOwnerProvider.overrideWithValue(viewer),
    recentAuthenticationFactoryProvider.overrideWithValue(
      (_) => authentication,
    ),
    accountDeletionControllerFactoryProvider.overrideWithValue(
      (_) => controller,
    ),
  ];
  testWidgets(
    'restart uncertainty can reopen verification outside the disposed private scope',
    (tester) async {
      final pending = DeletionHandoff(
        owner: alice,
        environment: environment,
        requestId: CommandId('saved-original'),
        phase: DeletionHandoffPhase.uncertain,
      );
      await handoffs.write(pending);
      final root = ProviderContainer(
        overrides: rootOverrides(
          report: DeletionRecoveryReport(pending: [pending]),
          viewer: alice,
        ),
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Verify sign-in again'));
      await tester.pumpAndSettle();
      expect(find.text('Delete your account'), findsOneWidget);
      expect(find.text('Back to request status'), findsOneWidget);
      expect(find.text('Keep my account'), findsNothing);
      authentication.failure = const DeletionFailure(
        DeletionFailureCode.credentials,
      );
      await fill(tester);
      await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
      await tester.tap(find.byKey(const Key('deletion-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Check your password and try again.'), findsOneWidget);
      expect(find.byKey(const Key('deletion-password')), findsOneWidget);
      expect(find.text('PRIVATE_MARKER'), findsNothing);
      expect(
        (await handoffs.read(alice, environment))!.requestId,
        CommandId('saved-original'),
      );
    },
  );
  testWidgets(
    'startup completion signs out only its captured owner and reports local clearing',
    (tester) async {
      final completed = DeletionHandoff(
        owner: alice,
        environment: environment,
        requestId: CommandId('completed-original'),
        phase: DeletionHandoffPhase.accepted,
      );
      final report = DeletionRecoveryReport(completed: [completed]);
      final root = ProviderContainer(
        overrides: rootOverrides(report: report, viewer: alice),
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(authentication.signedOut, [alice]);
      expect(find.textContaining('on this device is cleared'), findsOneWidget);
      expect(find.text('PRIVATE_MARKER'), findsNothing);
      root.updateOverrides(rootOverrides(report: report, viewer: bob));
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE_MARKER'), findsOneWidget);
      expect(find.text('Deletion requested'), findsNothing);
    },
  );
  testWidgets(
    'startup sign-out failure offers sign-out retry without falsely reporting uncleared files',
    (tester) async {
      authentication.signOutFailure = StateError('synthetic-sensitive-token');
      final completed = DeletionHandoff(
        owner: alice,
        environment: environment,
        requestId: CommandId('completed-original'),
        phase: DeletionHandoffPhase.accepted,
      );
      final root = ProviderContainer(
        overrides: rootOverrides(
          report: DeletionRecoveryReport(completed: [completed]),
          viewer: alice,
        ),
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Retry sign-out'), findsOneWidget);
      expect(find.textContaining('still needs clearing'), findsNothing);
      expect(find.textContaining('on this device is cleared'), findsOneWidget);
      expect(find.text('PRIVATE_MARKER'), findsNothing);
    },
  );

  testWidgets(
    'live uncertain handoff opens verification in one action and cancellation returns to request status',
    (tester) async {
      repository.failure = const DeletionFailure(
        DeletionFailureCode.unavailable,
      );
      await controller.submit(
        confirmation,
        DeletionAuthentication(
          ReauthenticationProvider.password,
          password: 'synthetic',
        ),
      );
      final root = ProviderContainer(
        overrides: rootOverrides(
          report: DeletionRecoveryReport(),
          viewer: alice,
        ),
      );
      addTearDown(root.dispose);
      root.read(deletionActiveScopeProvider.notifier).select(controller.scope);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Verify sign-in again'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('deletion-password')), findsOneWidget);
      await tester.ensureVisible(find.text('Back to request status'));
      await tester.tap(find.text('Back to request status'));
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm deletion'), findsOneWidget);
      expect(find.text('PRIVATE_MARKER'), findsNothing);
      expect(repository.ids, [CommandId('delete-widget')]);
    },
  );
  testWidgets(
    'an empty discovery does not require an identity or Firebase client to show its child',
    (tester) async {
      final root = ProviderContainer(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(projectId: 'demo-tally'),
          ),
          deletionRecoveryProvider.overrideWithBuild(
            (_, _) => DeletionRecoveryReport(),
          ),
        ],
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE_MARKER'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  for (final width in [400.0, 800.0, 1440.0]) {
    for (final dark in [false, true]) {
      testWidgets(
        'confirmation reachable at $width, dark=$dark, 200% with keyboard',
        (tester) async {
          await mount(
            tester,
            width: width,
            dark: dark,
            scale: 2,
            keyboard: 240,
          );
          expect(find.text('Delete your account'), findsOneWidget);
          expect(find.textContaining('cannot be undone'), findsOneWidget);
          await fill(tester);
          await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
          expect(
            tester
                .widget<FilledButton>(find.byKey(const Key('deletion-submit')))
                .onPressed,
            isNotNull,
          );
          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          expect(tester.takeException(), isNull);
          await tester.ensureVisible(find.byKey(const Key('deletion-cancel')));
          await tester.tap(find.byKey(const Key('deletion-cancel')));
          await tester.pumpAndSettle();
          expect(cancelled, 1);
          expect(repository.ids, isEmpty);
          expect(cleanup.owners, isEmpty);
        },
      );
    }
  }
  testWidgets(
    'unchecked or incorrectly typed confirmation prevents submission',
    (tester) async {
      await mount(tester);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('deletion-submit')))
            .onPressed,
        isNull,
      );
      await tester.enterText(
        find.byKey(const Key('deletion-confirmation')),
        'delete',
      );
      await tester.enterText(
        find.byKey(const Key('deletion-password')),
        'synthetic',
      );
      await tester.ensureVisible(
        find.byKey(const Key('deletion-acknowledgement')),
      );
      await tester.tap(find.byKey(const Key('deletion-acknowledgement')));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('deletion-submit')))
            .onPressed,
        isNull,
      );
      expect(repository.ids, isEmpty);
    },
  );
  testWidgets('linked email and Google options use friendly provider labels', (
    tester,
  ) async {
    await mount(tester);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Google'), findsOneWidget);
    await tester.ensureVisible(find.text('Google'));
    await tester.tap(find.text('Google'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deletion-password')), findsNothing);
  });
  testWidgets(
    'submitting clears password and disables duplicate actions during verification',
    (tester) async {
      authentication.held = Completer<void>();
      await mount(tester);
      await fill(tester);
      await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
      await tester.tap(find.byKey(const Key('deletion-submit')));
      await tester.pump();
      await tester.pump();
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('deletion-submit')))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<TextField>(find.byKey(const Key('deletion-password')))
            .controller!
            .text,
        isEmpty,
      );
      authentication.held!.complete();
      await tester.pumpAndSettle();
      expect(repository.ids, [CommandId('delete-widget')]);
    },
  );
  testWidgets(
    'offline request tells the truth and offers original-request retry',
    (tester) async {
      repository.failure = const DeletionFailure(
        DeletionFailureCode.unavailable,
      );
      await mount(tester);
      await fill(tester);
      await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
      await tester.tap(find.byKey(const Key('deletion-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm deletion'), findsOneWidget);
      expect(find.text('Retry original request'), findsOneWidget);
      expect(cleanup.owners, isEmpty);
      expect(find.textContaining('Everything deleted'), findsNothing);
    },
  );
  testWidgets(
    'accepted cleanup failure reports remaining device cleanup rather than cloud completion',
    (tester) async {
      cleanup.fail = true;
      await mount(tester);
      await fill(tester);
      await tester.ensureVisible(find.byKey(const Key('deletion-submit')));
      await tester.tap(find.byKey(const Key('deletion-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Deletion requested'), findsOneWidget);
      expect(find.text('Retry device cleanup'), findsOneWidget);
      expect(find.textContaining('still needs clearing'), findsOneWidget);
      expect(find.textContaining('revokeSessions'), findsNothing);
    },
  );
  testWidgets(
    'initial root discovery hides private content until ownership is known',
    (tester) async {
      final held = Completer<DeletionRecoveryReport>();
      final root = ProviderContainer(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(
              projectId: 'demo-tally',
              endpoints: EmulatorEndpoints(host: '127.0.0.1'),
            ),
          ),
          deletionRecoveryProvider.overrideWithBuild((_, _) => held.future),
          deletionViewerOwnerProvider.overrideWithValue(alice),
        ],
      );
      addTearDown(root.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('PRIVATE_MARKER'), findsNothing);
      expect(find.text('Checking saved account changes'), findsOneWidget);
      held.complete(DeletionRecoveryReport());
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE_MARKER'), findsOneWidget);
    },
  );
  testWidgets(
    'captured acceptance blocks Alice private content but never replaces Bob workspace',
    (tester) async {
      cleanup.fail = true;
      await controller.submit(
        confirmation,
        DeletionAuthentication(
          ReauthenticationProvider.password,
          password: 'synthetic',
        ),
      );
      final root = ProviderContainer(
        overrides: [
          environmentProvider.overrideWithValue(
            const EnvironmentConfig.emulator(
              projectId: 'demo-tally',
              endpoints: EmulatorEndpoints(host: '127.0.0.1'),
            ),
          ),
          syncEnvironmentProvider.overrideWithValue(environment),
          deletionRecoveryProvider.overrideWithBuild(
            (_, _) => DeletionRecoveryReport(),
          ),
          deletionViewerOwnerProvider.overrideWithValue(alice),
          accountDeletionControllerFactoryProvider.overrideWithValue(
            (_) => controller,
          ),
        ],
      );
      addTearDown(root.dispose);
      root.read(deletionActiveScopeProvider.notifier).select(controller.scope);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: root,
          child: const MaterialApp(
            home: DeletionHandoffHost(child: Text('PRIVATE_MARKER')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE_MARKER'), findsNothing);
      expect(find.text('Deletion requested'), findsOneWidget);
      root.updateOverrides([
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(
            projectId: 'demo-tally',
            endpoints: EmulatorEndpoints(host: '127.0.0.1'),
          ),
        ),
        syncEnvironmentProvider.overrideWithValue(environment),
        deletionRecoveryProvider.overrideWithBuild(
          (_, _) => DeletionRecoveryReport(),
        ),
        deletionViewerOwnerProvider.overrideWithValue(bob),
        accountDeletionControllerFactoryProvider.overrideWithValue(
          (_) => controller,
        ),
      ]);
      await tester.pumpAndSettle();
      expect(find.text('PRIVATE_MARKER'), findsOneWidget);
      expect(find.text('Deletion requested'), findsNothing);
      expect(authentication.signedOut, isEmpty);
    },
  );
}
