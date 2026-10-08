import 'package:tally/features/sync/presentation/sync_providers.dart';

import '../../support/online_commands.dart';

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/core/config/environment_providers.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/features/auth/presentation/auth_providers.dart';
import 'package:tally/features/obligations/domain/obligation.dart';
import 'package:tally/features/obligations/presentation/obligation_editor.dart';
import 'package:tally/features/obligations/presentation/obligation_detail_screen.dart';
import 'package:tally/features/payments/presentation/payment_editor.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/domain/financial_failure.dart';
import 'package:tally/shared/presentation/financial_providers.dart';

import '../auth/session_controller_test.dart' show profile;
import 'financial_dto_test.dart' show obligationData, paymentData;

class UiDocuments implements OwnerDocumentGateway {
  UiDocuments({String uid = 'alice'}) : owner = OwnerUid(uid) {
    for (final collection in data.values) {
      for (final document in collection.values) {
        document['userId'] = uid;
      }
    }
  }
  @override
  final OwnerUid owner;
  final changes = StreamController<void>.broadcast(sync: true);
  Object? documentFailure;
  bool isFromCache = false;
  final data = <String, Map<String, Map<String, Object?>>>{
    'categories': {
      'default-personal-loan': {
        'userId': 'alice',
        'schemaVersion': 1,
        'name': 'Personal Loan',
        'active': true,
        'isDefault': true,
        'revision': 1,
        'createdAt': DateTime.utc(2026, 1, 1),
        'updatedAt': DateTime.utc(2026, 1, 1),
      },
    },
    'contacts': {},
    'paymentSources': {},
    'obligations': {},
    'obligationInstances': {},
    'payments': {},
  };
  RawPage page(DocumentQuery query) => RawPage(
    documents: [
      for (final item in (data[query.collection] ?? {}).entries)
        if (query.equals.entries.every(
          (filter) => item.value[filter.key] == filter.value,
        ))
          RawDocument(item.key, item.value),
    ],
    nextCursor: null,
    hasMore: false,
    isFromCache: false,
  );
  @override
  Stream<RawPage> watchPage(DocumentQuery query) async* {
    yield page(query);
    await for (final _ in changes.stream) {
      yield page(query);
    }
  }

  @override
  Future<RawPage> getPage(DocumentQuery query) async => page(query);
  @override
  Stream<RawRecord> watchDocument(String collection, String id) async* {
    if (documentFailure != null) throw documentFailure!;
    RawDocument? read() => data[collection]?[id] == null
        ? null
        : RawDocument(id, data[collection]![id]!);
    yield RawRecord(read(), isFromCache: isFromCache);
    await for (final _ in changes.stream) {
      yield RawRecord(read(), isFromCache: isFromCache);
    }
  }
}

class UiCommands implements OwnerCommandGateway {
  UiCommands(this.documents);
  final UiDocuments documents;
  @override
  OwnerUid get owner => documents.owner;
  final requests = <String>[];
  Completer<void>? delay;
  bool rejectCorrection = false;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  ) async {
    requests.add(name);
    if (delay != null) await delay!.future;
    if (name == 'createObligation') {
      final original = payload['amountMinor'] as int;
      documents.data['obligations']!['loan-1'] = {
        ...obligationData(),
        'title': payload['title'],
        'direction': payload['direction'],
        'section': payload['direction'] == 'owedByMe' ? 'iOwe' : 'owedToMe',
        'originalAmountMinor': original,
        'totalPaidMinor': 0,
        'remainingMinor': original,
        'financialStatus': 'pending',
        'hasPaymentHistory': false,
        'originationDate': payload['originationDate'],
        'dueDate': payload['dueDate'],
      };
    } else if (name == 'recordPayment') {
      final parent = documents.data['obligations']!['loan-1']!;
      final amount = payload['amountMinor'] as int;
      final paid = (parent['totalPaidMinor'] as int) + amount;
      documents.data['obligations']!['loan-1'] = {
        ...parent,
        'totalPaidMinor': paid,
        'remainingMinor': (parent['originalAmountMinor'] as int) - paid,
        'hasPaymentHistory': true,
        'financialStatus': paid == parent['originalAmountMinor']
            ? 'paid'
            : 'partiallyPaid',
      };
      documents.data['payments']!['pay-1'] = {
        ...paymentData(),
        'amountMinor': amount,
        'allocations': [
          {'instanceId': 'instance-1', 'amountMinor': amount},
        ],
        'direction': parent['direction'],
        'paymentDate': payload['paymentDate'],
      };
    } else if (name == 'correctPayment' && rejectCorrection) {
      throw const FinancialFailure(
        FinancialFailureCode.conflict,
        'This record changed. Refresh it before saving again.',
      );
    }
    documents.changes.add(null);
    return {
      'obligationId': 'loan-1',
      'obligationInstanceId': 'instance-1',
      'paymentId': 'pay-1',
      'obligationRevision': 1,
      'instanceRevision': 1,
    };
  }
}

Future<void> host(
  WidgetTester tester,
  UiDocuments docs,
  UiCommands commands,
  Widget child,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        environmentProvider.overrideWithValue(
          const EnvironmentConfig.emulator(projectId: 'demo-tally'),
        ),
        ownerUidProvider.overrideWithValue(docs.owner),
        userProfileProvider.overrideWithValue(profile('alice')),
        ownerDocumentsFactoryProvider.overrideWithValue((_) => docs),
        syncRuntimeFactoryProvider.overrideWithValue(onlineOnlyTestRuntime),
        ownerCommandsFactoryProvider.overrideWithValue((_) => commands),
      ],
      child: MaterialApp(
        theme: TallyTheme.light(),
        home: Scaffold(body: child),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> enter(WidgetTester tester, String key, String value) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(Key(key)), value);
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'cached detail balances reconcile when only server metadata changes',
    (tester) async {
      final docs = UiDocuments()..isFromCache = true;
      final commands = UiCommands(docs);
      addTearDown(docs.changes.close);
      docs.data['obligations']!['loan-1'] = obligationData();
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      expect(
        find.text('Cached balances · reconnect to confirm current records.'),
        findsOneWidget,
      );
      docs.isFromCache = false;
      docs.changes.add(null);
      await tester.pumpAndSettle();
      expect(
        find.text('Cached balances · reconnect to confirm current records.'),
        findsNothing,
      );
    },
  );
  testWidgets(
    'a submitting payment cannot be dismissed or open a nested picker',
    (tester) async {
      final docs = UiDocuments();
      final commands = UiCommands(docs);
      addTearDown(docs.changes.close);
      docs.data['obligations']!['loan-1'] = {
        ...obligationData(),
        'totalPaidMinor': 0,
        'remainingMinor': 1000000,
        'hasPaymentHistory': false,
      };
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '3000');
      commands.delay = Completer<void>();
      addTearDown(() {
        if (!commands.delay!.isCompleted) commands.delay!.complete();
      });
      await tester.ensureVisible(find.byKey(const Key('payment-save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('payment-save')));
      await tester.pump();
      await tester.tapAt(const Offset(5, 5));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(PaymentEditor), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(PaymentEditor), findsOneWidget);
      await tester.tap(find.text('No source selected'), warnIfMissed: false);
      await tester.pump();
      expect(find.text('Choose a payment source'), findsNothing);
      commands.delay!.complete();
      await tester.pumpAndSettle();
      expect(find.byType(PaymentEditor), findsNothing);
      expect(commands.requests, ['recordPayment']);
      expect(docs.data['obligations']!['loan-1']!['remainingMinor'], 700000);
    },
  );
  for (final incoming in [false, true]) {
    testWidgets(
      '${incoming ? 'Lent 5000 repaid 2000 leaves 3000' : 'Borrowed 10000 paid 3000 leaves 7000'} through working forms',
      (tester) async {
        final docs = UiDocuments();
        final commands = UiCommands(docs);
        addTearDown(docs.changes.close);
        await host(
          tester,
          docs,
          commands,
          ObligationEditor(
            direction: incoming
                ? ObligationDirection.owedToMe
                : ObligationDirection.owedByMe,
            onSaved: (_) {},
          ),
        );
        await enter(tester, 'obligation-title', 'Personal loan');
        await enter(tester, 'obligation-amount', incoming ? '5000' : '10000');
        await enter(tester, 'obligation-date', '2026-01-01');
        await tap(tester, 'obligation-save');
        expect(commands.requests, ['createObligation']);
        await host(
          tester,
          docs,
          commands,
          ObligationDetailScreen(id: ObligationId('loan-1')),
        );
        await tap(tester, 'record-payment');
        await enter(tester, 'payment-amount', incoming ? '2000' : '3000');
        await enter(tester, 'payment-date', '2026-01-02');
        await tap(tester, 'payment-save');
        expect(find.text(incoming ? '₱3,000 PHP' : '₱7,000 PHP'), findsWidgets);
        expect(find.text('Partially paid'), findsWidgets);
        expect(commands.requests.last, 'recordPayment');
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'invalid amount and impossible dates prevent any save; busy taps make one command',
    (tester) async {
      final docs = UiDocuments();
      final commands = UiCommands(docs);
      addTearDown(docs.changes.close);
      await host(tester, docs, commands, ObligationEditor(onSaved: (_) {}));
      await enter(tester, 'obligation-title', 'Loan');
      await enter(tester, 'obligation-amount', '1.001');
      await enter(tester, 'obligation-date', '2026-02-30');
      await tap(tester, 'obligation-save');
      expect(commands.requests, isEmpty);
      expect(find.text('Enter a valid amount for PHP.'), findsOneWidget);
      expect(find.text('Enter a valid date (YYYY-MM-DD).'), findsOneWidget);
      await enter(tester, 'obligation-amount', '10000');
      await enter(tester, 'obligation-date', '2026-01-01');
      commands.delay = Completer<void>();
      await tester.ensureVisible(find.byKey(const Key('obligation-save')));
      await tester.tap(find.byKey(const Key('obligation-save')));
      await tester.tap(find.byKey(const Key('obligation-save')));
      await tester.pump();
      expect(commands.requests, ['createObligation']);
      commands.delay!.complete();
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'custom overpayment warns; full payment and failed correction preserve visible history',
    (tester) async {
      final docs = UiDocuments();
      final commands = UiCommands(docs);
      addTearDown(docs.changes.close);
      docs.data['obligations']!['loan-1'] = obligationData();
      await host(
        tester,
        docs,
        commands,
        ObligationDetailScreen(id: ObligationId('loan-1')),
      );
      await tap(tester, 'record-payment');
      await enter(tester, 'payment-amount', '7500');
      await tap(tester, 'payment-save');
      expect(commands.requests, isEmpty);
      expect(find.textContaining('exceeds the remaining'), findsWidgets);
      await tap(tester, 'pay-full');
      await enter(tester, 'payment-date', '2026-01-02');
      await tap(tester, 'payment-save');
      expect(find.text('₱0 PHP'), findsWidgets);
      expect(find.text('Paid'), findsWidgets);
      await tap(tester, 'correct-pay-1');
      await tap(tester, 'correction-save');
      expect(
        find.text('Tell us why this payment needs correcting.'),
        findsOneWidget,
      );
      await enter(tester, 'correction-reason', 'Entered by mistake');
      commands.rejectCorrection = true;
      await tap(tester, 'correction-save');
      expect(
        find.text('This record changed. Refresh it before saving again.'),
        findsOneWidget,
      );
      expect(docs.data['payments']!['pay-1']!['amountMinor'], 700000);
    },
  );
  for (final size in [const Size(320, 640), const Size(640, 320)]) {
    testWidgets(
      'editor stays usable at $size, 200% text and an open keyboard',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        tester.view.viewInsets = const FakeViewPadding(bottom: 220);
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.view.reset);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final docs = UiDocuments();
        final commands = UiCommands(docs);
        addTearDown(docs.changes.close);
        await host(tester, docs, commands, ObligationEditor(onSaved: (_) {}));
        await enter(tester, 'obligation-title', 'Small screen loan');
        await enter(tester, 'obligation-amount', '100');
        await tap(tester, 'obligation-save');
        expect(commands.requests, ['createObligation']);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
