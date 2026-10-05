import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/domain/data_page.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../domain/query_cancellation.dart';
import '../domain/query_page.dart';

class QueryResults<T> extends StatefulWidget {
  const QueryResults({
    super.key,
    required this.queryKey,
    required this.first,
    required this.loadMore,
    required this.identity,
    required this.builder,
    required this.empty,
    required this.onRetry,
  });
  final Object queryKey;
  final AsyncValue<QueryPage<T>> first;
  final Future<QueryPage<T>> Function(PageCursor, QueryCancellation) loadMore;
  final String Function(T) identity;
  final Widget Function(BuildContext, List<T>, bool complete) builder;
  final Widget empty;
  final VoidCallback onRetry;
  @override
  State<QueryResults<T>> createState() => _QueryResultsState<T>();
}

class _QueryResultsState<T> extends State<QueryResults<T>> {
  final _extra = <T>[];
  QueryPage<T>? _last;
  QueryCancellation? _operation;
  int _extraScanned = 0;
  bool _extraCached = false;
  Object? _error;
  void _reset() {
    _operation?.cancel();
    _operation = null;
    _extra.clear();
    _last = null;
    _extraScanned = 0;
    _extraCached = false;
    _error = null;
  }

  @override
  void didUpdateWidget(covariant QueryResults<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.queryKey != widget.queryKey ||
        !identical(oldWidget.first.asData?.value, widget.first.asData?.value)) {
      _reset();
    }
  }

  @override
  void dispose() {
    _operation?.cancel();
    super.dispose();
  }

  Future<void> _more(PageCursor cursor) async {
    if (_operation != null) return;
    final token = QueryCancellation();
    setState(() {
      _operation = token;
      _error = null;
    });
    try {
      final next = await widget.loadMore(cursor, token);
      if (!mounted || token.isCancelled || _operation != token) return;
      setState(() {
        _extra.addAll(next.records.items);
        _last = next;
        _extraScanned += next.scannedCandidates;
        _extraCached |= next.records.isFromCache;
      });
    } catch (error) {
      if (mounted &&
          !token.isCancelled &&
          _operation == token &&
          error is! QueryCancelled) {
        setState(() => _error = error);
      }
    } finally {
      if (mounted && _operation == token) setState(() => _operation = null);
    }
  }

  @override
  Widget build(BuildContext context) => widget.first.when(
    loading: () => const Padding(
      padding: EdgeInsets.all(24),
      child: Center(child: CircularProgressIndicator()),
    ),
    error: (error, _) => Column(
      children: [
        FinancialActionError(error: error),
        TextButton(onPressed: widget.onRetry, child: const Text('Try again')),
      ],
    ),
    data: (first) {
      final byId = <String, T>{};
      for (final value in first.records.items) {
        byId[widget.identity(value)] = value;
      }
      for (final value in _extra) {
        byId.putIfAbsent(widget.identity(value), () => value);
      }
      final values = byId.values.toList(), last = _last ?? first;
      final cached = first.records.isFromCache || _extraCached;
      final complete = !cached && !last.records.hasMore;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${values.length} matches · ${first.scannedCandidates + _extraScanned} records checked${complete ? ' · Search complete' : ''}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (cached)
                  const Text(
                    'Cached view · reconnect to confirm all current records.',
                  ),
                if (last.budgetReached)
                  const Text(
                    'More records remain. Load more to continue this search.',
                  ),
              ],
            ),
          ),
          if (values.isEmpty)
            if (complete)
              widget.empty
            else
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('No matches in the records checked so far.'),
              )
          else
            widget.builder(context, values, complete),
          FinancialActionError(error: _error),
          if (_extraScanned > 0 || _extra.isNotEmpty)
            TextButton.icon(
              onPressed: _operation == null ? widget.onRetry : null,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh loaded records'),
            ),
          if (last.records.hasMore && last.records.nextCursor != null)
            TextButton.icon(
              onPressed: _operation == null
                  ? () => _more(last.records.nextCursor!)
                  : null,
              icon: _operation == null
                  ? const Icon(Icons.expand_more)
                  : const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
              label: const Text('Load more'),
            ),
        ],
      );
    },
  );
}
