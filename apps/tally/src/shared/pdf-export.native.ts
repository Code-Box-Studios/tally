import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export async function exportHtmlPdf(
  title: string,
  prepareHtml: () => string | Promise<string>,
  check: () => void,
): Promise<void> {
  check();
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("PDF sharing is unavailable on this device.");
  check();
  const html = await prepareHtml();
  check();
  const result = await Print.printToFileAsync({ html });
  const file = new File(result.uri);
  try {
    check();
    await Sharing.shareAsync(result.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: title,
    });
  } finally {
    if (file.exists) file.delete();
  }
}
