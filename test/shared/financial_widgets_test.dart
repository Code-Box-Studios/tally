import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/money/currency_code.dart';
import 'package:tally/core/money/money.dart';
import 'package:tally/core/theme/tally_theme.dart';
import 'package:tally/shared/widgets/empty_state.dart';
import 'package:tally/shared/widgets/money_text.dart';
import 'package:tally/shared/widgets/status_badge.dart';

void main() {
  for (final dark in [false, true]) {
    testWidgets('Financial states readable at 320px / 200%, dark=$dark', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      var actions = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: dark ? TallyTheme.dark() : TallyTheme.light(),
          home: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    MoneyText(money: Money.parse('10000', CurrencyCode.php)),
                    MoneyText(money: Money.parse('500', CurrencyCode.usd)),
                    const StatusBadge(
                      label: 'Overdue',
                      icon: Icons.warning_amber,
                      tone: StatusTone.danger,
                    ),
                    EmptyState(
                      icon: Icons.wallet_outlined,
                      title: 'Nothing owed yet',
                      description: 'Add an obligation to remember.',
                      actionLabel: 'Add obligation',
                      onAction: () => actions++,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      expect(find.text('₱10,000'), findsOneWidget);
      expect(find.text(r'$500'), findsOneWidget);
      expect(find.bySemanticsLabel('₱10,000 PHP'), findsOneWidget);
      expect(find.bySemanticsLabel(r'$500 USD'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);
      expect(find.byIcon(Icons.warning_amber), findsOneWidget);
      await tester.ensureVisible(find.text('Add obligation'));
      await tester.tap(find.text('Add obligation'));
      expect(actions, 1);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }
}
