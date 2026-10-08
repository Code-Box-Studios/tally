import 'package:tally/features/sync/presentation/sync_providers.dart';

import '../../support/online_commands.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/dashboard/presentation/dashboard_screen.dart';
import 'package:tally/features/dashboard/presentation/private_dashboard_screen.dart';
import 'package:tally/features/dashboard/presentation/projected_dashboard_providers.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show audit;

Future<ProviderContainer> pumpHome(
  WidgetTester tester, {
  Size size = const Size(1440, 1000),
  int revision = 4,
  bool missing = false,
  double scale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final owner = OwnerUid('alice');
  final docs = UpcomingDocuments(owner)
    ..records['ledgerState/current'] = RawRecord(
      RawDocument('current', {
        ...audit,
        'revision': revision,
        'formulaVersion': 1,
      }),
      isFromCache: false,
    )
    ..pages.add(
      RawPage(
        documents: [],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      ),
    );
  if (!missing) {
    for (final currency in ['PHP', 'USD']) {
      docs.records['summaries/dashboard-$currency'] = RawRecord(
        RawDocument('dashboard-$currency', summaryData(currency: currency)),
        isFromCache: false,
      );
    }
  }
  final container = ProviderContainer(
    overrides: [
      environmentProvider.overrideWithValue(
        const EnvironmentConfig.emulator(projectId: 'demo-tally'),
      ),
      ownerUidProvider.overrideWithValue(owner),
      userProfileProvider.overrideWithValue(profile('alice')),
      ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
      syncRuntimeFactoryProvider.overrideWithValue(onlineOnlyTestRuntime),
      ownerCommandsFactoryProvider.overrideWithValue(
        (_) => UpcomingCommands(owner)..response = {'accepted': true},
      ),
      financialClockProvider.overrideWithValue(DateTime.utc(2026, 10, 4, 4)),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: MediaQuery(
            data: MediaQueryData(
              size: size,
              textScaler: TextScaler.linear(scale),
            ),
            child: const DashboardScreen(),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets(
    '375px Home keeps borrowing and lending side by side with the month beneath',
    (tester) async {
      await pumpHome(tester, size: const Size(375, 1100));
      final owe = tester.getTopLeft(find.byKey(const Key('home-you-owe')));
      final owed = tester.getTopLeft(find.byKey(const Key('home-owed-to-you')));
      final month = tester.getTopLeft(
        find.byKey(const Key('home-remaining-month')),
      );
      expect(owed.dy, owe.dy);
      expect(month.dy, greaterThan(owe.dy));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'private Home restores three cards and original panels using live currency projections only',
    (tester) async {
      final container = await pumpHome(tester);
      expect(find.byType(PrivateDashboardScreen), findsOneWidget);
      expect(find.byKey(const Key('home-you-owe')), findsOneWidget);
      expect(find.byKey(const Key('home-owed-to-you')), findsOneWidget);
      expect(find.byKey(const Key('home-remaining-month')), findsOneWidget);
      expect(find.text('₱25,000'), findsOneWidget);
      expect(find.text('₱12,500'), findsOneWidget);
      expect(find.text('Paid this month'), findsOneWidget);
      expect(find.text('₱9,500'), findsOneWidget);
      expect(find.text('₱2,250'), findsWidgets);
      expect(find.text('Plus 1 bill needing an amount'), findsWidgets);
      expect(find.text('Sample data'), findsNothing);
      expect(find.textContaining('Spotify'), findsNothing);
      expect(find.byKey(const Key('home-columns')), findsOneWidget);
      container.read(privateCurrencyProvider.notifier).select(CurrencyCode.usd);
      await tester.pumpAndSettle();
      expect(find.text('₱25,000'), findsNothing);
      expect(find.text(r'$25,000'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  for (final missing in [false, true]) {
    testWidgets(
      'missing=$missing projections are marked updating without invented zero balances',
      (tester) async {
        await pumpHome(tester, revision: 5, missing: missing);
        expect(find.text('₱0'), findsNothing);
        expect(find.textContaining('Updating'), findsWidgets);
        expect(find.text('Refresh overview'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
  for (final size in [const Size(320, 640), const Size(640, 320)]) {
    testWidgets(
      'original Home stacks without overflow at $size and 200 percent text',
      (tester) async {
        await pumpHome(tester, size: size, scale: 2);
        expect(find.byKey(const Key('home-columns')), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
