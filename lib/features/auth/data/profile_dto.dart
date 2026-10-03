import '../../../core/errors/app_failure.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../core/money/currency_code.dart';
import '../domain/user_profile.dart';

abstract final class ProfileDto {
  static UserProfile fromMap(
    Map<String, Object?> map, {
    required OwnerUid owner,
  }) {
    try {
      if (map['userId'] != owner.value ||
          map['accountStatus'] != 'active' ||
          map['schemaVersion'] != 1 ||
          map['revision'] is! int) {
        throw const FormatException();
      }
      return UserProfile(
        uid: owner,
        displayName: map['displayName'] as String,
        photoUrl: map['photoUrl'] as String?,
        defaultCurrency: CurrencyCode.parse(map['defaultCurrency'] as String),
        timezone: map['timezone'] as String,
        locale: map['locale'] as String,
        theme: ProfileTheme.values.byName(map['themeMode'] as String),
        onboardingComplete: map['onboardingComplete'] as bool,
        revision: map['revision'] as int,
      );
    } catch (_) {
      throw AppFailure(
        AppFailureCode.unavailable,
        messageKey: 'profile.unsupported',
      );
    }
  }
}
