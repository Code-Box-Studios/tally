import type { AccountStatement } from "./statement";
import { statementHtml } from "./statement-html";
import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export async function exportStatementPdf(
  statement: AccountStatement,
  check: () => void,
): Promise<void> {
  check();
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("PDF sharing is unavailable on this device.");
  check();
  const result = await Print.printToFileAsync({
    html: statementHtml(statement),
  });
  const file = new File(result.uri);
  try {
    check();
    await Sharing.shareAsync(result.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Save Tally statement of account",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
