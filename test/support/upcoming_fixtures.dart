import 'dart:async';

import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';
import 'package:tally/shared/data/owner_command_gateway.dart';
import 'package:tally/shared/domain/data_page.dart';

import '../features/financial/financial_dto_test.dart' show audit;

Map<String, Object?> monthData({int paid = 950000}) => {
  'scheduledMinor': 875000,
  'remainingMinor': 225000,
  'paidMinor': paid,
  'assumedPaidMinor': 100000,
  'confirmedPaidMinor': paid - 100000,
  'unknownAmountCount': 1,
};
Map<String, Object?> attentionData() => {
  'amountMinor': 200000,
  'count': 2,
  'unknownAmountCount': 1,
};
Map<String, Object?> summaryData({String currency = 'PHP'}) => {
  ...audit,
  'kind': 'dashboard',
  'currency': currency,
  'sourceRevision': 4,
  'profileRevision': 1,
  'formulaVersion': 1,
  'yearMonth': '2026-10',
  'timezone': 'Asia/Manila',
  'financialDay': '2026-10-04',
  'computedAt': DateTime.utc(2026, 10, 4, 4),
  'validUntil': DateTime.utc(2026, 10, 4, 16),
  'youOweMinor': 2500000,
  'owedToYouMinor': 1250000,
  'netPositionMinor': -1250000,
  'recurringOutstandingMinor': 100000,
  'unknownAmountCount': 2,
  'month': {'outgoing': monthData(), 'incoming': monthData(paid: 200000)},
  'attention': {
    for (final key in ['dueToday', 'dueSoon', 'overdue'])
      key: {'outgoing': attentionData(), 'incoming': attentionData()},
  },
};
Map<String, Object?> instanceData(
  String id, {
  String due = '2026-10-04',
  String timezone = 'Asia/Manila',
  String currency = 'PHP',
}) => {
  ...audit,
  'instanceId': id,
  'obligationId': 'loan-1',
  'currency': currency,
  'amountMinor': 10000,
  'amountState': 'known',
  'totalPaidMinor': 0,
  'remainingMinor': 10000,
  'dueDate': due,
  'occurrenceDate': due,
  'timezone': timezone,
  'direction': 'owedByMe',
  'section': 'iOwe',
  'financialStatus': 'pending',
  'paymentMode': 'manual',
  'paymentSourceId': null,
  'contactId': null,
  'categoryId': 'default-personal-loan',
  'periodLabel': 'Installment 1',
  'closed': false,
  'revision': 1,
  'snapshot': {'title': 'Personal loan'},
};

final class FixtureCursor implements PageCursor {
  const FixtureCursor(this.page);
  final int page;
}

final class UpcomingDocuments implements OwnerDocumentGateway {
  UpcomingDocuments(this.owner);
  @override
  final OwnerUid owner;
  final records = <String, RawRecord>{};
  final pages = <RawPage>[];
  final queries = <DocumentQuery>[];
  bool failPages = false;
  @override
  Stream<RawRecord> watchDocument(String collection, String id) => Stream.value(
    records['$collection/$id'] ?? const RawRecord(null, isFromCache: false),
  );
  RawPage page(DocumentQuery query) {
    queries.add(query);
    if (failPages) throw StateError('Disconnected');
    final index = (query.after as FixtureCursor?)?.page ?? 0;
    return pages[index];
  }

  @override
  Stream<RawPage> watchPage(DocumentQuery query) => Stream.value(page(query));
  @override
  Future<RawPage> getPage(DocumentQuery query) async => page(query);
}

final class UpcomingCommands implements OwnerCommandGateway {
  UpcomingCommands(this.owner);
  @override
  final OwnerUid owner;
  final calls = <({String name, CommandId id, Map<String, Object?> payload})>[];
  Map<String, Object?> response = {};
  bool failNext = false;
  Completer<Map<String, Object?>>? pending;
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId commandId,
    Map<String, Object?> payload,
  ) async {
    calls.add((name: name, id: commandId, payload: payload));
    if (failNext) {
      failNext = false;
      throw StateError('Response unavailable');
    }
    return pending == null ? response : await pending!.future;
  }
}
