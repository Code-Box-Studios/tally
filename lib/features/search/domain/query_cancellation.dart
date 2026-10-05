final class QueryCancelled implements Exception {
  const QueryCancelled();
  @override
  String toString() => 'This search was cancelled.';
}

final class QueryCancellation {
  bool _cancelled = false;
  bool get isCancelled => _cancelled;
  void cancel() => _cancelled = true;
  void check() {
    if (_cancelled) throw const QueryCancelled();
  }
}
