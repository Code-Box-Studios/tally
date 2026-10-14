/** Reserve the window during the tap, before any asynchronous financial validation. */
export async function exportHtmlPdf(
  _title: string,
  prepareHtml: () => string | Promise<string>,
  check: () => void,
): Promise<void> {
  check();
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error(
      "Allow pop-ups for Tally, then export again. Choose Save as PDF in the print dialog.",
    );
  try {
    popup.opener = null;
    const html = await prepareHtml();
    check();
    if (popup.closed)
      throw new Error("The PDF window was closed. Export again to reopen it.");
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    check();
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  }
}
