# Tally calendar and searchable obligations

This is M5a of the authorized Tally MVP. M5b subsequently implements reminder
preferences, the inbox, trusted reminder delivery, and device/local notification
adapters. This split leaves two independently testable subsystems; it does not
remove any launch requirement. The original product specification, financial
engine, Firebase architecture, experience document, and Lavish design remain
binding. Work stays on `main` and preserves the user-owned `.ignore`.

## User experience

Calendar shows actual recorded due instances, including paid periods. On desktop,
a month grid sits beside the selected day's agenda. Tablet/mobile use a compact
month selector and date agenda; a month grid remains available when it fits.
Previous/next month, Today, selected day, visible filters, and clear-reset actions
are keyboard accessible. Each agenda row names its section, due date, currency,
amount or Amount needed, remaining balance, payment behavior and status. Opening
a row routes to its private obligation; recurring actions reference that exact
period. Unknown amounts retain their estimate as informational text.

Month membership uses the stored civil `dueDate`; it never converts that label
through UTC. Today navigation uses the profile timezone; overdue classification
uses each instance's saved timezone. Paid, skipped, and cancelled records keep
their historical labels and do not become overdue. A selected date at the start
or end of the supported 1900–2199 range cannot overflow month navigation.

Filters support section (I Owe, Owed to Me, Monthly Dues), status, date range,
currency, contact, category, payment source, exact payment mode or both automatic
modes, and amount range. Amount bounds compare the original bill/principal,
never an estimate, and require one currency. Partial payment is distinct from
pending, paid and overdue; an overdue partial may match either its payment-state
or overdue filter. Pending means outstanding, including unknown variable bills.
Finite parent due filtering uses its next outstanding due date, with its original
due date as the historical fallback when settled.

Obligations retains the familiar three tabs and original visual styling. Search
matches case-insensitive text in title, description, notes, and saved contact,
organization and category labels. Whitespace is normalized; an empty query is
the normal filtered list. There is no claim of linguistic stemming or arbitrary
Firestore text indexing. Search starts after 300ms debounce or explicit submit,
shows scanned-candidate progress, and can be reset/cancelled. Changing criteria
or signing out discards old results and pending completions.

Monthly Dues offers Bills and Billing periods views. Bills shows templates and
lifecycle/fee filters. Due-date or payment-status filtering uses Billing periods,
because a template has no lifetime balance or canonical due date. This prevents
the generation cursor from masquerading as the next payment. Calendar can also
search period description/notes/contact/category snapshots. Existing Home money
tiles preserve their selected currency when navigating to Obligations.

## Query and ownership contracts

Queries remain under `users/{uid}` with ownership enforced by Rules. A planner
chooses one equality index in this priority: contact, category, source, currency,
section, exact payment mode. Other predicates are evaluated on every candidate
page, including later pages. Obligations also requires archived=false and sorts
createdAt DESC; period queries sort dueDate ASC and constrain the chosen civil
range. Both automatic modes use a residual predicate to avoid a second IN query.
Overdue is evaluated from the injected current instant, never a stale stored
overdue flag.

Normal result pages contain at most50 matches. A request fetches at most five
candidate pages of50 (250 records) and retains surplus matches in its opaque
continuation cursor. A sparse result can return fewer matches with hasMore=true;
the interface says More records to search instead of implying an empty result
set. Explicit Load more continues without a total-result cap. Cached pages are
labelled Cached records; a cache-only empty page never establishes server
completeness and never starts an unbounded automatic scan. Cursor state binds
owner, full criteria, primary query, and saved-zone civil-day classification;
using it with another owner/filter/day fails before any read.

Search reads canonical records and existing snapshots. It adds no external
search service, paid Firestore Enterprise requirement, or duplicate financial
database. Contact/category pickers use their existing current records and filter
by stable IDs; free text reflects the label saved/displayed on the obligation.
Renamed contacts therefore remain searchable by their historical displayed label
and by choosing the current contact in the filter.

Actual composite indexes are recorded before implementation:

| Collection | Equality prefix | Ordering |
| --- | --- | --- |
| obligations | archived; one of section/contactId/categoryId/paymentSourceId/currency/paymentMode | createdAt DESC |
| obligationInstances | one of section/contactId/categoryId/paymentSourceId/currency/paymentMode | dueDate ASC |
| payments | obligationId, obligationInstanceId | paymentDate DESC, createdAt DESC |

An unfiltered calendar uses the single dueDate index. The existing document-ID
tie-breaker stays in the gateway. No Cartesian combination of secondary-filter
indexes is generated. Unnecessary snapshot/notes indexes stay disabled.

## Domain and repository boundaries

`FinancialFilter` is immutable and strongly typed: section, status, currency,
contact/category/source IDs, exact mode or automaticOnly, minimum/maximum minor
units, first/last civil dates, optional bill lifecycle and normalized text. Invalid ranges, conflicting
automatic/exact modes, mixed amount currencies and oversized text are rejected.
It exposes instance/finite-or-template predicates; `PeriodQuery` adds UTC now
and arbitrary optional date bounds for period search. `CalendarQuery` adds a
required YearMonth and exposes its intersected PeriodQuery. Month intersection is calculated with calendar arithmetic.
Query equality includes only the current civil-day classification context, so a
minute tick does not reset pagination unless some supported saved zone changed
day. Match calculations use existing integer Money and the pinned timezone
catalog, never host timezone or floating point amounts.

`QueryPage<T>` carries `DataPage<T> records`, scannedCandidates and budgetReached.
`SearchRepository` exposes watch/get obligations and watch/get periods by PeriodQuery, using the
same planner and bounded cursor mechanism. Owner-scoped providers reset on UID
switch and cancel stale search completions. UI widgets call repositories/actions;
no Firebase SDK access is added to widgets.

Selected-period payment history gets a dedicated owner/parent/period query,
including immutable payments, reversals and replacements. It no longer requires
loading unrelated months. Existing whole-obligation history and finite installment
allocation behavior remain compatible.

## Validation and acceptance evidence

Domain tests independently pin Manila/Los Angeles midnight classification,
month/year/leap boundaries, paid/partial/overdue/unknown bills, every filter,
PHP/USD/JPY isolation, source/contact/category labels, impossible ranges and
template-versus-period semantics. Repository tests exercise real mapping and the
query boundary: empty first page with a later match;250 scanned with no match
and an actionable continuation; surplus-match buffering; cross-owner/filter/day
cursors; cached incompleteness; no read after cancellation/owner switch. A1,000
record fixture must reach a match beyond the first250 without silently truncating
the result set and must keep one candidate fetch in flight.

Widget tests cover month/day navigation, all filter controls, search debounce and
reset, delayed old-query completions, currency-preserving Home routes, dedicated
period history, descriptive empty/cache/progress states,320/375/800/1440 widths,
200% text, keyboard focus, and both themes. Actual synthetic demo-emulator browser
flows verify fixed/variable, paid/partial/overdue and mixed-currency agendas plus
account switching. Actual emulator queries and Rules denials verify query shapes;
deployed index readiness remains a required staging/M8 check.

Run clean Flutter analysis, the complete Dart/Flutter suite, Functions checks,
and both fresh Firebase emulator suites at each task's completion. Hot reload
and runtime-error inspection follow Dart changes. One fresh whole-M5a review then
one Important/Critical TDD fix pass follows the established inline workflow.
Native push/APNs/service-worker delivery is M5b plus real staging provisioning;
calendar/search success is not a production-launch claim.
