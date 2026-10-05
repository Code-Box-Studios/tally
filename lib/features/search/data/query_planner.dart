import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/financial_filter.dart';
import '../domain/period_query.dart';

abstract final class QueryPlanner {
  static Map<String, Object?> _primary(FinancialFilter filter) => {
    if (filter.contactId != null)
      'contactId': filter.contactId!.value
    else if (filter.categoryId != null)
      'categoryId': filter.categoryId!.value
    else if (filter.sourceId != null)
      'paymentSourceId': filter.sourceId!.value
    else if (filter.currency != null)
      'currency': filter.currency!.code
    else if (filter.section != null)
      'section': filter.section!.name
    else if (filter.paymentMode != null)
      'paymentMode': filter.paymentMode!.name,
  };
  static DocumentQuery obligations(
    FinancialFilter filter, {
    PageCursor? after,
  }) => DocumentQuery(
    'obligations',
    after: after,
    equals: {'archived': false, ..._primary(filter)},
    order: const [DocumentOrder('createdAt', descending: true)],
  );
  static DocumentQuery periods(PeriodQuery query, {PageCursor? after}) =>
      DocumentQuery(
        'obligationInstances',
        after: after,
        equals: _primary(query.filter),
        ranges: [
          if (query.filter.firstDate != null)
            DocumentRange(
              'dueDate',
              RangeComparison.greaterThanOrEqual,
              query.filter.firstDate.toString(),
            ),
          if (query.filter.lastDate != null)
            DocumentRange(
              'dueDate',
              RangeComparison.lessThanOrEqual,
              query.filter.lastDate.toString(),
            ),
        ],
        order: const [DocumentOrder('dueDate')],
      );
}
