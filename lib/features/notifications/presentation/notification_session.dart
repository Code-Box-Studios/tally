import 'dart:async';
import 'dart:convert';

import '../../../core/identifiers/command_id_factory.dart';
import '../../../core/identifiers/entity_ids.dart';
import '../../../shared/domain/data_page.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/notification_repository.dart';
import '../domain/notification_preferences.dart';
import '../domain/notification_device.dart';
import '../domain/notification_platform.dart';
import '../domain/reminder_entry.dart';

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
    void Function(Uri)? onOpen,
    this.unregisterTimeout = const Duration(seconds: 3),
    this.operationTimeout = const Duration(seconds: 3),
  }) {
    this.onOpen = onOpen;
    if (unregisterTimeout <= Duration.zero ||
        unregisterTimeout > const Duration(seconds: 3)) {
      throw ArgumentError('Choose a bounded sign-out timeout.');
    }
    if (operationTimeout <= Duration.zero ||
        operationTimeout > const Duration(seconds: 10)) {
      throw ArgumentError('Choose a bounded notification operation timeout.');
    }
  }
  final NotificationRepository repository;
  final NotificationPlatform platform;
  final LocalReminderScheduler local;
  final Future<String> Function() installationId;
  final Duration unregisterTimeout;
  final Duration operationTimeout;
  void Function(Uri)? _onOpen;
  void Function(Uri)? get onOpen => _onOpen;
  set onOpen(void Function(Uri)? value) {
    _onOpen = value;
    if (value != null && _pendingOpen != null && !_closed) {
      unawaited(_open(_pendingOpen!));
    }
  }

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
  Future<void>? _starting;
  final _preferencesReady = Completer<void>();
  Timer? _retry;
  int _generation = 0,
      _bindingGeneration = 0,
      _openGeneration = 0,
      _retryAttempts = 0;
  String? _installation, _preferenceKey;
  NotificationDevice? _device;
  NotificationPreferences? _preferences;
  (CommandId, NotificationDeviceRegistration)? _registration;
  ReminderIntent? _pendingOpen;
  bool _initialConsumed = false, _bindingFailed = false, _closed = false;
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
            _bindingFailed = true;
            _emit(
              'Device alerts could not be updated. Your reminders stay in Tally.',
            );
            _scheduleRetry();
          }
        });
  }

  void _scheduleRetry() {
    if (_closed || _retry != null || _retryAttempts >= 3) return;
    _retryAttempts++;
    _retry = Timer(const Duration(seconds: 30), () {
      _retry = null;
      if (!_closed) unawaited(start());
    });
  }

  Future<void> start() {
    if (_closed) return Future.value();
    return _starting ??= _start().whenComplete(() => _starting = null);
  }

  Future<void> resume() {
    _retry?.cancel();
    _retry = null;
    _retryAttempts = 0;
    return start();
  }

  Future<void> _start() async {
    final generation = _generation;
    try {
      // Open handling does not depend on an online device metadata callable.
      _opensSubscription ??= platform.openedEvents.listen(
        (intent) => unawaited(_open(intent)),
        onError: (Object error) {},
      );
      unawaited(_consumeInitial());
      _installation ??= await installationId().timeout(operationTimeout);
      if (!_current(generation)) return;
      CommandId(_installation!);
      _preferencesSubscription ??= repository.watchPreferences().listen(
        (value) {
          if (value.owner != repository.owner || _closed) return;
          final key = jsonEncode(value.toPolicyMap());
          final first = _preferences == null;
          _preferences = value;
          if (!_preferencesReady.isCompleted) _preferencesReady.complete();
          if (!first && (key != _preferenceKey || _bindingFailed)) {
            unawaited(_requestBinding());
          }
          _preferenceKey = key;
        },
        onError: (Object error) => _emit(
          'Reminder preferences could not be refreshed. Your inbox stays available.',
        ),
      );
      _tokensSubscription ??= platform.tokenChanges.listen(
        (token) => unawaited(_requestBinding(token: token)),
        onError: (Object error) => _emit(
          'Device alerts could not be refreshed. Your inbox stays available.',
        ),
      );
      await _preferencesReady.future.timeout(operationTimeout);
      if (!_current(generation)) return;
      await _requestBinding();
      if (_pendingOpen != null && _current(generation)) {
        await _open(_pendingOpen!);
      }
    } catch (_) {
      if (_current(generation)) {
        _emit(
          'Device alerts could not be prepared. Your reminders stay in Tally.',
        );
        _scheduleRetry();
      }
    }
  }

  Future<void> _consumeInitial() async {
    if (_closed || _initialConsumed) return;
    _initialConsumed = true;
    final generation = _generation;
    try {
      final initial = await platform.initialMessage().timeout(operationTimeout);
      if (initial != null && _current(generation)) await _open(initial);
    } catch (_) {
      if (_current(generation)) {
        _initialConsumed = false;
        _scheduleRetry();
      }
    }
  }

  Future<void> _requestBinding({
    String? token,
    NotificationCapability? supplied,
  }) {
    if (_closed) return Future.value();
    // Invalidate delivered-but-queued pages before any asynchronous inspection.
    final binding = ++_bindingGeneration;
    unawaited(local.cancelOwner(repository.owner).catchError((Object _) {}));
    return _enqueue(
      (epoch) => _bind(epoch, binding, token: token, supplied: supplied),
    );
  }

  bool _bindingCurrent(int generation, int binding) =>
      _current(generation) && binding == _bindingGeneration;

  Future<NotificationDevice?> _loadDevice(String installation) async {
    PageCursor? cursor;
    do {
      final page = await repository.listDevices(
        newCommandId(),
        NotificationDeviceQuery(),
        after: cursor,
      );
      for (final device in page.items) {
        if (device.owner != repository.owner) {
          throw StateError('Invalid device owner.');
        }
        if (device.installationId == installation) return device;
      }
      cursor = page.nextCursor;
    } while (cursor != null);
    return null;
  }

  bool _conflict(Object error) =>
      error is FinancialFailure && error.code == FinancialFailureCode.conflict;
  bool _uncertain(Object error) =>
      error is! FinancialFailure ||
      {
        FinancialFailureCode.offline,
        FinancialFailureCode.unavailable,
      }.contains(error.code);

  String _registrationKey(NotificationDeviceRegistration value) =>
      jsonEncode(value.toPayload()..remove('expectedRevision'));

  Future<NotificationDevice?> _register(
    int generation,
    int binding,
    NotificationCapability capability,
    NotificationChannel channel,
    String? token,
  ) async {
    NotificationDeviceRegistration payload(int revision) =>
        NotificationDeviceRegistration(
          installationId: _installation!,
          platform: capability.platform,
          permission: capability.permission,
          channel: channel,
          token: token ?? capability.token,
          appVersion: '0.1.0',
          expectedRevision: revision,
        );
    NotificationDevice? recovered;
    final pending = _registration;
    if (pending != null) {
      try {
        recovered = await repository
            .registerDevice(pending.$1, pending.$2)
            .timeout(operationTimeout);
        if (!_bindingCurrent(generation, binding)) return null;
        _registration = null;
      } catch (error) {
        if (!_bindingCurrent(generation, binding)) return null;
        if (!_uncertain(error)) _registration = null;
        if (!_conflict(error)) rethrow;
      }
    }
    var current = await _loadDevice(_installation!).timeout(operationTimeout);
    if (!_bindingCurrent(generation, binding)) return null;
    if (recovered != null &&
        current?.revision == recovered.revision &&
        pending != null &&
        _registrationKey(pending.$2) == _registrationKey(payload(0))) {
      return current;
    }
    for (var attempt = 0; attempt < 2; attempt++) {
      final command = (newCommandId(), payload(current?.revision ?? 0));
      _registration = command;
      try {
        final device = await repository
            .registerDevice(command.$1, command.$2)
            .timeout(operationTimeout);
        if (!_bindingCurrent(generation, binding)) return null;
        _registration = null;
        return device;
      } catch (error) {
        if (!_bindingCurrent(generation, binding)) return null;
        if (!_uncertain(error)) _registration = null;
        if (!_conflict(error) || attempt == 1) rethrow;
        current = await _loadDevice(_installation!).timeout(operationTimeout);
        if (!_bindingCurrent(generation, binding)) return null;
      }
    }
    return null;
  }

  Future<void> _bind(
    int generation,
    int binding, {
    String? token,
    NotificationCapability? supplied,
  }) async {
    if (!_bindingCurrent(generation, binding) ||
        _preferences == null ||
        _installation == null) {
      return;
    }
    final capability =
        supplied ?? await platform.inspect().timeout(operationTimeout);
    if (!_bindingCurrent(generation, binding)) return;
    final prefs = _preferences!,
        channel = !prefs.enabled
            ? NotificationChannel.none
            : prefs.pushEnabled && capability.pushAvailable
            ? NotificationChannel.push
            : prefs.localEnabled && capability.localAvailable
            ? NotificationChannel.local
            : NotificationChannel.none;
    await _scheduledSubscription?.cancel().timeout(operationTimeout);
    _scheduledSubscription = null;
    await local.cancelOwner(repository.owner).timeout(operationTimeout);
    if (!_bindingCurrent(generation, binding)) return;
    final device = await _register(
      generation,
      binding,
      capability,
      channel,
      token,
    );
    if (!_bindingCurrent(generation, binding) || device == null) return;
    _device = device;
    _bindingFailed = false;
    _retry?.cancel();
    _retry = null;
    _retryAttempts = 0;
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
                  if (!_canSchedule(epoch, binding)) return;
                  if (page.isFromCache) {
                    await local.cancelOwner(repository.owner);
                    return;
                  }
                  if (_canSchedule(epoch, binding)) {
                    await local.reconcile(
                      repository.owner,
                      page.items.take(50),
                    );
                  }
                }),
              );
            },
            onError: (Object error) {
              unawaited(
                _enqueue((epoch) async {
                  if (_canSchedule(epoch, binding)) {
                    await local.cancelOwner(repository.owner);
                  }
                }),
              );
            },
          );
    }
  }

  bool _canSchedule(int generation, int binding) =>
      _bindingCurrent(generation, binding) &&
      _preferences?.enabled == true &&
      _preferences?.localEnabled == true &&
      _device?.active == true &&
      _device?.channel == NotificationChannel.local;

  Future<void> requestPermission() async {
    if (_closed) return;
    final generation = _generation;
    try {
      final capability = await platform.requestPermission();
      if (_current(generation)) {
        await _requestBinding(supplied: capability);
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
    final open = ++_openGeneration;
    _pendingOpen = intent;
    try {
      final record = await repository
          .getReminder(intent.reminderId)
          .timeout(operationTimeout);
      if (!_current(generation) || open != _openGeneration) return;
      if (record == null) {
        _pendingOpen = null;
        return;
      }
      final entry = record.value;
      final available =
          entry.visibleAt != null ||
          (entry.status == ReminderStatus.pending &&
              !entry.scheduledAt.isAfter(DateTime.now()));
      if (entry.owner == repository.owner &&
          available &&
          entry.obligationId == intent.obligationId &&
          entry.instanceId == intent.instanceId) {
        if (_onOpen != null) {
          _pendingOpen = null;
          _onOpen!(intent.uri);
        }
      } else {
        _pendingOpen = null;
      }
    } catch (_) {
      if (_current(generation) && open == _openGeneration) {
        _emit(
          'This reminder needs to sync. Your private inbox stays available.',
        );
        _onOpen?.call(Uri(path: '/settings/reminders/inbox'));
        _scheduleRetry();
      }
    }
  }

  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _generation++;
    _bindingGeneration++;
    if (!_preferencesReady.isCompleted) _preferencesReady.complete();
    _retry?.cancel();
    _pendingOpen = null;
    _registration = null;
    _onOpen = null;
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
      await (() async {
        if (_installation == null) return;
        final current = await _loadDevice(_installation!);
        if (current != null) {
          await repository.unregisterDevice(newCommandId(), current);
        } else if (device != null) {
          await repository.unregisterDevice(newCommandId(), device);
        }
      })().timeout(unregisterTimeout);
    } catch (_) {}
    try {
      await platform.clear().timeout(unregisterTimeout);
    } catch (_) {}
    // A paused presentation listener must not hold authentication cleanup.
    unawaited(_events.close());
  }
}
