import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/auth_repository.dart';
import '../domain/user_profile.dart';
import 'auth_failure.dart';
import 'profile_dto.dart';

final class FirebaseProfileRepository implements ProfileRepository {
  FirebaseProfileRepository(this.firestore, this.functions);
  final FirebaseFirestore firestore;
  final FirebaseFunctions functions;

  @override
  Future<UserProfile> bootstrap(OwnerUid owner) async {
    try {
      final response = await functions
          .httpsCallable('bootstrapUser')
          .call<Object?>(<String, Object?>{});
      final map = Map<String, Object?>.from(response.data as Map);
      return ProfileDto.fromMap(
        Map<String, Object?>.from(map['profile'] as Map),
        owner: owner,
      );
    } catch (error) {
      throw authFailure(error);
    }
  }

  @override
  Stream<UserProfile> watchProfile(OwnerUid owner) => firestore
      .doc('users/${owner.value}')
      .snapshots(includeMetadataChanges: true)
      .where((doc) => doc.exists || !doc.metadata.isFromCache)
      .map((doc) {
        return ProfileDto.fromMap(
          doc.data() ?? {},
          owner: owner,
          isFromCache: doc.metadata.isFromCache,
        );
      })
      .handleError((Object error) => throw authFailure(error));

  @override
  Future<UserProfile> update(
    ProfilePreferences preferences, {
    required OwnerUid owner,
    required int expectedRevision,
    required CommandId commandId,
  }) async {
    try {
      final response = await functions
          .httpsCallable('updateProfile')
          .call<Object?>({
            'commandId': commandId.value,
            'expectedOwnerUid': owner.value,
            'expectedRevision': expectedRevision,
            'defaultCurrency': preferences.currency.code,
            'timezone': preferences.timezone,
            'themeMode': preferences.theme.name,
            'onboardingComplete': preferences.onboardingComplete,
          });
      final data = Map<String, Object?>.from(response.data as Map);
      final map = Map<String, Object?>.from(data['profile'] as Map);
      return ProfileDto.fromMap(map, owner: owner);
    } catch (error) {
      throw authFailure(error);
    }
  }
}
