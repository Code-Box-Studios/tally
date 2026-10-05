import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/dates/local_date.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/features/recurring/data/firestore_recurring_repository.dart';
import 'package:tally/features/recurring/domain/recurring_commands.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/upcoming_fixtures.dart';

void main() {
  test('creation and lifecycle map exact nullable server results without a fictitious balance', () async {
    final docs = UpcomingDocuments(recurringOwner),
        commands = UpcomingCommands(recurringOwner)
          ..response = {
            'obligationId': 'bill-1',
            'obligationRevision': 1,
            'firstInstanceId': null,
            'generationRevision': 1,
          };
    final repo = FirestoreRecurringRepository(docs, commands),
        created = await repo.create(recurringDraft(), CommandId('create'));
    expect(created.firstInstanceId, isNull);
    expect(commands.calls.single.name, 'createRecurring');
    expect(commands.calls.single.payload, recurringDraft().toPayload());
    commands.response = {
      'obligationId': 'bill-1',
      'obligationRevision': 2,
      'generationRevision': 2,
      'retainedFutureCount': 5,
    };
    final paused = await repo.changeLifecycle(
      LifecycleChange(
        obligationId: created.obligationId,
        expectedRevision: 1,
        action: RecurringLifecycleAction.pause,
        effectiveDate: LocalDate.parse('2026-10-06'),
      ),
      CommandId('pause'),
    );
    expect(paused.retainedFutureCount, 5);
    expect(commands.calls.last.payload, {
      'obligationId': 'bill-1',
      'expectedRevision': 1,
      'action': 'pause',
      'effectiveDate': '2026-10-06',
    });
  });
  test('period pages are bounded and retain occurrence ordering and parent filter across continuation', () async {
    final docs = UpcomingDocuments(recurringOwner)
      ..pages.addAll([
        RawPage(
          documents: [
            RawDocument(
              recurringData('variable')['instanceId'] as String,
              recurringData('variable'),
            ),
          ],
          nextCursor: const FixtureCursor(1),
          hasMore: true,
          isFromCache: true,
        ),
        RawPage(
          documents: [],
          nextCursor: null,
          hasMore: false,
          isFromCache: false,
        ),
      ]);
    final repo = FirestoreRecurringRepository(
          docs,
          UpcomingCommands(recurringOwner),
        ),
        parent = ObligationId(
          recurringData('variable')['obligationId'] as String,
        );
    final first = await repo.watchPeriods(parent).first;
    expect(first.isFromCache, true);
    expect(first.items.single.amount, isNull);
    await repo.getPeriods(parent, after: first.nextCursor);
    expect(docs.queries.last.after, const FixtureCursor(1));
    for (final q in docs.queries) {
      expect(q.limit, 50);
      expect(q.equals, {'obligationId': parent.value});
      expect(q.order.single.field, 'occurrenceDate');
      expect(q.order.single.descending, false);
    }
    await expectLater(
      repo.getPeriods(ObligationId('other-bill'), after: first.nextCursor),
      throwsA(isA<AppFailure>()),
    );
    await expectLater(
      repo.getAttempts(InstanceId('other-period'), after: first.nextCursor),
      throwsA(isA<AppFailure>()),
    );
    final other = OwnerUid('other-owner');
    await expectLater(
      FirestoreRecurringRepository(
        UpcomingDocuments(other),
        UpcomingCommands(other),
      ).getPeriods(parent, after: first.nextCursor),
      throwsA(isA<AppFailure>()),
    );
    expect(
      () => FirestoreRecurringRepository(
        docs,
        UpcomingCommands(OwnerUid('other')),
      ),
      throwsArgumentError,
    );
  });

  test(
    'future terms and one-period edits use exact trusted callable fields',
    () async {
      final commands = UpcomingCommands(recurringOwner),
          repo = FirestoreRecurringRepository(
            UpcomingDocuments(recurringOwner),
            commands,
          ),
          parent = ObligationId('bill-1'),
          period = InstanceId('period-1');
      commands.response = {
        'obligationId': parent.value,
        'obligationRevision': 2,
        'generationRevision': 2,
        'appliesAfter': '2026-12-04',
      };
      final edit = RecurringEdit(
        obligationId: parent,
        expectedRevision: 1,
        draft: recurringDraft(),
      );
      final result = await repo.edit(edit, CommandId('edit'));
      expect(result.appliesAfter.toString(), '2026-12-04');
      expect(commands.calls.last.name, 'editRecurring');
      expect(commands.calls.last.payload, edit.toPayload());
      commands.response = {
        'obligationId': parent.value,
        'instanceId': period.value,
        'instanceRevision': 2,
      };
      final amount = InstanceAmountEdit(
        obligationId: parent,
        instanceId: period,
        expectedRevision: 1,
        amount: Money.fromMinorUnits(350000, CurrencyCode.php),
        reason: 'Billing statement',
      );
      expect(
        (await repo.setAmount(amount, CommandId('amount'))).instanceRevision,
        2,
      );
      expect(commands.calls.last.name, 'setRecurringAmount');
      expect(commands.calls.last.payload, {
        'obligationId': 'bill-1',
        'instanceId': 'period-1',
        'expectedRevision': 1,
        'amountMinor': 350000,
        'reason': 'Billing statement',
      });
      final moved = RecurringInstanceEdit(
        obligationId: parent,
        instanceId: period,
        expectedRevision: 2,
        dueDate: LocalDate.parse('2026-10-06'),
        paymentSourceId: null,
        notes: 'Only this month',
        reason: 'New due date',
      );
      await repo.editPeriod(moved, CommandId('move'));
      expect(commands.calls.last.name, 'editRecurringInstance');
      expect(commands.calls.last.payload, moved.toPayload());
      final skipped = InstanceSkip(
        obligationId: parent,
        instanceId: period,
        expectedRevision: 3,
        reason: 'No charge this month',
      );
      await repo.skip(skipped, CommandId('skip'));
      expect(commands.calls.last.name, 'skipRecurringInstance');
      expect(commands.calls.last.payload, skipped.toPayload());
    },
  );
  test('confirmation and failure command payloads preserve revision, native amount and history identities', () async {
    final commands = UpcomingCommands(recurringOwner)
      ..response = {
        'obligationId': 'bill-1',
        'instanceId': 'period-1',
        'paymentId': 'payment-1',
        'evidenceId': null,
        'instanceRevision': 3,
        'obligationRevision': 2,
      };
    final repo = FirestoreRecurringRepository(
      UpcomingDocuments(recurringOwner),
      commands,
    );
    final confirmed = await repo.confirm(
      DeductionConfirmation(
        obligationId: ObligationId('bill-1'),
        instanceId: InstanceId('period-1'),
        expectedRevision: 2,
        terms: deductionTerms(),
      ),
      CommandId('confirm'),
    );
    expect(confirmed.paymentId, PaymentId('payment-1'));
    expect(confirmed.evidenceId, isNull);
    expect(commands.calls.last.payload['amountMinor'], 54900);
    commands.response = {
      'obligationId': 'bill-1',
      'instanceId': 'period-1',
      'reversalId': null,
      'attemptId': 'attempt-1',
      'instanceRevision': 4,
      'obligationRevision': 2,
    };
    final failed = await repo.reportFailure(
      DeductionFailure(
        obligationId: ObligationId('bill-1'),
        instanceId: InstanceId('period-1'),
        expectedRevision: 3,
        reason: 'Not deducted',
      ),
      CommandId('fail'),
    );
    expect(failed.reversalId, isNull);
    expect(commands.calls.last.payload['reason'], 'Not deducted');
  });
}
