/** Canonical JSON keeps command identity independent of object key order. */
export function canonicalCommand(value: unknown): string {
  const order = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(order);
    if (item !== null && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b, "en"))
          .map(([key, value]) => [key, order(value)]),
      );
    return item;
  };
  return JSON.stringify(order(value));
}
