import '../../sync/presentation/submission_feedback.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/page_body.dart';
import '../../../shared/widgets/error_panel.dart';
import '../../../shared/presentation/financial_form_support.dart';
import '../../../shared/domain/financial_failure.dart';
import '../domain/notification_preferences.dart';
import '../domain/reminder_entry.dart';
import '../../obligations/domain/obligation.dart';
import '../../recurring/domain/recurring_schedule.dart';
import 'notification_providers.dart';
import 'notification_actions.dart';
import 'reminder_tile.dart';
import 'notification_session_providers.dart';

class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});
  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  int _refresh = 0;
  void _reload() {
    setState(() => _refresh++);
    ref.invalidate(notificationPreferencesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(notificationPreferencesProvider);
    final session = ref.watch(notificationSessionStateProvider).value;
    return PageBody(
      title: 'Reminder settings',
      subtitle: 'Choose when Tally gives you a heads-up.',
      child: prefs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => ErrorPanel(
          title: 'Couldn’t load reminder settings',
          onRetry: _reload,
        ),
        data: (preferences) => NotificationSettingsForm(
          key: ValueKey('${preferences.owner.value}:$_refresh'),
          preferences: preferences,
          onRefresh: _reload,
          capabilityText: session?.message,
          onPermission: ref.read(notificationSessionProvider).requestPermission,
        ),
      ),
    );
  }
}

class NotificationSettingsForm extends ConsumerStatefulWidget {
  const NotificationSettingsForm({
    super.key,
    required this.preferences,
    this.onRefresh,
    this.onPermission,
    this.capabilityText,
    this.obligation,
    this.onSaved,
  });
  final NotificationPreferences preferences;
  final VoidCallback? onRefresh;
  final Future<void> Function()? onPermission;
  final String? capabilityText;
  final Obligation? obligation;
  final VoidCallback? onSaved;
  @override
  ConsumerState<NotificationSettingsForm> createState() =>
      _NotificationSettingsFormState();
}

class _NotificationSettingsFormState
    extends ConsumerState<NotificationSettingsForm> {
  final _form = GlobalKey<FormState>();
  late NotificationPreferences _base;
  NotificationPreferences? _pending;
  late TextEditingController _offsets, _time, _quietStart, _quietEnd;
  late bool _enabled, _push, _local;
  late Set<ReminderKind> _kinds;
  bool _dirty = false, _conflict = false, _saved = false, _queued = false;
  String? _validation;
  @override
  void initState() {
    super.initState();
    _base = widget.preferences;
    _offsets = TextEditingController();
    _time = TextEditingController();
    _quietStart = TextEditingController();
    _quietEnd = TextEditingController();
    _load(_base);
  }

  void _load(NotificationPreferences p) {
    _queued = false;
    _base = p;
    _enabled = widget.obligation?.reminderPolicy?.enabled ?? p.enabled;
    _push = p.pushEnabled;
    _local = p.localEnabled;
    _kinds = p.enabledKinds.toSet();
    _offsets.text =
        (widget.obligation?.reminderPolicy?.offsetDays ?? p.offsetDays).join(
          ', ',
        );
    _time.text = widget.obligation?.reminderPolicy?.localTime ?? p.localTime;
    _quietStart.text = p.quietStart;
    _quietEnd.text = p.quietEnd;
  }

  @override
  void didUpdateWidget(NotificationSettingsForm old) {
    super.didUpdateWidget(old);
    if (!_dirty &&
        _pending == null &&
        !_conflict &&
        old.preferences.revision != widget.preferences.revision) {
      _load(widget.preferences);
    }
  }

  @override
  void dispose() {
    _offsets.dispose();
    _time.dispose();
    _quietStart.dispose();
    _quietEnd.dispose();
    super.dispose();
  }

  List<int> _days() {
    final raw = _offsets.text.trim();
    if (raw.isEmpty) return [];
    final parsed = raw
        .split(',')
        .map((value) => int.tryParse(value.trim()))
        .toList();
    if (parsed.length > 8 ||
        parsed.any((value) => value == null || value < 0 || value > 365) ||
        parsed.toSet().length != parsed.length) {
      throw ArgumentError('Enter up to eight different days from 0 to 365.');
    }
    return parsed.cast<int>();
  }

  Future<void> _save() async {
    final repo = ref.read(notificationRepositoryProvider);
    if (repo.owner != _base.owner || _conflict) return;
    if (_pending == null) {
      if (!_form.currentState!.validate()) return;
      try {
        _pending = NotificationPreferences.fromPolicyMap(_base.owner, {
          'enabled': _enabled,
          'enabledKinds': _kinds.map((kind) => kind.name).toList(),
          'offsetDays': _days(),
          'localTime': _time.text.trim(),
          'quietStart': _quietStart.text.trim(),
          'quietEnd': _quietEnd.text.trim(),
          'pushEnabled': _push,
          'localEnabled': _local,
          'allowSensitivePushText': false,
          'timezonePolicy': 'savedDueProfileQuiet',
        }, revision: _base.revision);
      } on ArgumentError {
        setState(() => _validation = 'Check your reminder days and times.');
        return;
      }
    }
    setState(() {
      _saved = false;
      _validation = null;
    });
    final actions = ref.read(notificationActionsProvider.notifier);
    final result = widget.obligation == null
        ? await actions.savePreferences(_pending!)
        : await actions.setPolicy(
            widget.obligation!,
            ReminderPolicy(
              enabled: _pending!.enabled,
              offsetDays: _pending!.offsetDays,
              localTime: _pending!.localTime,
            ),
          );
    if (!mounted ||
        ref.read(notificationRepositoryProvider).owner != _base.owner) {
      return;
    }
    if (result is QueuedSubmission<int>) {
      setState(() {
        _pending = null;
        _dirty = false;
        _queued = true;
        _saved = false;
      });
      handleQueuedSubmission(
        context,
        result,
        closeDialog: widget.obligation != null,
      );
      return;
    }
    final confirmed = result?.acceptedValue;
    setState(() {
      if (confirmed != null) {
        _base = NotificationPreferences.fromPolicyMap(
          _base.owner,
          _pending!.toPolicyMap(),
          revision: confirmed,
        );
        _pending = null;
        _dirty = false;
        _saved = true;
        _queued = false;
      } else {
        final error = ref.read(notificationActionsProvider).error;
        final uncertain =
            error is FinancialFailure &&
            {
              FinancialFailureCode.offline,
              FinancialFailureCode.unavailable,
            }.contains(error.code);
        if (!uncertain) _pending = null;
        _conflict =
            error is FinancialFailure &&
            error.code == FinancialFailureCode.conflict;
      }
    });
    if (confirmed != null) widget.onSaved?.call();
  }

  void _changed() {
    _dirty = true;
    _saved = false;
  }

  @override
  Widget build(BuildContext context) {
    final action = ref.watch(notificationActionsProvider),
        changedOwner =
            ref.watch(notificationRepositoryProvider).owner != _base.owner;
    final editable =
        _pending == null &&
        !_conflict &&
        !_queued &&
        !action.isLoading &&
        !changedOwner;
    return Form(
      key: _form,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Reminders in Tally'),
              subtitle: const Text(
                'Keep a private inbox of what needs attention.',
              ),
              value: _enabled,
              onChanged: editable
                  ? (value) => setState(() {
                      _enabled = value;
                      _changed();
                    })
                  : null,
            ),
            const SizedBox(height: 16),
            if (widget.obligation == null) ...[
              Text(
                'What to remind me about',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final kind in ReminderKind.values)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(reminderKindLabel(kind)),
                  value: _kinds.contains(kind),
                  onChanged: editable
                      ? (value) => setState(() {
                          value == true
                              ? _kinds.add(kind)
                              : _kinds.remove(kind);
                          _changed();
                        })
                      : null,
                ),
            ],
            const SizedBox(height: 20),
            TextFormField(
              key: const Key('reminder-offsets'),
              controller: _offsets,
              enabled: editable,
              decoration: const InputDecoration(
                labelText: 'Days before due',
                helperText: 'Separate days with commas. 0 means the due date.',
              ),
              onChanged: (_) => _changed(),
              validator: (_) {
                try {
                  _days();
                  return null;
                } catch (_) {
                  return 'Enter up to eight different days from 0 to 365.';
                }
              },
            ),
            const SizedBox(height: 16),
            _timeField(
              'reminder-time',
              'Reminder time (HH:mm)',
              _time,
              editable,
            ),
            const SizedBox(height: 24),
            if (widget.obligation == null) ...[
              Text(
                'Quiet hours',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              const Text(
                'Alerts wait until quiet hours end in your preferred timezone. Use the same start and end to turn quiet hours off.',
              ),
              const SizedBox(height: 16),
              _timeField(
                'quiet-start',
                'Quiet hours start (HH:mm)',
                _quietStart,
                editable,
              ),
              const SizedBox(height: 16),
              _timeField(
                'quiet-end',
                'Quiet hours end (HH:mm)',
                _quietEnd,
                editable,
              ),
              const SizedBox(height: 24),
              Text(
                'Device alerts',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Push alerts'),
                subtitle: const Text(
                  'Optional alerts even when Tally is closed.',
                ),
                value: _push,
                onChanged: editable
                    ? (value) => setState(() {
                        _push = value;
                        _changed();
                      })
                    : null,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Local alerts on mobile'),
                subtitle: const Text(
                  'Schedule the next reminders on supported phones. Push takes priority on this device.',
                ),
                value: _local,
                onChanged: editable
                    ? (value) => setState(() {
                        _local = value;
                        _changed();
                      })
                    : null,
              ),
              const Text(
                'Alerts show “Tally reminder”. Names, amounts and notes stay inside your private inbox.',
              ),
              if (widget.capabilityText != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(widget.capabilityText!),
                ),
              if (widget.onPermission != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    onPressed: action.isLoading ? null : widget.onPermission,
                    icon: const Icon(Icons.notifications_none),
                    label: const Text('Allow notifications on this device'),
                  ),
                ),
            ],
            if (_pending != null && !action.isLoading)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text(
                  'The save could not be confirmed. Retry the original values to check its result.',
                ),
              ),
            if (_conflict)
              const Text(
                'Refresh reminder settings to load the latest choices before saving again.',
              ),
            if (_conflict && widget.onRefresh != null)
              TextButton(
                onPressed: widget.onRefresh,
                child: const Text('Refresh settings'),
              ),
            if (changedOwner)
              const Text('Account changed. Reopen reminder settings.'),
            if (_queued)
              const Text(
                'Waiting to sync. Your confirmed reminder settings stay in effect until this save is accepted.',
              ),
            if (_queued && widget.obligation == null)
              TextButton(
                onPressed: () => context.go('/settings/sync'),
                child: const Text('View saved action in Sync'),
              ),
            if (_saved)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('Reminder settings saved.'),
              ),
            if (_validation != null)
              Text(
                _validation!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            FinancialActionError(error: action.error),
            const SizedBox(height: 20),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton(
                key: const Key('reminder-save'),
                onPressed:
                    action.isLoading || _conflict || _queued || changedOwner
                    ? null
                    : _save,
                child: Text(
                  action.isLoading
                      ? 'Saving…'
                      : _pending != null
                      ? 'Retry save'
                      : 'Save reminders',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _timeField(
    String key,
    String label,
    TextEditingController controller,
    bool enabled,
  ) => TextFormField(
    key: Key(key),
    controller: controller,
    enabled: enabled,
    decoration: InputDecoration(labelText: label),
    onChanged: (_) => _changed(),
    validator: (value) =>
        NotificationPreferences.validTime((value ?? '').trim())
        ? null
        : 'Enter a time from 00:00 to 23:59.',
  );
}
