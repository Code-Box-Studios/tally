import '../../../core/dates/timezone_catalog.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';

enum ProfileTheme { light, dark, system }

final class ProfilePreferences {
  ProfilePreferences({
    required this.currency,
    required this.timezone,
    required this.theme,
    required this.onboardingComplete,
  }) {
    if (!TimezoneCatalog.contains(timezone)) {
      throw AppFailure(
        AppFailureCode.invalidDate,
        messageKey: 'profile.timezone',
      );
    }
  }
  final CurrencyCode currency;
  final String timezone;
  final ProfileTheme theme;
  final bool onboardingComplete;
}

final class UserProfile {
  UserProfile({
    required this.uid,
    required this.displayName,
    required this.photoUrl,
    required this.defaultCurrency,
    required this.timezone,
    required this.locale,
    required this.theme,
    required this.onboardingComplete,
    required this.revision,
    this.isFromCache = false,
  }) {
    if (!TimezoneCatalog.contains(timezone) ||
        revision < 1 ||
        displayName.length > 120) {
      throw AppFailure(
        AppFailureCode.unavailable,
        messageKey: 'profile.invalid',
      );
    }
  }
  final OwnerUid uid;
  final String displayName;
  final String? photoUrl;
  final CurrencyCode defaultCurrency;
  final String timezone;
  final String locale;
  final ProfileTheme theme;
  final bool onboardingComplete;
  final int revision;
  final bool isFromCache;
  ProfilePreferences get preferences => ProfilePreferences(
    currency: defaultCurrency,
    timezone: timezone,
    theme: theme,
    onboardingComplete: onboardingComplete,
  );
}
