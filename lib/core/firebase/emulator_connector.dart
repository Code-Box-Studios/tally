import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../config/environment.dart';
import '../errors/app_failure.dart';
import 'firebase_clients.dart';
import 'firebase_initializer.dart';

abstract interface class FirebaseSdkGateway {
  Future<void> initializeDemo(String projectId);
  Future<void> connectAuth(String host, int port);
  void connectFirestore(String host, int port);
  void connectFunctions(String host, int port);
  Future<void> connectStorage(String host, int port);
}

class EmulatorConnector implements FirebaseInitializer {
  EmulatorConnector(this.gateway);
  final FirebaseSdkGateway gateway;
  @override
  Future<void> initialize(EnvironmentConfig configuration) async {
    configuration.validate();
    if (configuration.mode != AppEnvironment.emulator) {
      throw AppFailure(
        AppFailureCode.invalidEnvironment,
        messageKey: 'environment.emulatorRequired',
      );
    }
    final endpoints = configuration.endpoints!;
    await gateway.initializeDemo(configuration.projectId!);
    await gateway.connectAuth(endpoints.host, endpoints.authPort);
    gateway.connectFirestore(endpoints.host, endpoints.firestorePort);
    gateway.connectFunctions(endpoints.host, endpoints.functionsPort);
    await gateway.connectStorage(endpoints.host, endpoints.storagePort);
  }
}

class FlutterFireSdkGateway implements FirebaseSdkGateway {
  FirebaseClients? _clients;
  late FirebaseApp _app;
  late FirebaseAuth _auth;
  late FirebaseFirestore _firestore;
  late FirebaseFunctions _functions;
  late FirebaseStorage _storage;
  FirebaseClients get clients =>
      _clients ??
      (throw StateError('Firebase emulator connection is incomplete.'));
  @override
  Future<void> initializeDemo(String projectId) async {
    _clients = null;
    _app = await Firebase.initializeApp(demoProjectId: projectId);
    _auth = FirebaseAuth.instanceFor(app: _app);
    _firestore = FirebaseFirestore.instanceFor(app: _app);
    _functions = FirebaseFunctions.instanceFor(
      app: _app,
      region: 'asia-southeast1',
    );
    _storage = FirebaseStorage.instanceFor(
      app: _app,
      bucket: 'gs://$projectId.appspot.com',
    );
  }

  @override
  Future<void> connectAuth(String host, int port) =>
      _auth.useAuthEmulator(host, port);
  @override
  void connectFirestore(String host, int port) {
    _firestore.settings = const Settings(persistenceEnabled: false);
    _firestore.useFirestoreEmulator(host, port);
  }

  @override
  void connectFunctions(String host, int port) =>
      _functions.useFunctionsEmulator(host, port);
  @override
  Future<void> connectStorage(String host, int port) async {
    await _storage.useStorageEmulator(host, port);
    _clients = FirebaseClients(
      app: _app,
      auth: _auth,
      firestore: _firestore,
      functions: _functions,
      storage: _storage,
    );
  }
}
