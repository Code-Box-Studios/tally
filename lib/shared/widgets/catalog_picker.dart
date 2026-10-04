import 'dart:async';

import 'package:flutter/material.dart';

import '../domain/data_page.dart';
import '../presentation/financial_form_support.dart';

Future<T?> pickCatalog<T>(
  BuildContext context, {
  required String title,
  required Stream<DataPage<T>> stream,
  required Future<DataPage<T>> Function(PageCursor) more,
  required String Function(T) label,
  required bool Function(T) active,
}) => showFinancialDialog<T>(
  context,
  _CatalogPicker(
    title: title,
    stream: stream,
    more: more,
    label: label,
    active: active,
  ),
  guardSubmission: false,
);

class _CatalogPicker<T> extends StatefulWidget {
  const _CatalogPicker({
    required this.title,
    required this.stream,
    required this.more,
    required this.label,
    required this.active,
  });
  final String title;
  final Stream<DataPage<T>> stream;
  final Future<DataPage<T>> Function(PageCursor) more;
  final String Function(T) label;
  final bool Function(T) active;
  @override
  State<_CatalogPicker<T>> createState() => _CatalogPickerState<T>();
}

class _CatalogPickerState<T> extends State<_CatalogPicker<T>> {
  final _items = <T>[];
  DataPage<T>? _page;
  Object? _error;
  bool _busy = true;
  StreamSubscription<DataPage<T>>? _subscription;
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    _first();
  }

  Future<void> _first() async {
    await _subscription?.cancel();
    if (!mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    _subscription = widget.stream.listen(
      (page) {
        if (!mounted) return;
        _generation++;
        setState(() {
          _items
            ..clear()
            ..addAll(page.items);
          _page = page;
          _busy = false;
          _error = null;
        });
      },
      onError: (Object error) {
        if (mounted) {
          setState(() {
            _error = error;
            _busy = false;
          });
        }
      },
    );
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  Future<void> _append(DataPage<T> page) async {
    if (mounted) {
      setState(() {
        _items.addAll(page.items);
        _page = page;
        _busy = false;
      });
    }
  }

  Future<void> _more() async {
    final generation = _generation;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final page = await widget.more(_page!.nextCursor!);
      if (generation == _generation) await _append(page);
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => FinancialDialogBody(
    guardSubmission: false,
    title: widget.title,
    children: [
      if (_page?.isFromCache == true)
        const Text('Cached choices · reconnect to confirm availability.'),
      for (final value in _items)
        if (widget.active(value))
          ListTile(
            title: Text(widget.label(value)),
            onTap: () => Navigator.pop(context, value),
          ),
      if (!_busy &&
          _items.where(widget.active).isEmpty &&
          _page?.hasMore != true)
        const Text('No active choices yet.'),
      FinancialActionError(error: _error),
      if (_busy)
        const Center(child: CircularProgressIndicator())
      else if (_page?.hasMore == true)
        TextButton(onPressed: _more, child: const Text('Load more choices')),
      if (_error != null)
        TextButton(
          onPressed: _page == null ? _first : _more,
          child: const Text('Retry'),
        ),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
    ],
  );
}
