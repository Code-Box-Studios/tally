import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/environment.dart';
import '../core/config/environment_providers.dart';
import '../core/errors/app_failure.dart';
import '../core/firebase/firebase_initializer.dart';
import '../core/firebase/firebase_clients.dart';
import '../core/firebase/firebase_providers.dart';
import '../shared/widgets/error_panel.dart';
import 'tally_app.dart';

Future<void> prepareBackend({
  required EnvironmentConfig configuration,
  required FirebaseInitializer initializer,
  Uri? browserOrigin,
}) async {
  configuration.validate();
  if (configuration.mode == AppEnvironment.emulator) {
    // firebase_auth_web restores its saved emulator binding only on localhost.
    // Reject other web origins before SDK initialization can contact live Auth.
    if (browserOrigin != null && browserOrigin.host != 'localhost') {
      throw AppFailure(
        AppFailureCode.invalidEnvironment,
        messageKey: 'startup.emulatorOrigin',
      );
    }
    await initializer.initialize(configuration);
  }
}

Future<void> bootstrap(
  EnvironmentConfig configuration, {
  FirebaseInitializer? initializer,
  FirebaseClients Function()? clients,
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
        browserOrigin: kIsWeb ? Uri.base : null,
      );
    }
    if (configuration.mode != AppEnvironment.preview && clients == null) {
      throw AppFailure(
        AppFailureCode.invalidEnvironment,
        messageKey: 'startup.missingClients',
      );
    }
    runApp(
      ProviderScope(
        overrides: [
          environmentProvider.overrideWithValue(configuration),
          if (clients != null)
            firebaseClientsProvider.overrideWithValue(clients()),
        ],
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
                  onRetry: () => bootstrap(
                    configuration,
                    initializer: initializer,
                    clients: clients,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
