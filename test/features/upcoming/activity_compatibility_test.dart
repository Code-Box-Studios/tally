import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/dates/financial_clock.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/activity/data/activity_dto.dart';
import 'package:tally/features/activity/data/firestore_activity_repository.dart';
import 'package:tally/features/activity/domain/activity_entry.dart';
import 'package:tally/features/activity/presentation/activity_screen.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../../support/upcoming_fixtures.dart';
import '../auth/session_controller_test.dart' show profile;
import '../financial/financial_dto_test.dart' show audit;

Map<String, Object?> repairActivity() => {
  ...audit,
  'type': 'aggregateRepaired',
  'title': 'Installment loan',
  'obligationId': 'loan-1',
  'currency': 'PHP',
  'recordedAt': DateTime.utc(2026, 10, 4),
};

Map<String, Object?> paidCancellationActivity() => {
  ...audit,
  'type': 'obligationCancelled',
  'title': 'Completed loan',
  'obligationId': 'loan-2',
  'currency': 'PHP',
  'amountMinor': 0,
  'direction': 'owedByMe',
  'recordedAt': DateTime.utc(2026, 10, 4),
};

void main() {
  final owner = OwnerUid('alice');
  test('canonical balance repair has no transaction amount', () {
    final event = ActivityDto.fromMap('repair-1', repairActivity(), owner);
    expect(event.type, ActivityType.aggregateRepaired);
    expect(event.amount, isNull);
  });
  test('fully paid cancellation keeps its zero remaining amount', () {
    final event = ActivityDto.fromMap(
      'cancel-1',
      paidCancellationActivity(),
      owner,
    );
    expect(event.amount!.minorUnits, 0);
  });
  test(
    'compatibility does not accept invalid currency or zero payment events',
    () {
      expect(
        () => ActivityDto.fromMap('repair-1', {
          ...repairActivity(),
          'currency': 'XXX',
        }, owner),
        throwsA(anything),
      );
      expect(
        () => ActivityDto.fromMap('payment-1', {
          ...paidCancellationActivity(),
          'type': 'paymentMade',
        }, owner),
        throwsA(anything),
      );
      expect(
        () => ActivityDto.fromMap('cancel-1', {
          ...paidCancellationActivity(),
          'amountMinor': -1,
        }, owner),
        throwsA(anything),
      );
    },
  );
  UpcomingDocuments documents() => UpcomingDocuments(owner)
    ..pages.add(
      RawPage(
        documents: [
          RawDocument('repair-1', repairActivity()),
          RawDocument('cancel-1', paidCancellationActivity()),
        ],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      ),
    );
  test('one page retains both canonical events', () async {
    final page = await FirestoreActivityRepository(
      documents(),
      UpcomingCommands(owner),
    ).watchActivity().first;
    expect(page.items.map((event) => event.type), [
      ActivityType.aggregateRepaired,
      ActivityType.obligationCancelled,
    ]);
  });
  testWidgets('Activity renders balance repair and fully paid cancellation', (
    tester,
  ) async {
    final docs = documents();
    final container = ProviderContainer(
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        ownerUidProvider.overrideWithValue(owner),
        userProfileProvider.overrideWithValue(profile('alice')),
        financialClockProvider.overrideWithValue(DateTime.utc(2026, 10, 4, 4)),
        ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
        ownerCommandsFactoryProvider.overrideWithValue(UpcomingCommands.new),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: Scaffold(body: ActivityScreen())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Balances recalculated'), findsOneWidget);
    expect(find.text('Obligation cancelled'), findsOneWidget);
    expect(find.text('₱0 PHP'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
