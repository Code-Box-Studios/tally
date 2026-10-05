import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../domain/financial_filter.dart';

class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;
  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  late final _controller = TextEditingController(text: widget.value);
  Timer? _timer;
  @override
  void didUpdateWidget(covariant SearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value &&
        widget.value != FinancialFilter.normalizeText(_controller.text)) {
      _timer?.cancel();
      _controller.text = widget.value;
    }
  }

  void _submit(String text) {
    _timer?.cancel();
    widget.onChanged(FinancialFilter.normalizeText(text));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: const Key('financial-search'),
    controller: _controller,
    maxLength: 240,
    inputFormatters: [
      TextInputFormatter.withFunction(
        (oldValue, newValue) =>
            FinancialFilter.normalizeText(newValue.text).runes.length <= 240
            ? newValue
            : oldValue,
      ),
    ],
    textInputAction: TextInputAction.search,
    onSubmitted: _submit,
    onChanged: (text) {
      setState(() {});
      _timer?.cancel();
      _timer = Timer(const Duration(milliseconds: 300), () => _submit(text));
    },
    decoration: InputDecoration(
      labelText: 'Search obligations',
      hintText: 'Name, person, category or notes',
      counterText: '',
      prefixIcon: const Icon(Icons.search),
      suffixIcon: _controller.text.isEmpty
          ? null
          : IconButton(
              tooltip: 'Clear search',
              icon: const Icon(Icons.close),
              onPressed: () {
                _controller.clear();
                _submit('');
                setState(() {});
              },
            ),
    ),
  );
}
