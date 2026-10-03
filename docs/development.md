# Tally development

The Flutter foundation is being implemented incrementally. Default launches are explicit sample previews; production configuration and financial writes are not implemented yet.

## Verified toolchain

| Component | Resolved version |
| --- | --- |
| Flutter stable | 3.47.6 |
| Dart | 3.13.5 |
| flutter_riverpod | 3.4.3 |
| go_router | 18.0.2 |
| firebase_core | 4.15.0 |
| firebase_auth | 6.7.0 |
| cloud_firestore | 6.10.0 |
| cloud_functions | 6.5.0 |
| firebase_storage | 13.6.0 |
| cupertino_icons | Resolved in pubspec.lock |

Application dependencies are locked in pubspec.lock. Android minimum is at least API 23, and iOS deployment target is 15.0. The temporary native application identifier is dev.tally.tally, pending release/provisioning decisions.

The initial launch widget test passed and flutter analyze reported no issues. Later tasks expand this record with the actual checks and platform evidence. No Android/iOS build result is claimed by a web build.
