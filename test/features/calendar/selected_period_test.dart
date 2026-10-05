import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/features/obligations/presentation/obligation_detail_screen.dart';
import 'package:tally/shared/data/owner_document_gateway.dart';

import '../../support/recurring_fixtures.dart';
import '../../support/search_ui.dart';
import '../financial/financial_forms_test.dart' show UiDocuments;

class SelectedDocuments extends UiDocuments {
  SelectedDocuments() : super(uid: recurringOwner.value);
  final reads = <String>[];
  @override
  RawPage page(DocumentQuery query) {
    final page = super.page(query);
    return RawPage(
      documents: page.documents
          .where(
            (doc) =>
                query.collection != 'obligationInstances' ||
                doc.id != 'selected',
          )
          .toList(),
      nextCursor: null,
      hasMore: false,
      isFromCache: false,
    );
  }

  @override
  Stream<RawRecord> watchDocument(String collection, String id) {
    reads.add('$collection/$id');
    return super.watchDocument(collection, id);
  }
}

void main() {
  for (final unrelated in [false, true]) {
    testWidgets(
      'calendar selected period unrelated=$unrelated uses a direct owned record and exact history',
      (tester) async {
        final docs = SelectedDocuments(),
            parent = recurringData('parent'),
            period = recurringData('deducted'),
            payment = recurringData('payment');
        addTearDown(docs.changes.close);
        docs.data['obligations']![parent['obligationId'] as String] = parent;
        period['instanceId'] = 'selected';
        if (unrelated) period['obligationId'] = 'another-bill';
        docs.data['obligationInstances']!['selected'] = period;
        payment['obligationInstanceId'] = 'selected';
        payment['allocations'] = [
          {'instanceId': 'selected', 'amountMinor': payment['amountMinor']},
        ];
        docs.data['payments']![payment['paymentId'] as String] = payment;
        await searchHost(
          tester,
          docs,
          ObligationDetailScreen(
            id: ObligationId(parent['obligationId'] as String),
            initialPeriod: InstanceId('selected'),
          ),
        );
        expect(docs.reads, contains('obligationInstances/selected'));
        if (unrelated) {
          expect(
            find.text('This billing period isn’t available'),
            findsOneWidget,
          );
          expect(find.text('Payment history'), findsNothing);
        } else {
          expect(find.text('Selected billing period'), findsOneWidget);
          expect(find.text('Payment history'), findsOneWidget);
          expect(find.text('₱549 PHP'), findsWidgets);
        }
        expect(tester.takeException(), isNull);
      },
    );
  }
}
