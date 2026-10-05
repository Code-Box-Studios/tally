# Calendar and search verification

Verified on 2026-10-05 against the local `demo-tally` Authentication, Firestore
and Functions emulators. The hosted preview remains unchanged. This evidence
does not establish a production deployment or notification delivery.

The calendar uses each stored civil due date to choose its month. Today uses
the profile timezone; overdue classification uses the saved obligation timezone.
Desktop has a month grid beside the agenda. Narrow screens and enlarged text
use an agenda with an accessible date picker. Counts describe loaded records
until the query finishes; unknown bill estimates are explicitly informational.

Search covers saved titles, descriptions, notes, contact and category labels.
Each request checks at most 250 candidates, returns at most 50 matches and
retains surplus matches in an owner/criteria/civil-context bound cursor. Load
more can continue through the complete collection. Cached empty results do
not claim completeness. Reset, a new first snapshot or an owner change cancels
continuation work after its current read and discards the old completion.

Monthly Dues separates bill settings from billing periods. Payment/date filters
apply to actual periods; lifecycle filters apply to templates. A selected
recurring period is read directly and checked against its parent before its
independent payment query displays history. Finite installment history keeps
its existing allocation-aware behavior.

Automated evidence includes 388 passing Flutter tests, including 41 added
calendar/search screen cases, and 77 passing Functions tests. The focused
calendar/search suite has 95 passing domain, query, scope and widget tests.
The fresh emulator gate passed one normal prompt-worker test and 71 deterministic
financial/security tests. Relevant
cases include all filter controls, JPY decimal rejection, amount/date bounds,
currency separation, multi-codepoint input limits, sparse continuation beyond
250 and 1,000 records, surplus buffering, concurrent first-page replacement,
owner cancellation, cache incompleteness, saved-zone midnight/month boundaries,
calendar limits, exact-period original/reversal/replacement history and
archived/inactive stable-ID history pickers, currency on unknown bills without
estimates, cancelling uncommitted searches on reset, currency-preserving Home
links and returning from detail to the list by reselecting
Obligations while preserving an already-open list currency. Layouts were tested at 320, 375, 800 and 1440
pixels with 200% text, an open keyboard, and light/dark calendar rendering.
The synthetic 1,000-record boundary fixture found its later match after 20
fetches with one in flight; its measured time is not a production latency claim.

The real Flutter web browser flow verified:

- PHP borrowing and USD lending remain separate; the USD calendar filter returns
  only the USD loan. Searching John matches the saved contact on both loans.
- A manual Internet payment of ₱200 leaves ₱1,499 in October. November remains
  a separate ₱1,699 period.
- Netflix confirmation records ₱549 and displays a paid period with its history.
  A failed expected deduction stays outstanding and offers a manual retry.
- Electricity displays Amount needed and a labeled ₱3,500 estimate. Rent displays
  its paid October period. November shows five independent future bill periods.
- Bills and Billing periods have distinct empty and populated views. Paid period
  filtering returns two paid periods; pausing and ending a bill retain its
  existing outstanding period.
- Sign-out after calendar, search, selected-period history and filters produced
  zero unhandled rejections. A second account's initial calendar was empty and
  contained none of the previous account's records. That account subsequently
  created independent synthetic fixtures.

Fixture creation used authenticated protected callables; automatic/generation
fixture preparation ran the real owner-specific job processors in manual demo
mode. Credentials stayed in browser memory. Browser checks inspect rendered
semantic labels as well as text because Flutter can expose labels without DOM
text content. Screenshots are genuine application captures, visually inspected
after their viewport and theme changes completed:

| View | Capture |
| --- | --- |
| Mobile light, 375 × 812 | [Calendar](../assets/calendar-mobile-light.png) |
| Desktop light, 1440 × 1100 | [Calendar](../assets/calendar-desktop-light.png) |
| Mobile dark, 375 × 812 | [Calendar](../assets/calendar-mobile-dark.png) |
| Desktop dark, 1440 × 1100 | [Calendar](../assets/calendar-desktop-dark.png) |

Actual Dart hot reload succeeded and runtime inspection reported no errors.
Emulators do not prove composite-index availability: declared indexes still
need staging verification. Reminder delivery/device integration belongs to
M5b. Attachments/offline commands, full native/accessibility/operational checks,
and live provisioning/release remain required M6–M8 work. The development banner
and existing desktop row/Chip semantics are included in those later checks.
