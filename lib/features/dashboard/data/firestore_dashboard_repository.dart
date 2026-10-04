import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../../../shared/data/document_reader.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/dashboard_repository.dart';
import '../domain/dashboard_summary.dart';
import 'summary_dto.dart';

final class FirestoreDashboardRepository extends FinancialRepositoryBase
    implements ProjectedDashboardRepository {
  FirestoreDashboardRepository(super.documents, super.commands);
  Stream<DataRecord<T?>> _watch<T>(
    String collection,
    String id,
    T Function(RawDocument) convert,
  ) async* {
    try {
      await for (final record in documents.watchDocument(collection, id)) {
        yield DataRecord(
          record.document == null ? null : convert(record.document!),
          isFromCache: record.isFromCache,
        );
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Stream<DataRecord<ProjectedDashboardSummary?>> watchSummary(
    CurrencyCode currency,
  ) => _watch(
    'summaries',
    'dashboard-${currency.code}',
    (doc) => SummaryDto.dashboard(doc.id, doc.data, owner),
  );
  @override
  Stream<DataRecord<LedgerState?>> watchLedger() => _watch(
    'ledgerState',
    'current',
    (doc) => SummaryDto.ledger(doc.id, doc.data, owner),
  );
  @override
  Stream<DataRecord<ProjectedContactSummary?>> watchContact(ContactId id) =>
      _watch(
        'summaries',
        contactSummaryId(id),
        (doc) => SummaryDto.contact(doc.id, doc.data, owner, id),
      );
  @override
  Future<void> refresh(CommandId commandId) async {
    final result = DocumentReader(
      await commands.call('refreshDashboard', commandId, const {}),
    );
    if (!result.boolean('accepted')) throw DocumentReader.invalid();
  }
}
