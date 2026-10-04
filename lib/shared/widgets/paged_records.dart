import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/data_page.dart';
import '../presentation/financial_form_support.dart';

class PagedRecords<T> extends StatefulWidget {
  const PagedRecords({
    super.key,
    required this.first,
    required this.loadMore,
    required this.identity,
    required this.builder,
    required this.empty,
    required this.onRetry,
  });
  final AsyncValue<DataPage<T>> first;
  final Future<DataPage<T>> Function(PageCursor cursor) loadMore;
  final String Function(T value) identity;
  final Widget Function(BuildContext context, List<T> values, bool complete)
  builder;
  final Widget empty;
  final VoidCallback onRetry;
  @override
  State<PagedRecords<T>> createState() => _PagedRecordsState<T>();
}

class _PagedRecordsState<T> extends State<PagedRecords<T>> {
  final _extra = <T>[];
  DataPage<T>? _last;
  bool _busy = false;
  Object? _error;
  int _generation = 0;
  @override
  void didUpdateWidget(covariant PagedRecords<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.first.asData?.value, widget.first.asData?.value)) {
      _generation++;
      _extra.clear();
      _last = null;
      _error = null;
    }
  }

  Future<void> _more(PageCursor cursor) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final generation = _generation;
    try {
      final page = await widget.loadMore(cursor);
      if (!mounted) return;
      if (generation == _generation) {
        setState(() {
          _extra.addAll(page.items);
          _last = page;
        });
      }
    } catch (error) {
      if (mounted && generation == _generation) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
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
      for (final value in first.items) {
        byId[widget.identity(value)] = value;
      }
      for (final value in _extra) {
        byId.putIfAbsent(widget.identity(value), () => value);
      }
      final values = byId.values.toList();
      final last = _last ?? first;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (first.isFromCache)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'Cached view · reconnect to confirm current records.',
              ),
            ),
          if (values.isEmpty)
            widget.empty
          else
            widget.builder(
              context,
              values,
              !last.hasMore && !first.isFromCache,
            ),
          FinancialActionError(error: _error),
          if (_extra.isNotEmpty)
            TextButton.icon(
              onPressed: _busy ? null : widget.onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh loaded records'),
            ),
          if (last.hasMore && last.nextCursor != null)
            TextButton.icon(
              onPressed: _busy ? null : () => _more(last.nextCursor!),
              icon: _busy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.expand_more),
              label: const Text('Load more'),
            ),
        ],
      );
    },
  );
}
