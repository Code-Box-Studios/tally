import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/config/environment.dart';
import 'package:tally/features/notifications/data/firebase_messaging_adapter.dart';
import 'package:tally/features/notifications/domain/notification_device.dart';

void main() {
  test(
    'demo and preview adapters never invoke Firebase Messaging or prompt',
    () async {
      for (final config in [
        const EnvironmentConfig.preview(),
        const EnvironmentConfig.emulator(projectId: 'demo-tally'),
      ]) {
        final adapter = FirebaseMessagingAdapter(config, web: true);
        final passive = await adapter.inspect(),
            requested = await adapter.requestPermission();
        expect(passive.permission, NotificationPermission.unsupported);
        expect(requested.pushAvailable, isFalse);
        expect(passive.token, isNull);
        expect(await adapter.initialMessage(), isNull);
        await adapter.clear();
      }
    },
  );
  test(
    'missing web push setup preserves inbox without instantiating the SDK',
    () async {
      final adapter = FirebaseMessagingAdapter(
        const EnvironmentConfig.firebase(
          mode: AppEnvironment.staging,
          projectId: 'tally-staging',
          appCheckSiteKey: 'public-test-site-key',
          declaredEnvironment: 'staging',
          options: FirebaseRuntimeOptions(
            apiKey: 'public-test-key',
            appId: '1:123:web:test',
            messagingSenderId: '123',
            projectId: 'tally-staging',
            authDomain: 'tally-staging.firebaseapp.com',
            storageBucket: 'tally-staging.firebasestorage.app',
          ),
          region: 'asia-southeast1',
        ),
        web: true,
      );
      final result = await adapter.inspect();
      expect(result.pushAvailable, isFalse);
      expect(result.message, contains('Tally'));
      await adapter.clear();
    },
  );
}
