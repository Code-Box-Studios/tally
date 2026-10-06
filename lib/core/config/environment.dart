import '../errors/app_failure.dart';

enum AppEnvironment { preview, emulator, development, staging, production }

final class EmulatorEndpoints {
  const EmulatorEndpoints({
    required this.host,
    this.authPort = 9099,
    this.firestorePort = 8080,
    this.functionsPort = 5001,
    this.storagePort = 9199,
  });
  final String host;
  final int authPort;
  final int firestorePort;
  final int functionsPort;
  final int storagePort;

  void validate() {
    final labels = host.split('.');
    final labelPattern = RegExp(r'^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$');
    final validHost =
        host.isNotEmpty &&
        host.length <= 253 &&
        labels.every((label) {
          final match = labelPattern.firstMatch(label);
          return label.length <= 63 &&
              match != null &&
              match.end == label.length;
        });
    final numericIp =
        labels.length == 4 &&
        labels.every((label) => int.tryParse(label) != null);
    if (!validHost ||
        (numericIp && labels.any((label) => int.parse(label) > 255))) {
      throw _invalidEnvironment();
    }
    for (final port in [authPort, firestorePort, functionsPort, storagePort]) {
      if (port < 1 || port > 65535) throw _invalidEnvironment();
    }
  }
}

final class FirebaseRuntimeOptions {
  const FirebaseRuntimeOptions({
    required this.apiKey,
    required this.appId,
    required this.messagingSenderId,
    required this.projectId,
    required this.authDomain,
    required this.storageBucket,
  });
  final String apiKey;
  final String appId;
  final String messagingSenderId;
  final String projectId;
  final String authDomain;
  final String storageBucket;
  void validate(String boundProject) {
    final app = RegExp(r'^1:([0-9]+):(web|android|ios):[a-zA-Z0-9]+$')
        .firstMatch(appId);
    if (projectId != boundProject ||
        !RegExp(r'^AIza[A-Za-z0-9_-]{35}$').hasMatch(apiKey) ||
        app == null ||
        app.group(1) != messagingSenderId ||
        authDomain != '$boundProject.firebaseapp.com' ||
        ![
          '$boundProject.firebasestorage.app',
          '$boundProject.appspot.com',
        ].contains(storageBucket)) {
      throw _invalidEnvironment();
    }
  }
}

final class EnvironmentConfig {
  const EnvironmentConfig.preview()
    : mode = AppEnvironment.preview,
      projectId = null,
      endpoints = null,
      options = null,
      region = null,
      appCheckSiteKey = null,
      webPushKey = null,
      declaredEnvironment = null;
  const EnvironmentConfig.emulator({required this.projectId, this.endpoints})
    : mode = AppEnvironment.emulator,
      options = null,
      region = null,
      appCheckSiteKey = null,
      webPushKey = null,
      declaredEnvironment = null;
  const EnvironmentConfig.unconfigured(this.mode)
    : projectId = null,
      endpoints = null,
      options = null,
      region = null,
      appCheckSiteKey = null,
      webPushKey = null,
      declaredEnvironment = null;
  const EnvironmentConfig.firebase({
    required this.mode,
    required this.projectId,
    required this.options,
    required this.region,
    required this.appCheckSiteKey,
    required this.declaredEnvironment,
    this.webPushKey,
  }) : endpoints = null;
  factory EnvironmentConfig.fromDefines(AppEnvironment mode) =>
      EnvironmentConfig.firebase(
        mode: mode,
        declaredEnvironment: const String.fromEnvironment('TALLY_ENVIRONMENT'),
        webPushKey: const String.fromEnvironment('TALLY_WEB_PUSH_VAPID_KEY'),
        projectId: const String.fromEnvironment('TALLY_PROJECT_ID'),
        region: const String.fromEnvironment('TALLY_FUNCTIONS_REGION'),
        appCheckSiteKey: const String.fromEnvironment(
          'TALLY_APP_CHECK_WEB_SITE_KEY',
        ),
        options: const FirebaseRuntimeOptions(
          apiKey: String.fromEnvironment('TALLY_FIREBASE_API_KEY'),
          appId: String.fromEnvironment('TALLY_FIREBASE_APP_ID'),
          messagingSenderId: String.fromEnvironment(
            'TALLY_FIREBASE_MESSAGING_SENDER_ID',
          ),
          projectId: String.fromEnvironment('TALLY_PROJECT_ID'),
          authDomain: String.fromEnvironment('TALLY_FIREBASE_AUTH_DOMAIN'),
          storageBucket: String.fromEnvironment(
            'TALLY_FIREBASE_STORAGE_BUCKET',
          ),
        ),
      );
  final AppEnvironment mode;
  final String? projectId;
  final EmulatorEndpoints? endpoints;
  final FirebaseRuntimeOptions? options;
  final String? region;
  final String? appCheckSiteKey;
  final String? webPushKey;
  final String? declaredEnvironment;
  void validate() {
    if (mode == AppEnvironment.preview) {
      if (options != null) throw _invalidEnvironment();
      return;
    }
    if (mode != AppEnvironment.emulator) {
      final id = projectId;
      if (id == null ||
          id.startsWith('demo-') ||
          !RegExp(r'^[a-z][a-z0-9-]{4,28}[a-z0-9]$').hasMatch(id) ||
          declaredEnvironment != mode.name ||
          options == null ||
          region == null ||
          !RegExp(r'^[a-z]+-[a-z]+[0-9]$').hasMatch(region!) ||
          appCheckSiteKey == null ||
          appCheckSiteKey!.trim().isEmpty) {
        throw _invalidEnvironment();
      }
      options!.validate(id);
      if(webPushKey?.isNotEmpty==true&&!RegExp(r'^[A-Za-z0-9_-]{87}$').hasMatch(webPushKey!))throw _invalidEnvironment();
      return;
    }
    final id = projectId;
    final match = id == null ? null : _demoId.firstMatch(id);
    if (id == null ||
        id.length > 30 ||
        match == null ||
        match.end != id.length ||
        endpoints == null) {
      throw _invalidEnvironment();
    }
    endpoints!.validate();
  }

  static final _demoId = RegExp(r'^demo-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$');
}

AppFailure _invalidEnvironment() => AppFailure(
  AppFailureCode.invalidEnvironment,
  messageKey: 'startup.invalidEnvironment',
);
