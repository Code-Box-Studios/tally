import '../../../core/errors/app_failure.dart';
import 'user_profile.dart';

enum SessionStage {
  initializing,
  signedOut,
  bootstrappingProfile,
  needsOnboarding,
  ready,
  failure,
}

final class SessionState {
  const SessionState(this.stage, {this.profile, this.failure});
  final SessionStage stage;
  final UserProfile? profile;
  final AppFailure? failure;
}
