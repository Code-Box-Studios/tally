import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/identifiers/entity_ids.dart';
import '../domain/command_submission.dart';
export '../domain/command_submission.dart';

extension ConfirmedSubmissionValue<T> on CommandSubmission<T> {
  T? get acceptedValue => switch (this) {
    AcceptedSubmission<T>(:final value) => value,
    QueuedSubmission<T>() => null,
  };
}

/// Finishes a local save without inventing a canonical DTO for callbacks.
bool handleQueuedSubmission(
  BuildContext context,
  CommandSubmission<Object?> submission, {
  bool closeDialog = false,
  bool navigate = false,
  ValueChanged<CommandId>? onQueued,
}) {
  if (submission is! QueuedSubmission<Object?>) return false;
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
    const SnackBar(content: Text('Waiting to sync. Saved on this device.')),
  );
  if (onQueued != null) {
    onQueued(submission.commandId);
  } else if (closeDialog) {
    Navigator.pop(context);
  } else if (navigate) {
    context.go('/settings/sync/${submission.commandId.value}');
  }
  return true;
}
