// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outbox_database.dart';

// ignore_for_file: type=lint
class $CommandRowsTable extends CommandRows
    with TableInfo<$CommandRowsTable, StoredCommand> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CommandRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _sequenceMeta = const VerificationMeta(
    'sequence',
  );
  @override
  late final GeneratedColumn<int> sequence = GeneratedColumn<int>(
    'sequence',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _commandIdMeta = const VerificationMeta(
    'commandId',
  );
  @override
  late final GeneratedColumn<String> commandId = GeneratedColumn<String>(
    'command_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways('UNIQUE'),
  );
  static const VerificationMeta _commandJsonMeta = const VerificationMeta(
    'commandJson',
  );
  @override
  late final GeneratedColumn<String> commandJson = GeneratedColumn<String>(
    'command_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _resourceKeyMeta = const VerificationMeta(
    'resourceKey',
  );
  @override
  late final GeneratedColumn<String> resourceKey = GeneratedColumn<String>(
    'resource_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stateMeta = const VerificationMeta('state');
  @override
  late final GeneratedColumn<String> state = GeneratedColumn<String>(
    'state',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _revisionMeta = const VerificationMeta(
    'revision',
  );
  @override
  late final GeneratedColumn<int> revision = GeneratedColumn<int>(
    'revision',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _attemptsMeta = const VerificationMeta(
    'attempts',
  );
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
    'attempts',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nextAttemptAtMeta = const VerificationMeta(
    'nextAttemptAt',
  );
  @override
  late final GeneratedColumn<int> nextAttemptAt = GeneratedColumn<int>(
    'next_attempt_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _rowGenerationMeta = const VerificationMeta(
    'rowGeneration',
  );
  @override
  late final GeneratedColumn<int> rowGeneration = GeneratedColumn<int>(
    'row_generation',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _dispatchTokenMeta = const VerificationMeta(
    'dispatchToken',
  );
  @override
  late final GeneratedColumn<String> dispatchToken = GeneratedColumn<String>(
    'dispatch_token',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dispatchGenerationMeta =
      const VerificationMeta('dispatchGeneration');
  @override
  late final GeneratedColumn<int> dispatchGeneration = GeneratedColumn<int>(
    'dispatch_generation',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dispatchExpiresAtMeta = const VerificationMeta(
    'dispatchExpiresAt',
  );
  @override
  late final GeneratedColumn<int> dispatchExpiresAt = GeneratedColumn<int>(
    'dispatch_expires_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _failureCodeMeta = const VerificationMeta(
    'failureCode',
  );
  @override
  late final GeneratedColumn<String> failureCode = GeneratedColumn<String>(
    'failure_code',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _failureRemainingMeta = const VerificationMeta(
    'failureRemaining',
  );
  @override
  late final GeneratedColumn<int> failureRemaining = GeneratedColumn<int>(
    'failure_remaining',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _resultJsonMeta = const VerificationMeta(
    'resultJson',
  );
  @override
  late final GeneratedColumn<String> resultJson = GeneratedColumn<String>(
    'result_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    sequence,
    userId,
    commandId,
    commandJson,
    resourceKey,
    state,
    revision,
    attempts,
    nextAttemptAt,
    updatedAt,
    rowGeneration,
    dispatchToken,
    dispatchGeneration,
    dispatchExpiresAt,
    failureCode,
    failureRemaining,
    resultJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'command_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<StoredCommand> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('sequence')) {
      context.handle(
        _sequenceMeta,
        sequence.isAcceptableOrUnknown(data['sequence']!, _sequenceMeta),
      );
    }
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('command_id')) {
      context.handle(
        _commandIdMeta,
        commandId.isAcceptableOrUnknown(data['command_id']!, _commandIdMeta),
      );
    } else if (isInserting) {
      context.missing(_commandIdMeta);
    }
    if (data.containsKey('command_json')) {
      context.handle(
        _commandJsonMeta,
        commandJson.isAcceptableOrUnknown(
          data['command_json']!,
          _commandJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_commandJsonMeta);
    }
    if (data.containsKey('resource_key')) {
      context.handle(
        _resourceKeyMeta,
        resourceKey.isAcceptableOrUnknown(
          data['resource_key']!,
          _resourceKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_resourceKeyMeta);
    }
    if (data.containsKey('state')) {
      context.handle(
        _stateMeta,
        state.isAcceptableOrUnknown(data['state']!, _stateMeta),
      );
    } else if (isInserting) {
      context.missing(_stateMeta);
    }
    if (data.containsKey('revision')) {
      context.handle(
        _revisionMeta,
        revision.isAcceptableOrUnknown(data['revision']!, _revisionMeta),
      );
    } else if (isInserting) {
      context.missing(_revisionMeta);
    }
    if (data.containsKey('attempts')) {
      context.handle(
        _attemptsMeta,
        attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta),
      );
    } else if (isInserting) {
      context.missing(_attemptsMeta);
    }
    if (data.containsKey('next_attempt_at')) {
      context.handle(
        _nextAttemptAtMeta,
        nextAttemptAt.isAcceptableOrUnknown(
          data['next_attempt_at']!,
          _nextAttemptAtMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_nextAttemptAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('row_generation')) {
      context.handle(
        _rowGenerationMeta,
        rowGeneration.isAcceptableOrUnknown(
          data['row_generation']!,
          _rowGenerationMeta,
        ),
      );
    }
    if (data.containsKey('dispatch_token')) {
      context.handle(
        _dispatchTokenMeta,
        dispatchToken.isAcceptableOrUnknown(
          data['dispatch_token']!,
          _dispatchTokenMeta,
        ),
      );
    }
    if (data.containsKey('dispatch_generation')) {
      context.handle(
        _dispatchGenerationMeta,
        dispatchGeneration.isAcceptableOrUnknown(
          data['dispatch_generation']!,
          _dispatchGenerationMeta,
        ),
      );
    }
    if (data.containsKey('dispatch_expires_at')) {
      context.handle(
        _dispatchExpiresAtMeta,
        dispatchExpiresAt.isAcceptableOrUnknown(
          data['dispatch_expires_at']!,
          _dispatchExpiresAtMeta,
        ),
      );
    }
    if (data.containsKey('failure_code')) {
      context.handle(
        _failureCodeMeta,
        failureCode.isAcceptableOrUnknown(
          data['failure_code']!,
          _failureCodeMeta,
        ),
      );
    }
    if (data.containsKey('failure_remaining')) {
      context.handle(
        _failureRemainingMeta,
        failureRemaining.isAcceptableOrUnknown(
          data['failure_remaining']!,
          _failureRemainingMeta,
        ),
      );
    }
    if (data.containsKey('result_json')) {
      context.handle(
        _resultJsonMeta,
        resultJson.isAcceptableOrUnknown(data['result_json']!, _resultJsonMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {sequence};
  @override
  StoredCommand map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return StoredCommand(
      sequence: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}sequence'],
      )!,
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      commandId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}command_id'],
      )!,
      commandJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}command_json'],
      )!,
      resourceKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}resource_key'],
      )!,
      state: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}state'],
      )!,
      revision: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}revision'],
      )!,
      attempts: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}attempts'],
      )!,
      nextAttemptAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}next_attempt_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
      rowGeneration: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}row_generation'],
      )!,
      dispatchToken: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}dispatch_token'],
      ),
      dispatchGeneration: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}dispatch_generation'],
      ),
      dispatchExpiresAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}dispatch_expires_at'],
      ),
      failureCode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}failure_code'],
      ),
      failureRemaining: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}failure_remaining'],
      ),
      resultJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}result_json'],
      ),
    );
  }

  @override
  $CommandRowsTable createAlias(String alias) {
    return $CommandRowsTable(attachedDatabase, alias);
  }
}

class StoredCommand extends DataClass implements Insertable<StoredCommand> {
  final int sequence;
  final String userId;
  final String commandId;
  final String commandJson;
  final String resourceKey;
  final String state;
  final int revision;
  final int attempts;
  final int nextAttemptAt;
  final int updatedAt;
  final int rowGeneration;
  final String? dispatchToken;
  final int? dispatchGeneration;
  final int? dispatchExpiresAt;
  final String? failureCode;
  final int? failureRemaining;
  final String? resultJson;
  const StoredCommand({
    required this.sequence,
    required this.userId,
    required this.commandId,
    required this.commandJson,
    required this.resourceKey,
    required this.state,
    required this.revision,
    required this.attempts,
    required this.nextAttemptAt,
    required this.updatedAt,
    required this.rowGeneration,
    this.dispatchToken,
    this.dispatchGeneration,
    this.dispatchExpiresAt,
    this.failureCode,
    this.failureRemaining,
    this.resultJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['sequence'] = Variable<int>(sequence);
    map['user_id'] = Variable<String>(userId);
    map['command_id'] = Variable<String>(commandId);
    map['command_json'] = Variable<String>(commandJson);
    map['resource_key'] = Variable<String>(resourceKey);
    map['state'] = Variable<String>(state);
    map['revision'] = Variable<int>(revision);
    map['attempts'] = Variable<int>(attempts);
    map['next_attempt_at'] = Variable<int>(nextAttemptAt);
    map['updated_at'] = Variable<int>(updatedAt);
    map['row_generation'] = Variable<int>(rowGeneration);
    if (!nullToAbsent || dispatchToken != null) {
      map['dispatch_token'] = Variable<String>(dispatchToken);
    }
    if (!nullToAbsent || dispatchGeneration != null) {
      map['dispatch_generation'] = Variable<int>(dispatchGeneration);
    }
    if (!nullToAbsent || dispatchExpiresAt != null) {
      map['dispatch_expires_at'] = Variable<int>(dispatchExpiresAt);
    }
    if (!nullToAbsent || failureCode != null) {
      map['failure_code'] = Variable<String>(failureCode);
    }
    if (!nullToAbsent || failureRemaining != null) {
      map['failure_remaining'] = Variable<int>(failureRemaining);
    }
    if (!nullToAbsent || resultJson != null) {
      map['result_json'] = Variable<String>(resultJson);
    }
    return map;
  }

  CommandRowsCompanion toCompanion(bool nullToAbsent) {
    return CommandRowsCompanion(
      sequence: Value(sequence),
      userId: Value(userId),
      commandId: Value(commandId),
      commandJson: Value(commandJson),
      resourceKey: Value(resourceKey),
      state: Value(state),
      revision: Value(revision),
      attempts: Value(attempts),
      nextAttemptAt: Value(nextAttemptAt),
      updatedAt: Value(updatedAt),
      rowGeneration: Value(rowGeneration),
      dispatchToken: dispatchToken == null && nullToAbsent
          ? const Value.absent()
          : Value(dispatchToken),
      dispatchGeneration: dispatchGeneration == null && nullToAbsent
          ? const Value.absent()
          : Value(dispatchGeneration),
      dispatchExpiresAt: dispatchExpiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(dispatchExpiresAt),
      failureCode: failureCode == null && nullToAbsent
          ? const Value.absent()
          : Value(failureCode),
      failureRemaining: failureRemaining == null && nullToAbsent
          ? const Value.absent()
          : Value(failureRemaining),
      resultJson: resultJson == null && nullToAbsent
          ? const Value.absent()
          : Value(resultJson),
    );
  }

  factory StoredCommand.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return StoredCommand(
      sequence: serializer.fromJson<int>(json['sequence']),
      userId: serializer.fromJson<String>(json['userId']),
      commandId: serializer.fromJson<String>(json['commandId']),
      commandJson: serializer.fromJson<String>(json['commandJson']),
      resourceKey: serializer.fromJson<String>(json['resourceKey']),
      state: serializer.fromJson<String>(json['state']),
      revision: serializer.fromJson<int>(json['revision']),
      attempts: serializer.fromJson<int>(json['attempts']),
      nextAttemptAt: serializer.fromJson<int>(json['nextAttemptAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      rowGeneration: serializer.fromJson<int>(json['rowGeneration']),
      dispatchToken: serializer.fromJson<String?>(json['dispatchToken']),
      dispatchGeneration: serializer.fromJson<int?>(json['dispatchGeneration']),
      dispatchExpiresAt: serializer.fromJson<int?>(json['dispatchExpiresAt']),
      failureCode: serializer.fromJson<String?>(json['failureCode']),
      failureRemaining: serializer.fromJson<int?>(json['failureRemaining']),
      resultJson: serializer.fromJson<String?>(json['resultJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'sequence': serializer.toJson<int>(sequence),
      'userId': serializer.toJson<String>(userId),
      'commandId': serializer.toJson<String>(commandId),
      'commandJson': serializer.toJson<String>(commandJson),
      'resourceKey': serializer.toJson<String>(resourceKey),
      'state': serializer.toJson<String>(state),
      'revision': serializer.toJson<int>(revision),
      'attempts': serializer.toJson<int>(attempts),
      'nextAttemptAt': serializer.toJson<int>(nextAttemptAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'rowGeneration': serializer.toJson<int>(rowGeneration),
      'dispatchToken': serializer.toJson<String?>(dispatchToken),
      'dispatchGeneration': serializer.toJson<int?>(dispatchGeneration),
      'dispatchExpiresAt': serializer.toJson<int?>(dispatchExpiresAt),
      'failureCode': serializer.toJson<String?>(failureCode),
      'failureRemaining': serializer.toJson<int?>(failureRemaining),
      'resultJson': serializer.toJson<String?>(resultJson),
    };
  }

  StoredCommand copyWith({
    int? sequence,
    String? userId,
    String? commandId,
    String? commandJson,
    String? resourceKey,
    String? state,
    int? revision,
    int? attempts,
    int? nextAttemptAt,
    int? updatedAt,
    int? rowGeneration,
    Value<String?> dispatchToken = const Value.absent(),
    Value<int?> dispatchGeneration = const Value.absent(),
    Value<int?> dispatchExpiresAt = const Value.absent(),
    Value<String?> failureCode = const Value.absent(),
    Value<int?> failureRemaining = const Value.absent(),
    Value<String?> resultJson = const Value.absent(),
  }) => StoredCommand(
    sequence: sequence ?? this.sequence,
    userId: userId ?? this.userId,
    commandId: commandId ?? this.commandId,
    commandJson: commandJson ?? this.commandJson,
    resourceKey: resourceKey ?? this.resourceKey,
    state: state ?? this.state,
    revision: revision ?? this.revision,
    attempts: attempts ?? this.attempts,
    nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
    updatedAt: updatedAt ?? this.updatedAt,
    rowGeneration: rowGeneration ?? this.rowGeneration,
    dispatchToken: dispatchToken.present
        ? dispatchToken.value
        : this.dispatchToken,
    dispatchGeneration: dispatchGeneration.present
        ? dispatchGeneration.value
        : this.dispatchGeneration,
    dispatchExpiresAt: dispatchExpiresAt.present
        ? dispatchExpiresAt.value
        : this.dispatchExpiresAt,
    failureCode: failureCode.present ? failureCode.value : this.failureCode,
    failureRemaining: failureRemaining.present
        ? failureRemaining.value
        : this.failureRemaining,
    resultJson: resultJson.present ? resultJson.value : this.resultJson,
  );
  StoredCommand copyWithCompanion(CommandRowsCompanion data) {
    return StoredCommand(
      sequence: data.sequence.present ? data.sequence.value : this.sequence,
      userId: data.userId.present ? data.userId.value : this.userId,
      commandId: data.commandId.present ? data.commandId.value : this.commandId,
      commandJson: data.commandJson.present
          ? data.commandJson.value
          : this.commandJson,
      resourceKey: data.resourceKey.present
          ? data.resourceKey.value
          : this.resourceKey,
      state: data.state.present ? data.state.value : this.state,
      revision: data.revision.present ? data.revision.value : this.revision,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      nextAttemptAt: data.nextAttemptAt.present
          ? data.nextAttemptAt.value
          : this.nextAttemptAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      rowGeneration: data.rowGeneration.present
          ? data.rowGeneration.value
          : this.rowGeneration,
      dispatchToken: data.dispatchToken.present
          ? data.dispatchToken.value
          : this.dispatchToken,
      dispatchGeneration: data.dispatchGeneration.present
          ? data.dispatchGeneration.value
          : this.dispatchGeneration,
      dispatchExpiresAt: data.dispatchExpiresAt.present
          ? data.dispatchExpiresAt.value
          : this.dispatchExpiresAt,
      failureCode: data.failureCode.present
          ? data.failureCode.value
          : this.failureCode,
      failureRemaining: data.failureRemaining.present
          ? data.failureRemaining.value
          : this.failureRemaining,
      resultJson: data.resultJson.present
          ? data.resultJson.value
          : this.resultJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('StoredCommand(')
          ..write('sequence: $sequence, ')
          ..write('userId: $userId, ')
          ..write('commandId: $commandId, ')
          ..write('commandJson: $commandJson, ')
          ..write('resourceKey: $resourceKey, ')
          ..write('state: $state, ')
          ..write('revision: $revision, ')
          ..write('attempts: $attempts, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowGeneration: $rowGeneration, ')
          ..write('dispatchToken: $dispatchToken, ')
          ..write('dispatchGeneration: $dispatchGeneration, ')
          ..write('dispatchExpiresAt: $dispatchExpiresAt, ')
          ..write('failureCode: $failureCode, ')
          ..write('failureRemaining: $failureRemaining, ')
          ..write('resultJson: $resultJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    sequence,
    userId,
    commandId,
    commandJson,
    resourceKey,
    state,
    revision,
    attempts,
    nextAttemptAt,
    updatedAt,
    rowGeneration,
    dispatchToken,
    dispatchGeneration,
    dispatchExpiresAt,
    failureCode,
    failureRemaining,
    resultJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is StoredCommand &&
          other.sequence == this.sequence &&
          other.userId == this.userId &&
          other.commandId == this.commandId &&
          other.commandJson == this.commandJson &&
          other.resourceKey == this.resourceKey &&
          other.state == this.state &&
          other.revision == this.revision &&
          other.attempts == this.attempts &&
          other.nextAttemptAt == this.nextAttemptAt &&
          other.updatedAt == this.updatedAt &&
          other.rowGeneration == this.rowGeneration &&
          other.dispatchToken == this.dispatchToken &&
          other.dispatchGeneration == this.dispatchGeneration &&
          other.dispatchExpiresAt == this.dispatchExpiresAt &&
          other.failureCode == this.failureCode &&
          other.failureRemaining == this.failureRemaining &&
          other.resultJson == this.resultJson);
}

class CommandRowsCompanion extends UpdateCompanion<StoredCommand> {
  final Value<int> sequence;
  final Value<String> userId;
  final Value<String> commandId;
  final Value<String> commandJson;
  final Value<String> resourceKey;
  final Value<String> state;
  final Value<int> revision;
  final Value<int> attempts;
  final Value<int> nextAttemptAt;
  final Value<int> updatedAt;
  final Value<int> rowGeneration;
  final Value<String?> dispatchToken;
  final Value<int?> dispatchGeneration;
  final Value<int?> dispatchExpiresAt;
  final Value<String?> failureCode;
  final Value<int?> failureRemaining;
  final Value<String?> resultJson;
  const CommandRowsCompanion({
    this.sequence = const Value.absent(),
    this.userId = const Value.absent(),
    this.commandId = const Value.absent(),
    this.commandJson = const Value.absent(),
    this.resourceKey = const Value.absent(),
    this.state = const Value.absent(),
    this.revision = const Value.absent(),
    this.attempts = const Value.absent(),
    this.nextAttemptAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowGeneration = const Value.absent(),
    this.dispatchToken = const Value.absent(),
    this.dispatchGeneration = const Value.absent(),
    this.dispatchExpiresAt = const Value.absent(),
    this.failureCode = const Value.absent(),
    this.failureRemaining = const Value.absent(),
    this.resultJson = const Value.absent(),
  });
  CommandRowsCompanion.insert({
    this.sequence = const Value.absent(),
    required String userId,
    required String commandId,
    required String commandJson,
    required String resourceKey,
    required String state,
    required int revision,
    required int attempts,
    required int nextAttemptAt,
    required int updatedAt,
    this.rowGeneration = const Value.absent(),
    this.dispatchToken = const Value.absent(),
    this.dispatchGeneration = const Value.absent(),
    this.dispatchExpiresAt = const Value.absent(),
    this.failureCode = const Value.absent(),
    this.failureRemaining = const Value.absent(),
    this.resultJson = const Value.absent(),
  }) : userId = Value(userId),
       commandId = Value(commandId),
       commandJson = Value(commandJson),
       resourceKey = Value(resourceKey),
       state = Value(state),
       revision = Value(revision),
       attempts = Value(attempts),
       nextAttemptAt = Value(nextAttemptAt),
       updatedAt = Value(updatedAt);
  static Insertable<StoredCommand> custom({
    Expression<int>? sequence,
    Expression<String>? userId,
    Expression<String>? commandId,
    Expression<String>? commandJson,
    Expression<String>? resourceKey,
    Expression<String>? state,
    Expression<int>? revision,
    Expression<int>? attempts,
    Expression<int>? nextAttemptAt,
    Expression<int>? updatedAt,
    Expression<int>? rowGeneration,
    Expression<String>? dispatchToken,
    Expression<int>? dispatchGeneration,
    Expression<int>? dispatchExpiresAt,
    Expression<String>? failureCode,
    Expression<int>? failureRemaining,
    Expression<String>? resultJson,
  }) {
    return RawValuesInsertable({
      if (sequence != null) 'sequence': sequence,
      if (userId != null) 'user_id': userId,
      if (commandId != null) 'command_id': commandId,
      if (commandJson != null) 'command_json': commandJson,
      if (resourceKey != null) 'resource_key': resourceKey,
      if (state != null) 'state': state,
      if (revision != null) 'revision': revision,
      if (attempts != null) 'attempts': attempts,
      if (nextAttemptAt != null) 'next_attempt_at': nextAttemptAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowGeneration != null) 'row_generation': rowGeneration,
      if (dispatchToken != null) 'dispatch_token': dispatchToken,
      if (dispatchGeneration != null) 'dispatch_generation': dispatchGeneration,
      if (dispatchExpiresAt != null) 'dispatch_expires_at': dispatchExpiresAt,
      if (failureCode != null) 'failure_code': failureCode,
      if (failureRemaining != null) 'failure_remaining': failureRemaining,
      if (resultJson != null) 'result_json': resultJson,
    });
  }

  CommandRowsCompanion copyWith({
    Value<int>? sequence,
    Value<String>? userId,
    Value<String>? commandId,
    Value<String>? commandJson,
    Value<String>? resourceKey,
    Value<String>? state,
    Value<int>? revision,
    Value<int>? attempts,
    Value<int>? nextAttemptAt,
    Value<int>? updatedAt,
    Value<int>? rowGeneration,
    Value<String?>? dispatchToken,
    Value<int?>? dispatchGeneration,
    Value<int?>? dispatchExpiresAt,
    Value<String?>? failureCode,
    Value<int?>? failureRemaining,
    Value<String?>? resultJson,
  }) {
    return CommandRowsCompanion(
      sequence: sequence ?? this.sequence,
      userId: userId ?? this.userId,
      commandId: commandId ?? this.commandId,
      commandJson: commandJson ?? this.commandJson,
      resourceKey: resourceKey ?? this.resourceKey,
      state: state ?? this.state,
      revision: revision ?? this.revision,
      attempts: attempts ?? this.attempts,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowGeneration: rowGeneration ?? this.rowGeneration,
      dispatchToken: dispatchToken ?? this.dispatchToken,
      dispatchGeneration: dispatchGeneration ?? this.dispatchGeneration,
      dispatchExpiresAt: dispatchExpiresAt ?? this.dispatchExpiresAt,
      failureCode: failureCode ?? this.failureCode,
      failureRemaining: failureRemaining ?? this.failureRemaining,
      resultJson: resultJson ?? this.resultJson,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (sequence.present) {
      map['sequence'] = Variable<int>(sequence.value);
    }
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (commandId.present) {
      map['command_id'] = Variable<String>(commandId.value);
    }
    if (commandJson.present) {
      map['command_json'] = Variable<String>(commandJson.value);
    }
    if (resourceKey.present) {
      map['resource_key'] = Variable<String>(resourceKey.value);
    }
    if (state.present) {
      map['state'] = Variable<String>(state.value);
    }
    if (revision.present) {
      map['revision'] = Variable<int>(revision.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (nextAttemptAt.present) {
      map['next_attempt_at'] = Variable<int>(nextAttemptAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowGeneration.present) {
      map['row_generation'] = Variable<int>(rowGeneration.value);
    }
    if (dispatchToken.present) {
      map['dispatch_token'] = Variable<String>(dispatchToken.value);
    }
    if (dispatchGeneration.present) {
      map['dispatch_generation'] = Variable<int>(dispatchGeneration.value);
    }
    if (dispatchExpiresAt.present) {
      map['dispatch_expires_at'] = Variable<int>(dispatchExpiresAt.value);
    }
    if (failureCode.present) {
      map['failure_code'] = Variable<String>(failureCode.value);
    }
    if (failureRemaining.present) {
      map['failure_remaining'] = Variable<int>(failureRemaining.value);
    }
    if (resultJson.present) {
      map['result_json'] = Variable<String>(resultJson.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CommandRowsCompanion(')
          ..write('sequence: $sequence, ')
          ..write('userId: $userId, ')
          ..write('commandId: $commandId, ')
          ..write('commandJson: $commandJson, ')
          ..write('resourceKey: $resourceKey, ')
          ..write('state: $state, ')
          ..write('revision: $revision, ')
          ..write('attempts: $attempts, ')
          ..write('nextAttemptAt: $nextAttemptAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowGeneration: $rowGeneration, ')
          ..write('dispatchToken: $dispatchToken, ')
          ..write('dispatchGeneration: $dispatchGeneration, ')
          ..write('dispatchExpiresAt: $dispatchExpiresAt, ')
          ..write('failureCode: $failureCode, ')
          ..write('failureRemaining: $failureRemaining, ')
          ..write('resultJson: $resultJson')
          ..write(')'))
        .toString();
  }
}

class $OutboxScopesTable extends OutboxScopes
    with TableInfo<$OutboxScopesTable, StoredScope> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $OutboxScopesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
    'user_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _environmentKeyMeta = const VerificationMeta(
    'environmentKey',
  );
  @override
  late final GeneratedColumn<String> environmentKey = GeneratedColumn<String>(
    'environment_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dispatchGenerationMeta =
      const VerificationMeta('dispatchGeneration');
  @override
  late final GeneratedColumn<int> dispatchGeneration = GeneratedColumn<int>(
    'dispatch_generation',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _dispatchTokenMeta = const VerificationMeta(
    'dispatchToken',
  );
  @override
  late final GeneratedColumn<String> dispatchToken = GeneratedColumn<String>(
    'dispatch_token',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _dispatchExpiresAtMeta = const VerificationMeta(
    'dispatchExpiresAt',
  );
  @override
  late final GeneratedColumn<int> dispatchExpiresAt = GeneratedColumn<int>(
    'dispatch_expires_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _clockSeenAtMeta = const VerificationMeta(
    'clockSeenAt',
  );
  @override
  late final GeneratedColumn<int> clockSeenAt = GeneratedColumn<int>(
    'clock_seen_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    userId,
    environmentKey,
    dispatchGeneration,
    dispatchToken,
    dispatchExpiresAt,
    clockSeenAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'outbox_scopes';
  @override
  VerificationContext validateIntegrity(
    Insertable<StoredScope> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('environment_key')) {
      context.handle(
        _environmentKeyMeta,
        environmentKey.isAcceptableOrUnknown(
          data['environment_key']!,
          _environmentKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_environmentKeyMeta);
    }
    if (data.containsKey('dispatch_generation')) {
      context.handle(
        _dispatchGenerationMeta,
        dispatchGeneration.isAcceptableOrUnknown(
          data['dispatch_generation']!,
          _dispatchGenerationMeta,
        ),
      );
    }
    if (data.containsKey('dispatch_token')) {
      context.handle(
        _dispatchTokenMeta,
        dispatchToken.isAcceptableOrUnknown(
          data['dispatch_token']!,
          _dispatchTokenMeta,
        ),
      );
    }
    if (data.containsKey('dispatch_expires_at')) {
      context.handle(
        _dispatchExpiresAtMeta,
        dispatchExpiresAt.isAcceptableOrUnknown(
          data['dispatch_expires_at']!,
          _dispatchExpiresAtMeta,
        ),
      );
    }
    if (data.containsKey('clock_seen_at')) {
      context.handle(
        _clockSeenAtMeta,
        clockSeenAt.isAcceptableOrUnknown(
          data['clock_seen_at']!,
          _clockSeenAtMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  StoredScope map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return StoredScope(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      environmentKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}environment_key'],
      )!,
      dispatchGeneration: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}dispatch_generation'],
      )!,
      dispatchToken: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}dispatch_token'],
      ),
      dispatchExpiresAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}dispatch_expires_at'],
      ),
      clockSeenAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}clock_seen_at'],
      ),
    );
  }

  @override
  $OutboxScopesTable createAlias(String alias) {
    return $OutboxScopesTable(attachedDatabase, alias);
  }
}

class StoredScope extends DataClass implements Insertable<StoredScope> {
  final int id;
  final String userId;
  final String environmentKey;
  final int dispatchGeneration;
  final String? dispatchToken;
  final int? dispatchExpiresAt;
  final int? clockSeenAt;
  const StoredScope({
    required this.id,
    required this.userId,
    required this.environmentKey,
    required this.dispatchGeneration,
    this.dispatchToken,
    this.dispatchExpiresAt,
    this.clockSeenAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['user_id'] = Variable<String>(userId);
    map['environment_key'] = Variable<String>(environmentKey);
    map['dispatch_generation'] = Variable<int>(dispatchGeneration);
    if (!nullToAbsent || dispatchToken != null) {
      map['dispatch_token'] = Variable<String>(dispatchToken);
    }
    if (!nullToAbsent || dispatchExpiresAt != null) {
      map['dispatch_expires_at'] = Variable<int>(dispatchExpiresAt);
    }
    if (!nullToAbsent || clockSeenAt != null) {
      map['clock_seen_at'] = Variable<int>(clockSeenAt);
    }
    return map;
  }

  OutboxScopesCompanion toCompanion(bool nullToAbsent) {
    return OutboxScopesCompanion(
      id: Value(id),
      userId: Value(userId),
      environmentKey: Value(environmentKey),
      dispatchGeneration: Value(dispatchGeneration),
      dispatchToken: dispatchToken == null && nullToAbsent
          ? const Value.absent()
          : Value(dispatchToken),
      dispatchExpiresAt: dispatchExpiresAt == null && nullToAbsent
          ? const Value.absent()
          : Value(dispatchExpiresAt),
      clockSeenAt: clockSeenAt == null && nullToAbsent
          ? const Value.absent()
          : Value(clockSeenAt),
    );
  }

  factory StoredScope.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return StoredScope(
      id: serializer.fromJson<int>(json['id']),
      userId: serializer.fromJson<String>(json['userId']),
      environmentKey: serializer.fromJson<String>(json['environmentKey']),
      dispatchGeneration: serializer.fromJson<int>(json['dispatchGeneration']),
      dispatchToken: serializer.fromJson<String?>(json['dispatchToken']),
      dispatchExpiresAt: serializer.fromJson<int?>(json['dispatchExpiresAt']),
      clockSeenAt: serializer.fromJson<int?>(json['clockSeenAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'userId': serializer.toJson<String>(userId),
      'environmentKey': serializer.toJson<String>(environmentKey),
      'dispatchGeneration': serializer.toJson<int>(dispatchGeneration),
      'dispatchToken': serializer.toJson<String?>(dispatchToken),
      'dispatchExpiresAt': serializer.toJson<int?>(dispatchExpiresAt),
      'clockSeenAt': serializer.toJson<int?>(clockSeenAt),
    };
  }

  StoredScope copyWith({
    int? id,
    String? userId,
    String? environmentKey,
    int? dispatchGeneration,
    Value<String?> dispatchToken = const Value.absent(),
    Value<int?> dispatchExpiresAt = const Value.absent(),
    Value<int?> clockSeenAt = const Value.absent(),
  }) => StoredScope(
    id: id ?? this.id,
    userId: userId ?? this.userId,
    environmentKey: environmentKey ?? this.environmentKey,
    dispatchGeneration: dispatchGeneration ?? this.dispatchGeneration,
    dispatchToken: dispatchToken.present
        ? dispatchToken.value
        : this.dispatchToken,
    dispatchExpiresAt: dispatchExpiresAt.present
        ? dispatchExpiresAt.value
        : this.dispatchExpiresAt,
    clockSeenAt: clockSeenAt.present ? clockSeenAt.value : this.clockSeenAt,
  );
  StoredScope copyWithCompanion(OutboxScopesCompanion data) {
    return StoredScope(
      id: data.id.present ? data.id.value : this.id,
      userId: data.userId.present ? data.userId.value : this.userId,
      environmentKey: data.environmentKey.present
          ? data.environmentKey.value
          : this.environmentKey,
      dispatchGeneration: data.dispatchGeneration.present
          ? data.dispatchGeneration.value
          : this.dispatchGeneration,
      dispatchToken: data.dispatchToken.present
          ? data.dispatchToken.value
          : this.dispatchToken,
      dispatchExpiresAt: data.dispatchExpiresAt.present
          ? data.dispatchExpiresAt.value
          : this.dispatchExpiresAt,
      clockSeenAt: data.clockSeenAt.present
          ? data.clockSeenAt.value
          : this.clockSeenAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('StoredScope(')
          ..write('id: $id, ')
          ..write('userId: $userId, ')
          ..write('environmentKey: $environmentKey, ')
          ..write('dispatchGeneration: $dispatchGeneration, ')
          ..write('dispatchToken: $dispatchToken, ')
          ..write('dispatchExpiresAt: $dispatchExpiresAt, ')
          ..write('clockSeenAt: $clockSeenAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    userId,
    environmentKey,
    dispatchGeneration,
    dispatchToken,
    dispatchExpiresAt,
    clockSeenAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is StoredScope &&
          other.id == this.id &&
          other.userId == this.userId &&
          other.environmentKey == this.environmentKey &&
          other.dispatchGeneration == this.dispatchGeneration &&
          other.dispatchToken == this.dispatchToken &&
          other.dispatchExpiresAt == this.dispatchExpiresAt &&
          other.clockSeenAt == this.clockSeenAt);
}

class OutboxScopesCompanion extends UpdateCompanion<StoredScope> {
  final Value<int> id;
  final Value<String> userId;
  final Value<String> environmentKey;
  final Value<int> dispatchGeneration;
  final Value<String?> dispatchToken;
  final Value<int?> dispatchExpiresAt;
  final Value<int?> clockSeenAt;
  const OutboxScopesCompanion({
    this.id = const Value.absent(),
    this.userId = const Value.absent(),
    this.environmentKey = const Value.absent(),
    this.dispatchGeneration = const Value.absent(),
    this.dispatchToken = const Value.absent(),
    this.dispatchExpiresAt = const Value.absent(),
    this.clockSeenAt = const Value.absent(),
  });
  OutboxScopesCompanion.insert({
    this.id = const Value.absent(),
    required String userId,
    required String environmentKey,
    this.dispatchGeneration = const Value.absent(),
    this.dispatchToken = const Value.absent(),
    this.dispatchExpiresAt = const Value.absent(),
    this.clockSeenAt = const Value.absent(),
  }) : userId = Value(userId),
       environmentKey = Value(environmentKey);
  static Insertable<StoredScope> custom({
    Expression<int>? id,
    Expression<String>? userId,
    Expression<String>? environmentKey,
    Expression<int>? dispatchGeneration,
    Expression<String>? dispatchToken,
    Expression<int>? dispatchExpiresAt,
    Expression<int>? clockSeenAt,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (userId != null) 'user_id': userId,
      if (environmentKey != null) 'environment_key': environmentKey,
      if (dispatchGeneration != null) 'dispatch_generation': dispatchGeneration,
      if (dispatchToken != null) 'dispatch_token': dispatchToken,
      if (dispatchExpiresAt != null) 'dispatch_expires_at': dispatchExpiresAt,
      if (clockSeenAt != null) 'clock_seen_at': clockSeenAt,
    });
  }

  OutboxScopesCompanion copyWith({
    Value<int>? id,
    Value<String>? userId,
    Value<String>? environmentKey,
    Value<int>? dispatchGeneration,
    Value<String?>? dispatchToken,
    Value<int?>? dispatchExpiresAt,
    Value<int?>? clockSeenAt,
  }) {
    return OutboxScopesCompanion(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      environmentKey: environmentKey ?? this.environmentKey,
      dispatchGeneration: dispatchGeneration ?? this.dispatchGeneration,
      dispatchToken: dispatchToken ?? this.dispatchToken,
      dispatchExpiresAt: dispatchExpiresAt ?? this.dispatchExpiresAt,
      clockSeenAt: clockSeenAt ?? this.clockSeenAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (environmentKey.present) {
      map['environment_key'] = Variable<String>(environmentKey.value);
    }
    if (dispatchGeneration.present) {
      map['dispatch_generation'] = Variable<int>(dispatchGeneration.value);
    }
    if (dispatchToken.present) {
      map['dispatch_token'] = Variable<String>(dispatchToken.value);
    }
    if (dispatchExpiresAt.present) {
      map['dispatch_expires_at'] = Variable<int>(dispatchExpiresAt.value);
    }
    if (clockSeenAt.present) {
      map['clock_seen_at'] = Variable<int>(clockSeenAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('OutboxScopesCompanion(')
          ..write('id: $id, ')
          ..write('userId: $userId, ')
          ..write('environmentKey: $environmentKey, ')
          ..write('dispatchGeneration: $dispatchGeneration, ')
          ..write('dispatchToken: $dispatchToken, ')
          ..write('dispatchExpiresAt: $dispatchExpiresAt, ')
          ..write('clockSeenAt: $clockSeenAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$OutboxDatabase extends GeneratedDatabase {
  _$OutboxDatabase(QueryExecutor e) : super(e);
  $OutboxDatabaseManager get managers => $OutboxDatabaseManager(this);
  late final $CommandRowsTable commandRows = $CommandRowsTable(this);
  late final $OutboxScopesTable outboxScopes = $OutboxScopesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    commandRows,
    outboxScopes,
  ];
}

typedef $$CommandRowsTableCreateCompanionBuilder =
    CommandRowsCompanion Function({
      Value<int> sequence,
      required String userId,
      required String commandId,
      required String commandJson,
      required String resourceKey,
      required String state,
      required int revision,
      required int attempts,
      required int nextAttemptAt,
      required int updatedAt,
      Value<int> rowGeneration,
      Value<String?> dispatchToken,
      Value<int?> dispatchGeneration,
      Value<int?> dispatchExpiresAt,
      Value<String?> failureCode,
      Value<int?> failureRemaining,
      Value<String?> resultJson,
    });
typedef $$CommandRowsTableUpdateCompanionBuilder =
    CommandRowsCompanion Function({
      Value<int> sequence,
      Value<String> userId,
      Value<String> commandId,
      Value<String> commandJson,
      Value<String> resourceKey,
      Value<String> state,
      Value<int> revision,
      Value<int> attempts,
      Value<int> nextAttemptAt,
      Value<int> updatedAt,
      Value<int> rowGeneration,
      Value<String?> dispatchToken,
      Value<int?> dispatchGeneration,
      Value<int?> dispatchExpiresAt,
      Value<String?> failureCode,
      Value<int?> failureRemaining,
      Value<String?> resultJson,
    });

class $$CommandRowsTableFilterComposer
    extends Composer<_$OutboxDatabase, $CommandRowsTable> {
  $$CommandRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get commandJson => $composableBuilder(
    column: $table.commandJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get resourceKey => $composableBuilder(
    column: $table.resourceKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get revision => $composableBuilder(
    column: $table.revision,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get rowGeneration => $composableBuilder(
    column: $table.rowGeneration,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get failureCode => $composableBuilder(
    column: $table.failureCode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get failureRemaining => $composableBuilder(
    column: $table.failureRemaining,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get resultJson => $composableBuilder(
    column: $table.resultJson,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CommandRowsTableOrderingComposer
    extends Composer<_$OutboxDatabase, $CommandRowsTable> {
  $$CommandRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get sequence => $composableBuilder(
    column: $table.sequence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get commandJson => $composableBuilder(
    column: $table.commandJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get resourceKey => $composableBuilder(
    column: $table.resourceKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get state => $composableBuilder(
    column: $table.state,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get revision => $composableBuilder(
    column: $table.revision,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get attempts => $composableBuilder(
    column: $table.attempts,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get rowGeneration => $composableBuilder(
    column: $table.rowGeneration,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get failureCode => $composableBuilder(
    column: $table.failureCode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get failureRemaining => $composableBuilder(
    column: $table.failureRemaining,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get resultJson => $composableBuilder(
    column: $table.resultJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CommandRowsTableAnnotationComposer
    extends Composer<_$OutboxDatabase, $CommandRowsTable> {
  $$CommandRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get sequence =>
      $composableBuilder(column: $table.sequence, builder: (column) => column);

  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get commandId =>
      $composableBuilder(column: $table.commandId, builder: (column) => column);

  GeneratedColumn<String> get commandJson => $composableBuilder(
    column: $table.commandJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get resourceKey => $composableBuilder(
    column: $table.resourceKey,
    builder: (column) => column,
  );

  GeneratedColumn<String> get state =>
      $composableBuilder(column: $table.state, builder: (column) => column);

  GeneratedColumn<int> get revision =>
      $composableBuilder(column: $table.revision, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<int> get nextAttemptAt => $composableBuilder(
    column: $table.nextAttemptAt,
    builder: (column) => column,
  );

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<int> get rowGeneration => $composableBuilder(
    column: $table.rowGeneration,
    builder: (column) => column,
  );

  GeneratedColumn<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => column,
  );

  GeneratedColumn<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => column,
  );

  GeneratedColumn<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => column,
  );

  GeneratedColumn<String> get failureCode => $composableBuilder(
    column: $table.failureCode,
    builder: (column) => column,
  );

  GeneratedColumn<int> get failureRemaining => $composableBuilder(
    column: $table.failureRemaining,
    builder: (column) => column,
  );

  GeneratedColumn<String> get resultJson => $composableBuilder(
    column: $table.resultJson,
    builder: (column) => column,
  );
}

class $$CommandRowsTableTableManager
    extends
        RootTableManager<
          _$OutboxDatabase,
          $CommandRowsTable,
          StoredCommand,
          $$CommandRowsTableFilterComposer,
          $$CommandRowsTableOrderingComposer,
          $$CommandRowsTableAnnotationComposer,
          $$CommandRowsTableCreateCompanionBuilder,
          $$CommandRowsTableUpdateCompanionBuilder,
          (
            StoredCommand,
            BaseReferences<_$OutboxDatabase, $CommandRowsTable, StoredCommand>,
          ),
          StoredCommand,
          PrefetchHooks Function()
        > {
  $$CommandRowsTableTableManager(_$OutboxDatabase db, $CommandRowsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CommandRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CommandRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CommandRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> sequence = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> commandId = const Value.absent(),
                Value<String> commandJson = const Value.absent(),
                Value<String> resourceKey = const Value.absent(),
                Value<String> state = const Value.absent(),
                Value<int> revision = const Value.absent(),
                Value<int> attempts = const Value.absent(),
                Value<int> nextAttemptAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowGeneration = const Value.absent(),
                Value<String?> dispatchToken = const Value.absent(),
                Value<int?> dispatchGeneration = const Value.absent(),
                Value<int?> dispatchExpiresAt = const Value.absent(),
                Value<String?> failureCode = const Value.absent(),
                Value<int?> failureRemaining = const Value.absent(),
                Value<String?> resultJson = const Value.absent(),
              }) => CommandRowsCompanion(
                sequence: sequence,
                userId: userId,
                commandId: commandId,
                commandJson: commandJson,
                resourceKey: resourceKey,
                state: state,
                revision: revision,
                attempts: attempts,
                nextAttemptAt: nextAttemptAt,
                updatedAt: updatedAt,
                rowGeneration: rowGeneration,
                dispatchToken: dispatchToken,
                dispatchGeneration: dispatchGeneration,
                dispatchExpiresAt: dispatchExpiresAt,
                failureCode: failureCode,
                failureRemaining: failureRemaining,
                resultJson: resultJson,
              ),
          createCompanionCallback:
              ({
                Value<int> sequence = const Value.absent(),
                required String userId,
                required String commandId,
                required String commandJson,
                required String resourceKey,
                required String state,
                required int revision,
                required int attempts,
                required int nextAttemptAt,
                required int updatedAt,
                Value<int> rowGeneration = const Value.absent(),
                Value<String?> dispatchToken = const Value.absent(),
                Value<int?> dispatchGeneration = const Value.absent(),
                Value<int?> dispatchExpiresAt = const Value.absent(),
                Value<String?> failureCode = const Value.absent(),
                Value<int?> failureRemaining = const Value.absent(),
                Value<String?> resultJson = const Value.absent(),
              }) => CommandRowsCompanion.insert(
                sequence: sequence,
                userId: userId,
                commandId: commandId,
                commandJson: commandJson,
                resourceKey: resourceKey,
                state: state,
                revision: revision,
                attempts: attempts,
                nextAttemptAt: nextAttemptAt,
                updatedAt: updatedAt,
                rowGeneration: rowGeneration,
                dispatchToken: dispatchToken,
                dispatchGeneration: dispatchGeneration,
                dispatchExpiresAt: dispatchExpiresAt,
                failureCode: failureCode,
                failureRemaining: failureRemaining,
                resultJson: resultJson,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CommandRowsTable, StoredCommand>(table),
                  BaseReferences<
                    _$OutboxDatabase,
                    $CommandRowsTable,
                    StoredCommand
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CommandRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$OutboxDatabase,
      $CommandRowsTable,
      StoredCommand,
      $$CommandRowsTableFilterComposer,
      $$CommandRowsTableOrderingComposer,
      $$CommandRowsTableAnnotationComposer,
      $$CommandRowsTableCreateCompanionBuilder,
      $$CommandRowsTableUpdateCompanionBuilder,
      (
        StoredCommand,
        BaseReferences<_$OutboxDatabase, $CommandRowsTable, StoredCommand>,
      ),
      StoredCommand,
      PrefetchHooks Function()
    >;
typedef $$OutboxScopesTableCreateCompanionBuilder =
    OutboxScopesCompanion Function({
      Value<int> id,
      required String userId,
      required String environmentKey,
      Value<int> dispatchGeneration,
      Value<String?> dispatchToken,
      Value<int?> dispatchExpiresAt,
      Value<int?> clockSeenAt,
    });
typedef $$OutboxScopesTableUpdateCompanionBuilder =
    OutboxScopesCompanion Function({
      Value<int> id,
      Value<String> userId,
      Value<String> environmentKey,
      Value<int> dispatchGeneration,
      Value<String?> dispatchToken,
      Value<int?> dispatchExpiresAt,
      Value<int?> clockSeenAt,
    });

class $$OutboxScopesTableFilterComposer
    extends Composer<_$OutboxDatabase, $OutboxScopesTable> {
  $$OutboxScopesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get environmentKey => $composableBuilder(
    column: $table.environmentKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get clockSeenAt => $composableBuilder(
    column: $table.clockSeenAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$OutboxScopesTableOrderingComposer
    extends Composer<_$OutboxDatabase, $OutboxScopesTable> {
  $$OutboxScopesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get environmentKey => $composableBuilder(
    column: $table.environmentKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get clockSeenAt => $composableBuilder(
    column: $table.clockSeenAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$OutboxScopesTableAnnotationComposer
    extends Composer<_$OutboxDatabase, $OutboxScopesTable> {
  $$OutboxScopesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get environmentKey => $composableBuilder(
    column: $table.environmentKey,
    builder: (column) => column,
  );

  GeneratedColumn<int> get dispatchGeneration => $composableBuilder(
    column: $table.dispatchGeneration,
    builder: (column) => column,
  );

  GeneratedColumn<String> get dispatchToken => $composableBuilder(
    column: $table.dispatchToken,
    builder: (column) => column,
  );

  GeneratedColumn<int> get dispatchExpiresAt => $composableBuilder(
    column: $table.dispatchExpiresAt,
    builder: (column) => column,
  );

  GeneratedColumn<int> get clockSeenAt => $composableBuilder(
    column: $table.clockSeenAt,
    builder: (column) => column,
  );
}

class $$OutboxScopesTableTableManager
    extends
        RootTableManager<
          _$OutboxDatabase,
          $OutboxScopesTable,
          StoredScope,
          $$OutboxScopesTableFilterComposer,
          $$OutboxScopesTableOrderingComposer,
          $$OutboxScopesTableAnnotationComposer,
          $$OutboxScopesTableCreateCompanionBuilder,
          $$OutboxScopesTableUpdateCompanionBuilder,
          (
            StoredScope,
            BaseReferences<_$OutboxDatabase, $OutboxScopesTable, StoredScope>,
          ),
          StoredScope,
          PrefetchHooks Function()
        > {
  $$OutboxScopesTableTableManager(_$OutboxDatabase db, $OutboxScopesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$OutboxScopesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$OutboxScopesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$OutboxScopesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> environmentKey = const Value.absent(),
                Value<int> dispatchGeneration = const Value.absent(),
                Value<String?> dispatchToken = const Value.absent(),
                Value<int?> dispatchExpiresAt = const Value.absent(),
                Value<int?> clockSeenAt = const Value.absent(),
              }) => OutboxScopesCompanion(
                id: id,
                userId: userId,
                environmentKey: environmentKey,
                dispatchGeneration: dispatchGeneration,
                dispatchToken: dispatchToken,
                dispatchExpiresAt: dispatchExpiresAt,
                clockSeenAt: clockSeenAt,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String userId,
                required String environmentKey,
                Value<int> dispatchGeneration = const Value.absent(),
                Value<String?> dispatchToken = const Value.absent(),
                Value<int?> dispatchExpiresAt = const Value.absent(),
                Value<int?> clockSeenAt = const Value.absent(),
              }) => OutboxScopesCompanion.insert(
                id: id,
                userId: userId,
                environmentKey: environmentKey,
                dispatchGeneration: dispatchGeneration,
                dispatchToken: dispatchToken,
                dispatchExpiresAt: dispatchExpiresAt,
                clockSeenAt: clockSeenAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$OutboxScopesTable, StoredScope>(table),
                  BaseReferences<
                    _$OutboxDatabase,
                    $OutboxScopesTable,
                    StoredScope
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$OutboxScopesTableProcessedTableManager =
    ProcessedTableManager<
      _$OutboxDatabase,
      $OutboxScopesTable,
      StoredScope,
      $$OutboxScopesTableFilterComposer,
      $$OutboxScopesTableOrderingComposer,
      $$OutboxScopesTableAnnotationComposer,
      $$OutboxScopesTableCreateCompanionBuilder,
      $$OutboxScopesTableUpdateCompanionBuilder,
      (
        StoredScope,
        BaseReferences<_$OutboxDatabase, $OutboxScopesTable, StoredScope>,
      ),
      StoredScope,
      PrefetchHooks Function()
    >;

class $OutboxDatabaseManager {
  final _$OutboxDatabase _db;
  $OutboxDatabaseManager(this._db);
  $$CommandRowsTableTableManager get commandRows =>
      $$CommandRowsTableTableManager(_db, _db.commandRows);
  $$OutboxScopesTableTableManager get outboxScopes =>
      $$OutboxScopesTableTableManager(_db, _db.outboxScopes);
}
