import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_clients.dart';

final firebaseClientsProvider = Provider<FirebaseClients>((ref) {
  throw StateError('Firebase has not been initialized.');
});
