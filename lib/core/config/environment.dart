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

final class EnvironmentConfig {
  const EnvironmentConfig.preview()
    : mode = AppEnvironment.preview,
      projectId = null,
      endpoints = null;
  const EnvironmentConfig.emulator({required this.projectId, this.endpoints})
    : mode = AppEnvironment.emulator;
  const EnvironmentConfig.unconfigured(this.mode)
    : projectId = null,
      endpoints = null;
  final AppEnvironment mode;
  final String? projectId;
  final EmulatorEndpoints? endpoints;
  void validate() {
    if (mode == AppEnvironment.preview) return;
    if (mode != AppEnvironment.emulator) throw _invalidEnvironment();
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
