import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../config/environment.dart';
import '../errors/app_failure.dart';
import 'firebase_clients.dart';
import 'firebase_initializer.dart';

abstract interface class ProductionSdkGateway {
  Future<void> initializeFirebase(FirebaseRuntimeOptions options);
  Future<void> activateAppCheck(String siteKey);
  void publishClients(String region);
}

final class ProductionInitializer implements FirebaseInitializer {
  ProductionInitializer(this.gateway);
  final ProductionSdkGateway gateway;
  @override
  Future<void> initialize(EnvironmentConfig configuration) async {
    configuration.validate();
    if ([
      AppEnvironment.preview,
      AppEnvironment.emulator,
    ].contains(configuration.mode)) {
      throw AppFailure(
        AppFailureCode.invalidEnvironment,
        messageKey: 'environment.liveRequired',
      );
    }
    await gateway.initializeFirebase(configuration.options!);
    await gateway.activateAppCheck(configuration.appCheckSiteKey!);
    gateway.publishClients(configuration.region!);
  }
}

final class FlutterFireProductionGateway implements ProductionSdkGateway {
  late FirebaseApp _app;
  FirebaseClients? _clients;
  FirebaseClients get clients =>
      _clients ?? (throw StateError('Firebase initialization is incomplete.'));
  @override
  Future<void> initializeFirebase(FirebaseRuntimeOptions options) async {
    _clients = null;
    _app = await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: options.apiKey,
        appId: options.appId,
        messagingSenderId: options.messagingSenderId,
        projectId: options.projectId,
        authDomain: options.authDomain,
        storageBucket: options.storageBucket,
      ),
    );
  }

  @override
  Future<void> activateAppCheck(String siteKey) =>
      FirebaseAppCheck.instanceFor(app: _app).activate(
        providerWeb: ReCaptchaEnterpriseProvider(siteKey),
        providerAndroid: const AndroidPlayIntegrityProvider(),
        providerApple: const AppleAppAttestWithDeviceCheckFallbackProvider(),
      );
  @override
  void publishClients(String region) {
    final firestore = FirebaseFirestore.instanceFor(app: _app);
    // Persistent financial caches are enabled only with the owner-bound offline
    // outbox/cache lifecycle. Until then, signed-out accounts retain no disk cache.
    firestore.settings = const Settings(persistenceEnabled: false);
    _clients = FirebaseClients(
      app: _app,
      auth: FirebaseAuth.instanceFor(app: _app),
      firestore: firestore,
      functions: FirebaseFunctions.instanceFor(app: _app, region: region),
      storage: FirebaseStorage.instanceFor(app: _app),
    );
  }
}
