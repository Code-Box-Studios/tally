// Inspect only the diagnostics representation returned by the owned QA bridge.
// Never put the offending contents into an error or a persisted report.
export function inspectConsoleDiagnostics(listing, {details = [], forbiddenValues = [], page = 0, pageSize = null} = {}) {
  const pagination = listing.match(/Showing (\d+)-(\d+) of (\d+) \(Page (\d+) of (\d+)\)\./);
  const rows = [...listing.matchAll(/^msgid=(\d+)\s+\[[^\]]+\]/gm)];
  const empty = /(?:^|\n)## Console messages\r?\n<no console messages found>(?:\r?\n|$)/.test(listing) && !/^msgid=/m.test(listing);
  const total = empty ? 0 : Number(pagination?.[3]);
  const size = pageSize ?? total;
  const start = page * size + 1, end = Math.min((page + 1) * size, total);
  if ((!empty && (!pagination || Number(pagination[1]) !== start || Number(pagination[2]) !== end || rows.length !== end - start + 1 || Number(pagination[4]) !== page + 1 || Number(pagination[5]) !== Math.ceil(total / size) || total > 1000)) || [listing, ...details].some(text => text.includes('(truncated,'))) {
    throw Error('Incomplete browser console diagnostics.');
  }
  const text = [listing, ...details].join('\n');
  const privateMarkers = /\b(?:idToken|refreshToken|accessToken|fcmToken|password|authorization|amountMinor|remainingMinor|totalPaidMinor)["']?\s*[:=]|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bqa-sync-[^\s"'<>]*@example\.test\b|Offline sync verification|Pending layout verification|offline-receipt-failure\.png/i;
  if (privateMarkers.test(text) || forbiddenValues.some(value => typeof value === 'string' && value.length >= 8 && text.includes(value))) {
    throw Error('Private data appeared in browser console diagnostics.');
  }
  if (/Unhandled (?:exception|error)|RenderFlex overflowed|EXCEPTION CAUGHT BY (?:WIDGETS|RENDERING)|DartError/i.test(text)) {
    throw Error('Flutter runtime error appeared in browser console diagnostics.');
  }
  const result = {messageCount: rows.length, detailIds: rows.map(row => row[1])};
  return pageSize === null ? result : {...result, totalMessages: total, nextPage: end < total ? page + 1 : null};
}
