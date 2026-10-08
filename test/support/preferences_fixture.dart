import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

/// Uses the official asynchronous plugin fixture for app-root handoff discovery.
void useInMemoryPreferences() {
  SharedPreferencesAsyncPlatform.instance =
      InMemorySharedPreferencesAsync.empty();
}

void resetPreferencesPlatform() {
  SharedPreferencesAsyncPlatform.instance = null;
}
