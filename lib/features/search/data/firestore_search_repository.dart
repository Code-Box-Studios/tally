import 'dart:async';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../../obligations/data/instance_dto.dart';
import '../../obligations/data/obligation_dto.dart';
import '../../obligations/domain/obligation.dart';
import '../../obligations/domain/obligation_instance.dart';
import '../domain/financial_filter.dart';
import '../domain/period_query.dart';
import '../domain/query_cancellation.dart';
import '../domain/query_page.dart';
import '../domain/search_repository.dart';
import 'filtered_pager.dart';
import 'query_planner.dart';

final class FirestoreSearchRepository implements SearchRepository {
  FirestoreSearchRepository(this.documents);
  final OwnerDocumentGateway documents;
  @override
  OwnerUid get owner => documents.owner;
  bool _disposed = false;
  final _active = <void Function()>{};
  void dispose() {
    _disposed = true;
    for (final stop in _active.toList()) {
      stop();
    }
    _active.clear();
  }

  void _check() {
    if (_disposed) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed. Start a new search.',
      );
    }
  }

  FilteredPager<Obligation> _obligations(FinancialFilter filter, DateTime now) {
    _check();
    return FilteredPager(
      documents: documents,
      criteriaKey: PeriodQuery(now: now, filter: filter),
      query: (after) => QueryPlanner.obligations(filter, after: after),
      map: (doc) => ObligationDto.fromMap(doc.id, doc.data, owner),
      matches: (value) => filter.matchesObligation(value, now),
    );
  }

  FilteredPager<ObligationInstance> _instances(PeriodQuery query) {
    _check();
    return FilteredPager(
      documents: documents,
      criteriaKey: query,
      empty: query.empty,
      query: (after) => QueryPlanner.periods(query, after: after),
      map: (doc) => InstanceDto.fromMap(doc.id, doc.data, owner),
      matches: query.matches,
    );
  }

  Future<QueryPage<T>> _get<T>(
    FilteredPager<T> pager,
    PageCursor? after,
    QueryCancellation? cancellation,
  ) async {
    final stop = pager.dispose;
    _active.add(stop);
    try {
      return await pager.get(after: after, cancellation: cancellation);
    } finally {
      _active.remove(stop);
      pager.dispose();
    }
  }

  Stream<QueryPage<T>> _watch<T>(FilteredPager<T> Function() create) =>
      Stream.multi((listener) {
        try {
          final pager = create(), stop = pager.dispose;
          _active.add(stop);
          final subscription = pager.watchFirst().listen(
            listener.add,
            onError: listener.addError,
            onDone: listener.close,
          );
          listener.onCancel = () async {
            _active.remove(stop);
            pager.dispose();
            await subscription.cancel();
          };
        } catch (error, stack) {
          listener.addError(error, stack);
          listener.close();
        }
      });
  @override
  Stream<QueryPage<Obligation>> watchObligations(
    FinancialFilter filter,
    DateTime now,
  ) => _watch(() => _obligations(filter, now));
  @override
  Future<QueryPage<Obligation>> getObligations(
    FinancialFilter filter,
    DateTime now, {
    PageCursor? after,
    QueryCancellation? cancellation,
  }) async => _get(_obligations(filter, now), after, cancellation);
  @override
  Stream<QueryPage<ObligationInstance>> watchPeriods(PeriodQuery query) =>
      _watch(() => _instances(query));
  @override
  Future<QueryPage<ObligationInstance>> getPeriods(
    PeriodQuery query, {
    PageCursor? after,
    QueryCancellation? cancellation,
  }) async => _get(_instances(query), after, cancellation);
}
