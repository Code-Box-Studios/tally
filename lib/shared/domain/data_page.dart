abstract interface class PageCursor {}

final class DataPage<T> {
  DataPage({
    required Iterable<T> items,
    required this.nextCursor,
    required this.hasMore,
    required this.isFromCache,
  }) : items = List.unmodifiable(items);
  final List<T> items;
  final PageCursor? nextCursor;
  final bool hasMore;
  final bool isFromCache;
}
