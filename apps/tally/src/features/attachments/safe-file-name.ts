/** A display filename must never become a path in the native cache directory. */
export function safeFileName(value: string) {
  const name = (value.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f]/g, "_")
    .slice(0, 120)
    .trim();
  return !name || name === "." || name === ".." ? "attachment" : name;
}
