export async function saveFile(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  check: () => void,
) {
  check();
  const blob = new Blob([bytes.slice().buffer], { type: mime });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    check();
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
