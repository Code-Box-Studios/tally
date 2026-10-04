# Upcoming obligations independent review

One fresh, read-only review assessed `1b9b2a5..4db40f4` on `main`. The reviewer found no Critical issues, two Important issues and one Minor. The implementer regraded the findings by user impact and retained those grades. No second review was commissioned.

## Important fixes

1. Canonical `aggregateRepaired` records contain a currency but no transaction amount, and a fully paid cancellation contains a zero remaining amount. Both previously rejected the entire activity page. Compatibility now accepts absent repair amounts and nonnegative repair/cancellation amounts, validates any supplied currency, and retains positive payment validation. Decoder, repository and Activity rendering regressions failed before the fix and passed after it; no immutable history was rewritten.
2. Due-list query identity previously included the complete clock instant, replacing first-page subscriptions and discarding continuation rows every minute. Identity now uses the civil-day context across all supported saved zones, with one bounded clock-instant cache. The real widget regression loads a second page, advances one minute without another read or lost rows, then crosses Kiritimati midnight while UTC/Manila remain on the same day and checks deliberate reclassification. Both identity and paging regressions failed before the fix and passed after it.

Final verification passed clean Flutter analysis, 218 Flutter tests, 45 Functions unit tests and 32 actual emulator/rules tests. Browser hot reload succeeded and the connected Dart runtime reported no errors. Automated tests do not certify native releases.

## Rulings on the review boundary

- M4 recurrence/automatic processing and prompt projection dispatch remain required before launch. M3's disclosed five-minute worker is an intermediate implementation. Cost if wrong: financial feedback or scheduled events can be delayed or absent.
- M5 calendar/reminder delivery/comprehensive search and filters remain required before launch; navigation alone does not establish working features. Cost if wrong: users cannot find or receive upcoming-payment information.
- M6 private attachments and durable offline/restart recovery remain required before launch. Session-retained uncertain retries are not a durable outbox. Cost if wrong: restarting can lose an unacknowledged intent.
- M7 native-device/accessibility/performance/operations validation remains required before launch; the earlier mobile image is explicitly not a final design proof. Cost if wrong: a platform or accessibility failure remains undiscovered.
- M8 actual backend/web deployment remains required after the pending billing/region inputs. Emulator results are not evidence of a live backend. Cost if wrong: the public URL continues serving a preview.
- Cold detail reload arriving at Home remains an unresolved browser observation, scheduled for routing diagnosis before release; persistence was verified, route preservation was not. Cost if wrong: bookmarked obligations open the wrong screen. The reviewer did not establish a cause in the unchanged router code.
- Future recurrence/event schemas require their own M4 contract tests. This review establishes only the explicit M3 contracts. Cost if wrong: new canonical events can again be rejected by an old reader.

## Deferred Minor

Home metric drilldowns currently discard the selected currency/actionable filter. Individual records retain native currency labels, so no mixed-currency sum is introduced. Carry those filters into the paged obligation list in M5.

## Review tooling

The reviewer reported 29 graft calls and **at least** 291,984 estimated tokens saved; an early truncated result prevents an exact reviewer total. This is separate from the implementer's recorded tally.
