import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/shared/presentation/catalog_manager.dart';

import 'financial_forms_test.dart' show UiDocuments, UiCommands, host, enter;

class CatalogCommands extends UiCommands {
  CatalogCommands(super.documents);
  @override
  Future<Map<String, Object?>> call(
    String name,
    CommandId id,
    Map<String, Object?> payload,
  ) async {
    requests.add(name);
    final kind = payload['kind'];
    final collection = kind == 'source' ? 'paymentSources' : 'categories';
    final values = Map<String, Object?>.from(payload['values'] as Map);
    documents.data[collection]!['new-catalog'] = {
      ...values,
      'userId': owner.value,
      'schemaVersion': 1,
      'revision': 1,
      'isDefault': false,
      'createdAt': DateTime.utc(2026, 1, 1),
      'updatedAt': DateTime.utc(2026, 1, 1),
    };
    documents.changes.add(null);
    return {'id': 'new-catalog', 'revision': 1};
  }
}

void main() {
  testWidgets(
    'a source and custom category save through repositories and appear in settings',
    (tester) async {
      final docs = UiDocuments();
      final commands = CatalogCommands(docs);
      addTearDown(docs.changes.close);
      await host(
        tester,
        docs,
        commands,
        const SingleChildScrollView(
          child: Column(
            children: [
              CatalogManager(kind: CatalogEditorKind.source),
              CatalogManager(kind: CatalogEditorKind.category),
            ],
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('add-source')));
      await tester.pumpAndSettle();
      await enter(tester, 'catalog-name', 'Pocket cash');
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Pocket cash'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('add-category')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('add-category')));
      await tester.pumpAndSettle();
      await enter(tester, 'catalog-name', 'Community dues');
      await tester.ensureVisible(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Community dues'), findsOneWidget);
      expect(commands.requests, ['saveCatalog', 'saveCatalog']);
      expect(tester.takeException(), isNull);
    },
  );
}
