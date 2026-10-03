import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/tally_theme.dart';
import '../core/theme/theme_controller.dart';
import 'app_router.dart';

class TallyApp extends StatelessWidget {
  const TallyApp({super.key});
  @override
  Widget build(BuildContext context) => Consumer(
    builder: (context, ref, _) => MaterialApp.router(
      title: 'Tally — Know what’s due.',
      debugShowCheckedModeBanner: false,
      theme: TallyTheme.light(),
      darkTheme: TallyTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(appRouterProvider),
    ),
  );
}
