import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'environment.dart';

final environmentProvider = Provider<EnvironmentConfig>(
  (ref) => const EnvironmentConfig.preview(),
);
