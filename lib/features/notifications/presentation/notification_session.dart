import 'dart:async';
import 'dart:convert';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../domain/notification_repository.dart';
import '../domain/notification_preferences.dart';
import '../domain/notification_device.dart';
import '../domain/notification_platform.dart';

final class NotificationSessionState {
  const NotificationSessionState({
    this.closed = false,
    this.device,
    this.message = 'Your reminders stay in Tally.',
  });
  final bool closed;
  final NotificationDevice? device;
  final String message;
}

final class NotificationSession {
  NotificationSession({
    required this.repository,
    required this.platform,
    required this.local,
    required this.installationId,
    this.onOpen,
    this.unregisterTimeout = const Duration(seconds: 3),
  }) {
    if (unregisterTimeout <= Duration.zero ||
        unregisterTimeout > const Duration(seconds: 3)) {
      throw ArgumentError('Choose a bounded sign-out timeout.');
    }
  }
  final NotificationRepository repository;
  final NotificationPlatform platform;
  final LocalReminderScheduler local;
  final Future<String> Function() installationId;
  final Duration unregisterTimeout;
  void Function(Uri)? onOpen;
  final _events = StreamController<NotificationSessionState>.broadcast(
    sync: true,
  );
  NotificationSessionState _state = const NotificationSessionState();
  NotificationSessionState get state => _state;
  Stream<NotificationSessionState> watch() => Stream.multi((listener) {
    listener.add(_state);
    final sub = _events.stream.listen(
      listener.add,
      onError: listener.addError,
      onDone: listener.close,
    );
    listener.onCancel = sub.cancel;
  });
  StreamSubscription<NotificationPreferences>? _preferencesSubscription;
  StreamSubscription<String>? _tokensSubscription;
  StreamSubscription<ReminderIntent>? _opensSubscription;
  StreamSubscription<Object?>? _scheduledSubscription;
  Future<void> _queue = Future.value();
  int _generation = 0;
  String? _installation, _preferenceKey;
  NotificationDevice? _device;
  NotificationPreferences? _preferences;
  bool _started = false, _closed = false;
  void _emit(String message) {
    if (_closed) return;
    _state = NotificationSessionState(device: _device, message: message);
    _events.add(_state);
  }

  bool _current(int generation) => !_closed && generation == _generation;
  Future<void> _enqueue(Future<void> Function(int) action) {
    final generation = _generation;
    return _queue = _queue
        .then((_) async {
          if (_current(generation)) await action(generation);
        })
        .catchError((Object error, StackTrace stack) {
          if (_current(generation)) {
            _emit(
              'Device alerts could not be updated. Your reminders stay in Tally.',
            );
          }
        });
  }

  Future<void> start() async {
    if (_started || _closed) return;
    _started = true;
    final generation = _generation;
    try {
      _installation = await installationId();
      if (!_current(generation)) return;
      CommandId(_installation!);
      _preferences = await repository.watchPreferences().first;
      if (!_current(generation)) return;
      _preferenceKey = jsonEncode(_preferences!.toPolicyMap());
      PageCursor? cursor;
      do {
        final page = await repository.listDevices(
          newCommandId(),
          NotificationDeviceQuery(),
          after: cursor,
        );
        if (!_current(generation)) return;
        for (final device in page.items) {
          if (device.installationId == _installation) _device = device;
        }
        cursor = _device != null ? null : page.nextCursor;
      } while (cursor != null);
      if (!_current(generation)) return;
      _preferencesSubscription = repository.watchPreferences().listen(
        (value) {
          if (value.owner != repository.owner || _closed) return;
          final key = jsonEncode(value.toPolicyMap());
          _preferences = value;
          if (key != _preferenceKey) {
            _preferenceKey = key;
            unawaited(_enqueue((epoch) => _bind(epoch)));
          }
        },
        onError: (Object error) => _emit(
          'Reminder preferences could not be refreshed. Your inbox stays available.',
        ),
      );
      _tokensSubscription = platform.tokenChanges.listen(
        (token) => unawaited(_enqueue((epoch) => _bind(epoch, token: token))),
        onError: (Object error) => _emit(
          'Device alerts could not be refreshed. Your inbox stays available.',
        ),
      );
      _opensSubscription = platform.openedEvents.listen(
        (intent) => unawaited(_open(intent)),
        onError: (Object error) {},
      );
      await _enqueue((epoch) => _bind(epoch));
      if (!_current(generation)) return;
      final initial = await platform.initialMessage();
      if (initial != null && _current(generation)) await _open(initial);
    } catch (_) {
      if (_current(generation)) {
        _emit(
          'Device alerts could not be prepared. Your reminders stay in Tally.',
        );
      }
    }
  }

  Future<void> _bind(
    int generation, {
    String? token,
    NotificationCapability? supplied,
  }) async {
    final capability = supplied ?? await platform.inspect();
    if (!_current(generation) || _preferences == null) return;
    final prefs = _preferences!,
        channel = !prefs.enabled
            ? NotificationChannel.none
            : prefs.pushEnabled && capability.pushAvailable
            ? NotificationChannel.push
            : prefs.localEnabled && capability.localAvailable
            ? NotificationChannel.local
            : NotificationChannel.none;
    await _scheduledSubscription?.cancel();
    _scheduledSubscription = null;
    await local.cancelOwner(repository.owner);
    if (!_current(generation)) return;
    final device = await repository.registerDevice(
      newCommandId(),
      NotificationDeviceRegistration(
        installationId: _installation!,
        platform: capability.platform,
        permission: capability.permission,
        channel: channel,
        token: token ?? capability.token,
        appVersion: '0.1.0',
        expectedRevision: _device?.revision ?? 0,
      ),
    );
    if (!_current(generation)) return;
    _device = device;
    _emit(
      channel == NotificationChannel.push
          ? 'Push alerts are ready on this device.'
          : channel == NotificationChannel.local
          ? 'Local alerts are ready on this device.'
          : capability.message,
    );
    if (channel == NotificationChannel.local) {
      _scheduledSubscription = repository
          .watchUpcoming(NotificationUpcomingQuery(from: DateTime.now()))
          .listen(
            (page) {
              unawaited(
                _enqueue((epoch) async {
                  if (page.isFromCache) {
                    await local.cancelOwner(repository.owner);
                    return;
                  }
                  if (_device?.channel == NotificationChannel.local &&
                      _current(epoch)) {
                    await local.reconcile(
                      repository.owner,
                      page.items.take(50),
                    );
                  }
                }),
              );
            },
            onError: (Object error) {
              unawaited(_enqueue((_) => local.cancelOwner(repository.owner)));
            },
          );
    }
  }

  Future<void> requestPermission() async {
    if (_closed) return;
    final generation = _generation;
    try {
      final capability = await platform.requestPermission();
      if (_current(generation)) {
        await _enqueue((epoch) => _bind(epoch, supplied: capability));
      }
    } catch (_) {
      if (_current(generation)) {
        _emit(
          'Notifications are unavailable on this device. Your reminders stay in Tally.',
        );
      }
    }
  }

  Future<void> _open(ReminderIntent intent) async {
    final generation = _generation;
    if (!_current(generation)) return;
    try {
      final record = await repository.getReminder(intent.reminderId);
      if (!_current(generation) || record == null) return;
      final entry = record.value;
      if (entry.owner == repository.owner &&
          entry.visibleAt != null &&
          entry.obligationId == intent.obligationId &&
          entry.instanceId == intent.instanceId) {
        onOpen?.call(intent.uri);
      }
    } catch (_) {
      /* Owner gates keep unavailable targets out of navigation. */
    }
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _generation++;
    final device = _device;
    _device = null;
    _state = const NotificationSessionState(closed: true);
    _events.add(_state);
    try {
      final cancellations = <Future<void>>[];
      for (final subscription in [
        _tokensSubscription,
        _opensSubscription,
        _preferencesSubscription,
        _scheduledSubscription,
      ]) {
        if (subscription != null) {
          cancellations.add(Future<void>.sync(subscription.cancel));
        }
      }
      await Future.wait(cancellations).timeout(unregisterTimeout);
    } catch (_) {
      // The owner fence is already closed, including for late SDK callbacks.
    }
    try {
      await local.cancelOwner(repository.owner).timeout(unregisterTimeout);
    } catch (_) {}
    try {
      if (device != null) {
        await repository
            .unregisterDevice(newCommandId(), device)
            .timeout(unregisterTimeout);
      }
    } catch (_) {}
    try {
      await platform.clear().timeout(unregisterTimeout);
    } catch (_) {}
    // A paused presentation listener must not hold authentication cleanup.
    unawaited(_events.close());
  }
}
