import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/identifiers/entity_ids.dart';
import 'package:tally/core/errors/app_failure.dart';
import 'package:tally/features/auth/data/profile_dto.dart';

Map<String, Object?> data() => {
  'userId': 'alice',
  'displayName': 'Alice',
  'photoUrl': null,
  'defaultCurrency': 'PHP',
  'timezone': 'Asia/Manila',
  'locale': 'en',
  'themeMode': 'system',
  'onboardingComplete': false,
  'accountStatus': 'active',
  'revision': 1,
  'schemaVersion': 1,
};
void main() {
  test('profile maps server fields into the trusted owner domain', () {
    final profile = ProfileDto.fromMap(data(), owner: OwnerUid('alice'));
    expect(profile.defaultCurrency.code, 'PHP');
    expect(profile.onboardingComplete, isFalse);
  });
  for (final patch in [
    {'userId': 'bob'},
    {'themeMode': 'future'},
    {'defaultCurrency': 'XYZ'},
    {'timezone': 'Asia/Fiction'},
    {'revision': 0},
    {'onboardingComplete': 'false'},
    {'accountStatus': 'deleting'},
    {'schemaVersion': 2},
  ]) {
    test('unsupported or untrusted profile is rejected: $patch', () {
      expect(
        () =>
            ProfileDto.fromMap({...data(), ...patch}, owner: OwnerUid('alice')),
        throwsA(isA<AppFailure>()),
      );
    });
  }
}
