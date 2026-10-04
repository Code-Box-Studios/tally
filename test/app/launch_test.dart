import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tally/app/tally_app.dart';

void main() {
  testWidgets('launch displays the Tally brand and purpose', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: TallyApp()));
    await tester.pumpAndSettle();
    expect(find.text('tally.', findRichText: true), findsOneWidget);
    expect(find.textContaining('Know what’s due.'), findsOneWidget);
  });
}
