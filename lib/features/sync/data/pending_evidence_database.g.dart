// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pending_evidence_database.dart';

// ignore_for_file: type=lint
class $EvidenceRowsTable extends EvidenceRows
    with TableInfo<$EvidenceRowsTable, EvidenceRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $EvidenceRowsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _metadataJsonMeta = const VerificationMeta(
    'metadataJson',
  );
  @override
  late final GeneratedColumn<String> metadataJson = GeneratedColumn<String>(
    'metadata_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [commandId, userId, metadataJson];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'evidence_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<EvidenceRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('command_id')) {
      context.handle(
        _commandIdMeta,
        commandId.isAcceptableOrUnknown(data['command_id']!, _commandIdMeta),
      );
    } else if (isInserting) {
      context.missing(_commandIdMeta);
    }
    if (data.containsKey('user_id')) {
      context.handle(
        _userIdMeta,
        userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta),
      );
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('metadata_json')) {
      context.handle(
        _metadataJsonMeta,
        metadataJson.isAcceptableOrUnknown(
          data['metadata_json']!,
          _metadataJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_metadataJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {commandId};
  @override
  EvidenceRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return EvidenceRow(
      commandId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}command_id'],
      )!,
      userId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}user_id'],
      )!,
      metadataJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}metadata_json'],
      )!,
    );
  }

  @override
  $EvidenceRowsTable createAlias(String alias) {
    return $EvidenceRowsTable(attachedDatabase, alias);
  }
}

class EvidenceRow extends DataClass implements Insertable<EvidenceRow> {
  final String commandId;
  final String userId;
  final String metadataJson;
  const EvidenceRow({
    required this.commandId,
    required this.userId,
    required this.metadataJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['command_id'] = Variable<String>(commandId);
    map['user_id'] = Variable<String>(userId);
    map['metadata_json'] = Variable<String>(metadataJson);
    return map;
  }

  EvidenceRowsCompanion toCompanion(bool nullToAbsent) {
    return EvidenceRowsCompanion(
      commandId: Value(commandId),
      userId: Value(userId),
      metadataJson: Value(metadataJson),
    );
  }

  factory EvidenceRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return EvidenceRow(
      commandId: serializer.fromJson<String>(json['commandId']),
      userId: serializer.fromJson<String>(json['userId']),
      metadataJson: serializer.fromJson<String>(json['metadataJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'commandId': serializer.toJson<String>(commandId),
      'userId': serializer.toJson<String>(userId),
      'metadataJson': serializer.toJson<String>(metadataJson),
    };
  }

  EvidenceRow copyWith({
    String? commandId,
    String? userId,
    String? metadataJson,
  }) => EvidenceRow(
    commandId: commandId ?? this.commandId,
    userId: userId ?? this.userId,
    metadataJson: metadataJson ?? this.metadataJson,
  );
  EvidenceRow copyWithCompanion(EvidenceRowsCompanion data) {
    return EvidenceRow(
      commandId: data.commandId.present ? data.commandId.value : this.commandId,
      userId: data.userId.present ? data.userId.value : this.userId,
      metadataJson: data.metadataJson.present
          ? data.metadataJson.value
          : this.metadataJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('EvidenceRow(')
          ..write('commandId: $commandId, ')
          ..write('userId: $userId, ')
          ..write('metadataJson: $metadataJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(commandId, userId, metadataJson);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is EvidenceRow &&
          other.commandId == this.commandId &&
          other.userId == this.userId &&
          other.metadataJson == this.metadataJson);
}

class EvidenceRowsCompanion extends UpdateCompanion<EvidenceRow> {
  final Value<String> commandId;
  final Value<String> userId;
  final Value<String> metadataJson;
  final Value<int> rowid;
  const EvidenceRowsCompanion({
    this.commandId = const Value.absent(),
    this.userId = const Value.absent(),
    this.metadataJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  EvidenceRowsCompanion.insert({
    required String commandId,
    required String userId,
    required String metadataJson,
    this.rowid = const Value.absent(),
  }) : commandId = Value(commandId),
       userId = Value(userId),
       metadataJson = Value(metadataJson);
  static Insertable<EvidenceRow> custom({
    Expression<String>? commandId,
    Expression<String>? userId,
    Expression<String>? metadataJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (commandId != null) 'command_id': commandId,
      if (userId != null) 'user_id': userId,
      if (metadataJson != null) 'metadata_json': metadataJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  EvidenceRowsCompanion copyWith({
    Value<String>? commandId,
    Value<String>? userId,
    Value<String>? metadataJson,
    Value<int>? rowid,
  }) {
    return EvidenceRowsCompanion(
      commandId: commandId ?? this.commandId,
      userId: userId ?? this.userId,
      metadataJson: metadataJson ?? this.metadataJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (commandId.present) {
      map['command_id'] = Variable<String>(commandId.value);
    }
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (metadataJson.present) {
      map['metadata_json'] = Variable<String>(metadataJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('EvidenceRowsCompanion(')
          ..write('commandId: $commandId, ')
          ..write('userId: $userId, ')
          ..write('metadataJson: $metadataJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $EvidenceScopesTable extends EvidenceScopes
    with TableInfo<$EvidenceScopesTable, EvidenceScope> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $EvidenceScopesTable(this.attachedDatabase, [this._alias]);
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
  @override
  List<GeneratedColumn> get $columns => [id, userId, environmentKey];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'evidence_scopes';
  @override
  VerificationContext validateIntegrity(
    Insertable<EvidenceScope> instance, {
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
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  EvidenceScope map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return EvidenceScope(
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
    );
  }

  @override
  $EvidenceScopesTable createAlias(String alias) {
    return $EvidenceScopesTable(attachedDatabase, alias);
  }
}

class EvidenceScope extends DataClass implements Insertable<EvidenceScope> {
  final int id;
  final String userId;
  final String environmentKey;
  const EvidenceScope({
    required this.id,
    required this.userId,
    required this.environmentKey,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['user_id'] = Variable<String>(userId);
    map['environment_key'] = Variable<String>(environmentKey);
    return map;
  }

  EvidenceScopesCompanion toCompanion(bool nullToAbsent) {
    return EvidenceScopesCompanion(
      id: Value(id),
      userId: Value(userId),
      environmentKey: Value(environmentKey),
    );
  }

  factory EvidenceScope.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return EvidenceScope(
      id: serializer.fromJson<int>(json['id']),
      userId: serializer.fromJson<String>(json['userId']),
      environmentKey: serializer.fromJson<String>(json['environmentKey']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'userId': serializer.toJson<String>(userId),
      'environmentKey': serializer.toJson<String>(environmentKey),
    };
  }

  EvidenceScope copyWith({int? id, String? userId, String? environmentKey}) =>
      EvidenceScope(
        id: id ?? this.id,
        userId: userId ?? this.userId,
        environmentKey: environmentKey ?? this.environmentKey,
      );
  EvidenceScope copyWithCompanion(EvidenceScopesCompanion data) {
    return EvidenceScope(
      id: data.id.present ? data.id.value : this.id,
      userId: data.userId.present ? data.userId.value : this.userId,
      environmentKey: data.environmentKey.present
          ? data.environmentKey.value
          : this.environmentKey,
    );
  }

  @override
  String toString() {
    return (StringBuffer('EvidenceScope(')
          ..write('id: $id, ')
          ..write('userId: $userId, ')
          ..write('environmentKey: $environmentKey')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, userId, environmentKey);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is EvidenceScope &&
          other.id == this.id &&
          other.userId == this.userId &&
          other.environmentKey == this.environmentKey);
}

class EvidenceScopesCompanion extends UpdateCompanion<EvidenceScope> {
  final Value<int> id;
  final Value<String> userId;
  final Value<String> environmentKey;
  const EvidenceScopesCompanion({
    this.id = const Value.absent(),
    this.userId = const Value.absent(),
    this.environmentKey = const Value.absent(),
  });
  EvidenceScopesCompanion.insert({
    this.id = const Value.absent(),
    required String userId,
    required String environmentKey,
  }) : userId = Value(userId),
       environmentKey = Value(environmentKey);
  static Insertable<EvidenceScope> custom({
    Expression<int>? id,
    Expression<String>? userId,
    Expression<String>? environmentKey,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (userId != null) 'user_id': userId,
      if (environmentKey != null) 'environment_key': environmentKey,
    });
  }

  EvidenceScopesCompanion copyWith({
    Value<int>? id,
    Value<String>? userId,
    Value<String>? environmentKey,
  }) {
    return EvidenceScopesCompanion(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      environmentKey: environmentKey ?? this.environmentKey,
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
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('EvidenceScopesCompanion(')
          ..write('id: $id, ')
          ..write('userId: $userId, ')
          ..write('environmentKey: $environmentKey')
          ..write(')'))
        .toString();
  }
}

abstract class _$PendingEvidenceDatabase extends GeneratedDatabase {
  _$PendingEvidenceDatabase(QueryExecutor e) : super(e);
  $PendingEvidenceDatabaseManager get managers =>
      $PendingEvidenceDatabaseManager(this);
  late final $EvidenceRowsTable evidenceRows = $EvidenceRowsTable(this);
  late final $EvidenceScopesTable evidenceScopes = $EvidenceScopesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    evidenceRows,
    evidenceScopes,
  ];
}

typedef $$EvidenceRowsTableCreateCompanionBuilder =
    EvidenceRowsCompanion Function({
      required String commandId,
      required String userId,
      required String metadataJson,
      Value<int> rowid,
    });
typedef $$EvidenceRowsTableUpdateCompanionBuilder =
    EvidenceRowsCompanion Function({
      Value<String> commandId,
      Value<String> userId,
      Value<String> metadataJson,
      Value<int> rowid,
    });

class $$EvidenceRowsTableFilterComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceRowsTable> {
  $$EvidenceRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get metadataJson => $composableBuilder(
    column: $table.metadataJson,
    builder: (column) => ColumnFilters(column),
  );
}

class $$EvidenceRowsTableOrderingComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceRowsTable> {
  $$EvidenceRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get commandId => $composableBuilder(
    column: $table.commandId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get userId => $composableBuilder(
    column: $table.userId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get metadataJson => $composableBuilder(
    column: $table.metadataJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$EvidenceRowsTableAnnotationComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceRowsTable> {
  $$EvidenceRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get commandId =>
      $composableBuilder(column: $table.commandId, builder: (column) => column);

  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get metadataJson => $composableBuilder(
    column: $table.metadataJson,
    builder: (column) => column,
  );
}

class $$EvidenceRowsTableTableManager
    extends
        RootTableManager<
          _$PendingEvidenceDatabase,
          $EvidenceRowsTable,
          EvidenceRow,
          $$EvidenceRowsTableFilterComposer,
          $$EvidenceRowsTableOrderingComposer,
          $$EvidenceRowsTableAnnotationComposer,
          $$EvidenceRowsTableCreateCompanionBuilder,
          $$EvidenceRowsTableUpdateCompanionBuilder,
          (
            EvidenceRow,
            BaseReferences<
              _$PendingEvidenceDatabase,
              $EvidenceRowsTable,
              EvidenceRow
            >,
          ),
          EvidenceRow,
          PrefetchHooks Function()
        > {
  $$EvidenceRowsTableTableManager(
    _$PendingEvidenceDatabase db,
    $EvidenceRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$EvidenceRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$EvidenceRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$EvidenceRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> commandId = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> metadataJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => EvidenceRowsCompanion(
                commandId: commandId,
                userId: userId,
                metadataJson: metadataJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String commandId,
                required String userId,
                required String metadataJson,
                Value<int> rowid = const Value.absent(),
              }) => EvidenceRowsCompanion.insert(
                commandId: commandId,
                userId: userId,
                metadataJson: metadataJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$EvidenceRowsTable, EvidenceRow>(table),
                  BaseReferences<
                    _$PendingEvidenceDatabase,
                    $EvidenceRowsTable,
                    EvidenceRow
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$EvidenceRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PendingEvidenceDatabase,
      $EvidenceRowsTable,
      EvidenceRow,
      $$EvidenceRowsTableFilterComposer,
      $$EvidenceRowsTableOrderingComposer,
      $$EvidenceRowsTableAnnotationComposer,
      $$EvidenceRowsTableCreateCompanionBuilder,
      $$EvidenceRowsTableUpdateCompanionBuilder,
      (
        EvidenceRow,
        BaseReferences<
          _$PendingEvidenceDatabase,
          $EvidenceRowsTable,
          EvidenceRow
        >,
      ),
      EvidenceRow,
      PrefetchHooks Function()
    >;
typedef $$EvidenceScopesTableCreateCompanionBuilder =
    EvidenceScopesCompanion Function({
      Value<int> id,
      required String userId,
      required String environmentKey,
    });
typedef $$EvidenceScopesTableUpdateCompanionBuilder =
    EvidenceScopesCompanion Function({
      Value<int> id,
      Value<String> userId,
      Value<String> environmentKey,
    });

class $$EvidenceScopesTableFilterComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceScopesTable> {
  $$EvidenceScopesTableFilterComposer({
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
}

class $$EvidenceScopesTableOrderingComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceScopesTable> {
  $$EvidenceScopesTableOrderingComposer({
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
}

class $$EvidenceScopesTableAnnotationComposer
    extends Composer<_$PendingEvidenceDatabase, $EvidenceScopesTable> {
  $$EvidenceScopesTableAnnotationComposer({
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
}

class $$EvidenceScopesTableTableManager
    extends
        RootTableManager<
          _$PendingEvidenceDatabase,
          $EvidenceScopesTable,
          EvidenceScope,
          $$EvidenceScopesTableFilterComposer,
          $$EvidenceScopesTableOrderingComposer,
          $$EvidenceScopesTableAnnotationComposer,
          $$EvidenceScopesTableCreateCompanionBuilder,
          $$EvidenceScopesTableUpdateCompanionBuilder,
          (
            EvidenceScope,
            BaseReferences<
              _$PendingEvidenceDatabase,
              $EvidenceScopesTable,
              EvidenceScope
            >,
          ),
          EvidenceScope,
          PrefetchHooks Function()
        > {
  $$EvidenceScopesTableTableManager(
    _$PendingEvidenceDatabase db,
    $EvidenceScopesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$EvidenceScopesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$EvidenceScopesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$EvidenceScopesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> userId = const Value.absent(),
                Value<String> environmentKey = const Value.absent(),
              }) => EvidenceScopesCompanion(
                id: id,
                userId: userId,
                environmentKey: environmentKey,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String userId,
                required String environmentKey,
              }) => EvidenceScopesCompanion.insert(
                id: id,
                userId: userId,
                environmentKey: environmentKey,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$EvidenceScopesTable, EvidenceScope>(table),
                  BaseReferences<
                    _$PendingEvidenceDatabase,
                    $EvidenceScopesTable,
                    EvidenceScope
                  >(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$EvidenceScopesTableProcessedTableManager =
    ProcessedTableManager<
      _$PendingEvidenceDatabase,
      $EvidenceScopesTable,
      EvidenceScope,
      $$EvidenceScopesTableFilterComposer,
      $$EvidenceScopesTableOrderingComposer,
      $$EvidenceScopesTableAnnotationComposer,
      $$EvidenceScopesTableCreateCompanionBuilder,
      $$EvidenceScopesTableUpdateCompanionBuilder,
      (
        EvidenceScope,
        BaseReferences<
          _$PendingEvidenceDatabase,
          $EvidenceScopesTable,
          EvidenceScope
        >,
      ),
      EvidenceScope,
      PrefetchHooks Function()
    >;

class $PendingEvidenceDatabaseManager {
  final _$PendingEvidenceDatabase _db;
  $PendingEvidenceDatabaseManager(this._db);
  $$EvidenceRowsTableTableManager get evidenceRows =>
      $$EvidenceRowsTableTableManager(_db, _db.evidenceRows);
  $$EvidenceScopesTableTableManager get evidenceScopes =>
      $$EvidenceScopesTableTableManager(_db, _db.evidenceScopes);
}
