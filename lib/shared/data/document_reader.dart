import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/dates/local_date.dart';
import '../../core/dates/timezone_catalog.dart';
import '../../core/errors/app_failure.dart';
import '../../core/identifiers/entity_ids.dart';
import '../../core/money/currency_code.dart';
import '../../core/money/money.dart';

final class DocumentReader {
  DocumentReader(this.data);
  final Map<String, Object?> data;
  static AppFailure invalid() => AppFailure(
    AppFailureCode.unavailable,
    messageKey: 'data.unsupportedOrInvalid',
  );
  Object? value(String key) {
    if (!data.containsKey(key)) throw invalid();
    return data[key];
  }

  void owner(OwnerUid owner) {
    if (value('userId') != owner.value || value('schemaVersion') != 1) {
      throw invalid();
    }
    dateTime('createdAt');
    dateTime('updatedAt');
  }

  void storedId(String key, String id) {
    if (value(key) != id) throw invalid();
  }

  String text(String key, {int max = 4000, bool required = false}) {
    final raw = value(key);
    if (raw is! String ||
        raw.length > max ||
        (required && raw.trim().isEmpty)) {
      throw invalid();
    }
    return raw;
  }

  String? nullableText(String key, {int max = 4000}) {
    if (value(key) == null) return null;
    return text(key, max: max);
  }

  int integer(String key, {int min = 0, int max = 9007199254740991}) {
    final raw = value(key);
    if (raw is! int || raw < min || raw > max) throw invalid();
    return raw;
  }

  int revision() => integer('revision', min: 1);
  bool boolean(String key) {
    final raw = value(key);
    if (raw is! bool) throw invalid();
    return raw;
  }

  T enumeration<T extends Enum>(String key, List<T> values) {
    final raw = text(key, max: 100);
    for (final item in values) {
      if (item.name == raw) return item;
    }
    throw invalid();
  }

  LocalDate date(String key) {
    try {
      return LocalDate.parse(text(key, max: 10));
    } catch (_) {
      throw invalid();
    }
  }

  LocalDate? nullableDate(String key) => value(key) == null ? null : date(key);
  DateTime dateTime(String key) {
    final raw = value(key);
    if (raw is Timestamp) return raw.toDate().toUtc();
    if (raw is DateTime) return raw.toUtc();
    throw invalid();
  }

  String timezone(String key) {
    final zone = text(key, max: 100);
    if (!TimezoneCatalog.contains(zone)) throw invalid();
    return zone;
  }

  Money money(String key, CurrencyCode currency, {bool positive = false}) =>
      Money.fromMinorUnits(
        integer(key, min: positive ? 1 : 0, max: 1000000000000),
        currency,
      );
  Money? nullableMoney(
    String key,
    CurrencyCode currency, {
    bool positive = false,
  }) => value(key) == null ? null : money(key, currency, positive: positive);
  DocumentReader object(String key) {
    final raw = value(key);
    if (raw is! Map || raw.keys.any((key) => key is! String)) throw invalid();
    return DocumentReader(Map<String, Object?>.from(raw));
  }

  DocumentReader? nullableObject(String key) =>
      value(key) == null ? null : object(key);
  List<DocumentReader> objects(String key, {int min = 0, int max = 200}) {
    final raw = value(key);
    if (raw is! List || raw.length < min || raw.length > max) throw invalid();
    return [
      for (final item in raw)
        if (item is Map && item.keys.every((key) => key is String))
          DocumentReader(Map<String, Object?>.from(item))
        else
          throw invalid(),
    ];
  }
}
