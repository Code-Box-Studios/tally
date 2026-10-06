import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/private_session_cleanup.dart';

final privateSessionCleanupProvider = Provider<PrivateSessionCleanup>(
  (_) => PrivateSessionCleanup(),
);
