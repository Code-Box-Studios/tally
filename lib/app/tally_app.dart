import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/tally_theme.dart';
import '../core/theme/theme_controller.dart';
import 'app_router.dart';
import '../core/config/environment.dart';
import '../core/config/environment_providers.dart';
import '../features/auth/domain/user_profile.dart';
import '../features/auth/presentation/auth_providers.dart';
import '../features/dashboard/presentation/dashboard_providers.dart';
import '../core/money/currency_code.dart';
import '../features/accounts/presentation/deletion_recovery_startup.dart';
import '../features/accounts/presentation/deletion_handoff_host.dart';

class TallyApp extends StatelessWidget {
  const TallyApp({super.key});
  @override
  Widget build(BuildContext context) => Consumer(
    builder: (context, ref, _) {
      if (ref.watch(environmentProvider).mode != AppEnvironment.preview) {
        ref.listen(sessionStateProvider, (previous, next) {
          final before = previous?.value?.profile;
          final profile = next.value?.profile;
          if (profile?.theme != before?.theme || profile?.uid != before?.uid) {
            ref.read(themeModeProvider.notifier).setMode(
              switch (profile?.theme) {
                ProfileTheme.light => ThemeMode.light,
                ProfileTheme.dark => ThemeMode.dark,
                _ => ThemeMode.system,
              },
            );
          }
          if (profile?.uid != before?.uid ||
              profile?.defaultCurrency != before?.defaultCurrency) {
            ref
                .read(selectedCurrencyProvider.notifier)
                .setCurrency(profile?.defaultCurrency ?? CurrencyCode.php);
          }
        });
      }
      return DeletionRecoveryStartup(
        child: MaterialApp.router(
          title: 'Tally — Know what’s due.',
          debugShowCheckedModeBanner: false,
          theme: TallyTheme.light(),
          darkTheme: TallyTheme.dark(),
          themeMode: ref.watch(themeModeProvider),
          routerConfig: ref.watch(appRouterProvider),
          builder: (_, child) =>
              DeletionHandoffHost(child: child ?? const SizedBox()),
        ),
      );
    },
  );
}
