import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/widgets/catalog_picker.dart';

void main() {
  testWidgets('cached empty choices reconcile with the live server page', (
    tester,
  ) async {
    final pages = StreamController<DataPage<String>>();
    addTearDown(pages.close);
    String? selected;
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () async {
                  selected = await pickCatalog<String>(
                    context,
                    title: 'Choose person',
                    stream: pages.stream,
                    more: (_) async => throw StateError('No more pages'),
                    label: (value) => value,
                    active: (_) => true,
                  );
                },
                child: const Text('Choose'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Choose'));
    await tester.pump();
    pages.add(
      DataPage(items: [], nextCursor: null, hasMore: false, isFromCache: true),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Cached choices · reconnect to confirm availability.'),
      findsOneWidget,
    );
    pages.add(
      DataPage(
        items: ['John'],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('John'), findsOneWidget);
    await tester.tap(find.text('John'));
    await tester.pumpAndSettle();
    expect(selected, 'John');
  });
}
