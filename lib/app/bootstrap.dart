import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/environment.dart';
import '../core/config/environment_providers.dart';
import '../core/errors/app_failure.dart';
import '../core/firebase/firebase_initializer.dart';
import '../shared/widgets/error_panel.dart';
import 'tally_app.dart';

Future<void> prepareBackend({
  required EnvironmentConfig configuration,
  required FirebaseInitializer initializer,
}) async {
  configuration.validate();
  if (configuration.mode == AppEnvironment.emulator) {
    await initializer.initialize(configuration);
  }
}

Future<void> bootstrap(
  EnvironmentConfig configuration, {
  FirebaseInitializer? initializer,
}) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    configuration.validate();
    if (configuration.mode == AppEnvironment.emulator) {
      if (initializer == null) {
        throw AppFailure(
          AppFailureCode.invalidEnvironment,
          messageKey: 'startup.missingInitializer',
        );
      }
      await prepareBackend(
        configuration: configuration,
        initializer: initializer,
      );
    }
    runApp(
      ProviderScope(
        overrides: [environmentProvider.overrideWithValue(configuration)],
        child: const TallyApp(),
      ),
    );
  } catch (_) {
    // Recovery never exposes SDK payloads or falls back to another environment.
    runApp(
      MaterialApp(
        title: 'Tally',
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          body: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: ErrorPanel(
                  title: 'Tally couldn’t start',
                  onRetry: () =>
                      bootstrap(configuration, initializer: initializer),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
