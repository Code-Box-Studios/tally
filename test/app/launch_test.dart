import 'package:flutter_test/flutter_test.dart';
import 'package:tally/app/tally_app.dart';

void main() {
  testWidgets('launch displays the Tally brand and purpose', (tester) async {
    await tester.pumpWidget(const TallyApp());
    expect(find.text('Tally'), findsOneWidget);
    expect(find.text('Know what’s due.'), findsOneWidget);
  });
}
