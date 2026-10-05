import 'dart:async';
import 'dart:convert';

import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/data/financial_failure_mapper.dart';
import '../../../shared/data/owner_document_gateway.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/query_cancellation.dart';
import '../domain/query_page.dart';

final class _FilteredCursor<T> implements PageCursor {
  _FilteredCursor(
    this.owner,
    this.key,
    this.signature,
    this.raw,
    this.more,
    this.cached,
    Iterable<T> buffer,
  ) : buffer = List.unmodifiable(buffer);
  final OwnerUid owner;
  final Object key;
  final String signature;
  final PageCursor? raw;
  final bool more, cached;
  final List<T> buffer;
}

final class FilteredPager<T> {
  FilteredPager({
    required this.documents,
    required this.criteriaKey,
    required this.query,
    required this.map,
    required this.matches,
    this.empty = false,
  }) {
    final request = query(null);
    if (request.limit != 50) {
      throw ArgumentError('Search candidates require50-record pages.');
    }
    _signature = jsonEncode([
      request.collection,
      request.equals,
      request.order.map((o) => [o.field, o.descending]).toList(),
      request.ranges.map((r) => [r.field, r.comparison.name, r.value]).toList(),
    ]);
  }
  final OwnerDocumentGateway documents;
  final Object criteriaKey;
  final DocumentQuery Function(PageCursor? after) query;
  final T Function(RawDocument) map;
  final bool Function(T) matches;
  final bool empty;
  late final String _signature;
  bool _disposed = false;
  final _closers = <void Function()>{};

  void dispose() {
    _disposed = true;
    for (final close in _closers.toList()) {
      close();
    }
    _closers.clear();
  }

  void _check([bool Function()? active, QueryCancellation? cancellation]) {
    cancellation?.check();
    if (_disposed) {
      throw const FinancialFailure(
        FinancialFailureCode.signIn,
        'Your sign-in changed. Start a new search.',
      );
    }
    if (active != null && !active()) throw const QueryCancelled();
  }

  QueryPage<T> _empty() => QueryPage(
    records: DataPage(
      items: [],
      nextCursor: null,
      hasMore: false,
      isFromCache: false,
    ),
    scannedCandidates: 0,
    budgetReached: false,
  );

  _FilteredCursor<T>? _cursor(PageCursor? after) {
    if (after == null) return null;
    if (after is! _FilteredCursor<T> ||
        after.owner != documents.owner ||
        after.key != criteriaKey ||
        after.signature != _signature) {
      throw const FinancialFailure(
        FinancialFailureCode.invalid,
        'Start a new search after changing its filters or account.',
      );
    }
    return after;
  }

  Future<QueryPage<T>> _fill({
    RawPage? first,
    _FilteredCursor<T>? cursor,
    bool Function()? active,
    QueryCancellation? cancellation,
  }) async {
    _check(active, cancellation);
    var rawCursor = cursor?.raw,
        more = cursor?.more ?? true,
        cached = cursor?.cached ?? false;
    var scanned = 0, fetches = 0;
    final found = <T>[...?cursor?.buffer];
    RawPage? ready = first;
    while (found.length < 50 && more && fetches < 5) {
      _check(active, cancellation);
      final raw = ready ?? await documents.getPage(query(rawCursor));
      ready = null;
      _check(active, cancellation);
      if (raw.documents.length > 50 || raw.hasMore && raw.nextCursor == null) {
        throw const FinancialFailure(
          FinancialFailureCode.recovery,
          'This search page needs recovery.',
        );
      }
      fetches++;
      scanned += raw.documents.length;
      found.addAll(raw.documents.map(map).where(matches));
      rawCursor = raw.nextCursor;
      more = raw.hasMore;
      cached = raw.isFromCache;
      if (cached) break;
    }
    _check(active, cancellation);
    final buffer = found.skip(50).toList(), hasMore = more || buffer.isNotEmpty;
    return QueryPage(
      records: DataPage(
        items: found.take(50),
        nextCursor: hasMore
            ? _FilteredCursor(
                documents.owner,
                criteriaKey,
                _signature,
                rawCursor,
                more,
                cached,
                buffer,
              )
            : null,
        hasMore: hasMore,
        isFromCache: cached,
      ),
      scannedCandidates: scanned,
      budgetReached: !cached && fetches == 5 && more && found.length < 50,
    );
  }

  Future<QueryPage<T>> get({
    PageCursor? after,
    QueryCancellation? cancellation,
  }) async {
    try {
      _check(null, cancellation);
      final cursor = _cursor(after);
      if (empty) return _empty();
      return await _fill(cursor: cursor, cancellation: cancellation);
    } on QueryCancelled {
      rethrow;
    } catch (error) {
      throw financialFailure(error);
    }
  }

  Stream<QueryPage<T>> watchFirst() {
    if (empty) return Stream.value(_empty());
    late final StreamController<QueryPage<T>> controller;
    StreamSubscription<RawPage>? source;
    var active = true, running = false, sourceDone = false, generation = 0;
    RawPage? latest;
    void close() {
      active = false;
      generation++;
      latest = null;
      unawaited(controller.close());
    }

    Future<void> drain() async {
      if (running) return;
      running = true;
      while (active && latest != null) {
        final raw = latest!, current = generation;
        latest = null;
        try {
          final page = await _fill(
            first: raw,
            active: () => active && current == generation,
          );
          if (active && current == generation) controller.add(page);
        } catch (error, stack) {
          if (active && current == generation) {
            controller.addError(financialFailure(error), stack);
          }
        }
      }
      running = false;
      if (active && sourceDone && latest == null) unawaited(controller.close());
    }

    controller = StreamController<QueryPage<T>>(
      onListen: () {
        try {
          _check();
          _closers.add(close);
          source = documents
              .watchPage(query(null))
              .listen(
                (raw) {
                  latest = raw;
                  generation++;
                  unawaited(drain());
                },
                onError: (Object error, StackTrace stack) {
                  generation++;
                  latest = null;
                  if (active) {
                    controller.addError(financialFailure(error), stack);
                  }
                },
                onDone: () {
                  sourceDone = true;
                  if (!running) unawaited(controller.close());
                },
              );
        } catch (error, stack) {
          controller.addError(financialFailure(error), stack);
          unawaited(controller.close());
        }
      },
      onCancel: () async {
        active = false;
        generation++;
        latest = null;
        _closers.remove(close);
        // The old owner has no listener; active stream errors are delivered above.
        try {
          await source?.cancel();
        } catch (_) {}
      },
    );
    return controller.stream;
  }
}
