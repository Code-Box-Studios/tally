import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/dates/financial_clock.dart';

void main() {
  testWidgets('financial time refreshes at rollover and when the app resumes', (
    tester,
  ) async {
    var now = DateTime.utc(2026, 10, 4, 15, 59);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [financialNowProvider.overrideWithValue(() => now)],
        child: MaterialApp(
          home: Consumer(
            builder: (_, ref, _) =>
                Text(ref.watch(financialClockProvider).toIso8601String()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text(now.toIso8601String()), findsOneWidget);
    now = DateTime.utc(2026, 10, 4, 16);
    await tester.pump(const Duration(minutes: 1));
    await tester.pump();
    expect(find.text(now.toIso8601String()), findsOneWidget);
    now = DateTime.utc(2026, 10, 5, 16);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();
    expect(find.text(now.toIso8601String()), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
