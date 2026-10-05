import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import 'financial_filter.dart';
import 'period_query.dart';
import 'query_page.dart';

abstract interface class SearchRepository {
  OwnerUid get owner;
  Stream<QueryPage<Obligation>> watchObligations(
    FinancialFilter filter,
    DateTime now,
  );
  Future<QueryPage<Obligation>> getObligations(
    FinancialFilter filter,
    DateTime now, {
    PageCursor? after,
  });
  Stream<QueryPage<ObligationInstance>> watchPeriods(PeriodQuery query);
  Future<QueryPage<ObligationInstance>> getPeriods(
    PeriodQuery query, {
    PageCursor? after,
  });
}
