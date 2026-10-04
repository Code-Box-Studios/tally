import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/shared/domain/data_page.dart';
import 'package:tally/shared/widgets/paged_records.dart';

class Cursor implements PageCursor {}

void main() {
  testWidgets(
    'live first page stays fresh and clears older snapshots after updates',
    (tester) async {
      final cursor = Cursor();
      var first = DataPage<(String, int)>(
        items: [('a', 10)],
        nextCursor: cursor,
        hasMore: true,
        isFromCache: false,
      );
      var extra = DataPage<(String, int)>(
        items: [('a', 1), ('b', 20)],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      );
      Future<DataPage<(String, int)>> Function() next = () async => extra;
      late StateSetter update;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                update = setState;
                return PagedRecords<(String, int)>(
                  first: AsyncData(first),
                  loadMore: (_) => next(),
                  identity: (value) => value.$1,
                  empty: const Text('Empty'),
                  onRetry: () {},
                  builder: (_, values, complete) => Column(
                    children: [
                      for (final value in values)
                        Text('${value.$1}: ${value.$2}'),
                      Text('Complete: $complete'),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      );
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(find.text('a: 10'), findsOneWidget);
      expect(find.text('a: 1'), findsNothing);
      expect(find.text('b: 20'), findsOneWidget);
      update(() {
        first = DataPage(
          items: [('a', 11)],
          nextCursor: cursor,
          hasMore: true,
          isFromCache: false,
        );
      });
      await tester.pumpAndSettle();
      expect(find.text('a: 11'), findsOneWidget);
      expect(find.text('b: 20'), findsNothing);
      expect(find.text('Complete: false'), findsOneWidget);
      final pending = Completer<DataPage<(String, int)>>();
      extra = DataPage(
        items: [('b', 21)],
        nextCursor: null,
        hasMore: false,
        isFromCache: false,
      );
      next = () => pending.future;
      await tester.tap(find.text('Load more'));
      await tester.pump();
      // A cursor load from an older stream generation must not cross the refresh.
      update(() {
        first = DataPage(
          items: [('a', 12)],
          nextCursor: cursor,
          hasMore: true,
          isFromCache: false,
        );
      });
      await tester.pump();
      expect(find.text('a: 12'), findsOneWidget);
      pending.complete(extra);
      await tester.pumpAndSettle();
      expect(find.text('b: 21'), findsNothing);
    },
  );
}
