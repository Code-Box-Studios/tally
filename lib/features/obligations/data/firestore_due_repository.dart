import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/financial_repository_base.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/due_query.dart';
import '../domain/due_repository.dart';
import '../domain/obligation_instance.dart';
import 'instance_dto.dart';

final class FirestoreDueRepository extends FinancialRepositoryBase
    implements DueRepository {
  FirestoreDueRepository(super.documents, super.commands);

  DocumentQuery _query(DueQuery query, PageCursor? after) {
    final envelope = query.envelope;
    return DocumentQuery(
      'obligationInstances',
      after: after,
      equals: {
        'closed': false,
        if (query.section != null) 'section': query.section!.name,
      },
      ranges: [
        if (envelope.first != null)
          DocumentRange(
            'dueDate',
            RangeComparison.greaterThanOrEqual,
            envelope.first.toString(),
          ),
        DocumentRange(
          'dueDate',
          RangeComparison.lessThanOrEqual,
          envelope.last.toString(),
        ),
      ],
      order: const [DocumentOrder('dueDate')],
    );
  }

  DataPage<ObligationInstance> _map(RawPage page, DueQuery query) => DataPage(
    items: page.documents
        .map((doc) => InstanceDto.fromMap(doc.id, doc.data, owner))
        .where(query.matches)
        .toList(),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    isFromCache: page.isFromCache,
  );

  Future<DataPage<ObligationInstance>> _advance(
    RawPage raw,
    DueQuery query,
  ) async {
    var page = _map(raw, query);
    while (page.items.isEmpty && page.hasMore && !page.isFromCache) {
      final cursor = page.nextCursor;
      if (cursor == null) throw StateError('Missing continuation cursor.');
      page = _map(await documents.getPage(_query(query, cursor)), query);
    }
    return page;
  }

  @override
  Stream<DataPage<ObligationInstance>> watchDue(DueQuery query) async* {
    try {
      await for (final raw in documents.watchPage(_query(query, null))) {
        yield await _advance(raw, query);
      }
    } catch (error) {
      throw financialFailure(error);
    }
  }

  @override
  Future<DataPage<ObligationInstance>> getDue(
    DueQuery query, {
    PageCursor? after,
  }) async {
    try {
      return await _advance(
        await documents.getPage(_query(query, after)),
        query,
      );
    } catch (error) {
      throw financialFailure(error);
    }
  }
}
