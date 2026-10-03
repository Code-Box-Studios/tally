# Tally screens and user journeys

The interface prioritizes the next obligation and the remaining amount. Material 3 surfaces, generous spacing, restrained color, and short labels should make it calm and quick to scan.

## Navigation and responsive layout

| Width | Navigation | Content behavior |
| --- | --- | --- |
| 320–599 logical pixels | Bottom bar: Home, Obligations, People, Calendar, More. More contains Activity and Settings. Prominent + Add action. | One column, readable cards, full-screen editors and details, filter sheets. |
| 600–1023 | NavigationRail with all six destinations | Two-column dashboard where space allows; list/detail only above a measured usable width; constrained forms. |
| 1024+ | Labeled sidebar/extended rail with all six destinations and + Add | Dashboard grid, obligations table/list plus detail panel, calendar plus agenda; main content maximum width 1440. |

The six product destinations are Home, Obligations, People, Calendar, Activity, Settings. A compact mobile More destination keeps labels usable; it is a presentation choice, not a new feature area. Route identity remains stable across breakpoints, rotation, and browser resizing.

Under Obligations, tabs/chips are **I Owe**, **Owed to Me**, and **Monthly Dues**. + Add opens **I borrowed money**, **I lent money**, **Add monthly due**, **Add recurring payment**. Installments are an optional schedule within borrowed/lent money.

## Screen map

| Screen / route | Main content | Primary actions |
| --- | --- | --- |
| Session loading `/startup` | Initializing auth/profile/capabilities; retry for failure | Retry |
| Welcome `/welcome` | Tally, Know what’s due, short product explanation | Create account, Sign in |
| Login `/auth/sign-in` | Email/password, Google sign-in | Sign in, Reset password |
| Registration `/auth/sign-up` | Account creation, password validation | Create account |
| Recovery `/auth/reset` | Neutral confirmation response | Send reset link |
| Onboarding `/onboarding` | Currency, timezone, reminders, first action | Continue, Skip optional step |
| Home `/home` | Currency selector, balance cards, due sections, auto agenda, recent activity | + Add, open due item |
| Obligations `/obligations` | Three tabs, search, filters, records | + Add, open record |
| Creation `/obligations/new` | Human action choice and progressive form | Save obligation |
| Obligation `/obligations/:id` | Original, paid, remaining; dates/contact/mode; periods/history; notes/files | Record payment, edit, pause/end/cancel |
| Editing `/obligations/:id/edit` | Editable terms and effective-date preview | Save changes |
| Period `/obligations/:id/instances/:instanceId` | Period amount/status/due date/deduction/history | Enter bill amount, Mark as paid, confirm/fail |
| Payment `/payments/new?obligationId=...` | Full/partial amount, date, source, allocations, receipt, balance preview | Record payment |
| Payment detail `/payments/:id` | Payment and correction chain, source/receipt snapshots | Correct mistake |
| People `/people` | People/organization filters, names, per-currency positions | Add person, Add organization |
| Contact `/people/:id` | Owes me / I owe / net per currency, active/completed obligations, history, notes | Add obligation, edit/archive contact |
| Calendar `/calendar` | Month/week agenda, due date events and filters | Open date/instance |
| Activity `/activity` | Grouped chronological audit events, pagination | Open linked record |
| Reminder inbox `/notifications` | Due/overdue/confirmation reminders and read state | Open obligation, confirm |
| Settings `/settings` | Preferences and account actions | Edit preferences, sign out |
| Sources `/settings/payment-sources` | Labels/type/last four/active state | Add/edit/archive |
| Categories `/settings/categories` | Default/custom labels | Add/edit/archive |
| Reminder settings `/settings/reminders` | Offsets, time, quiet hours, channels, sensitive text preference | Save |
| Sync `/settings/sync` | Pending, accepted, rejected and conflicting commands | Retry, revise, cancel local pending action |
| Account `/settings/account` | Profile/auth providers, recent-auth deletion | Reauthenticate, delete account |

## Main journeys

### Create the first obligation

Welcome → authenticate → server bootstraps profile/default categories → confirm default currency/timezone → optionally enable reminders → **I borrowed money** → select/create person → enter amount and due date → review → save → detail and Home reflect the accepted obligation. A denied notification permission leaves in-app reminders enabled. Offline creation is labeled Waiting to sync.

### Record a partial repayment

Open obligation → **Record payment** → choose Partial → enter amount/date/source → see allocation and resulting remaining preview → confirm → command accepted → immutable payment, updated balance, and activity appear. If the server balance changed meanwhile, review the refreshed preview; a rejected overpayment never becomes canonical history.

### Manage a recurring bill

**Add monthly due** → fixed or variable amount → recurrence and due day → start/end → manual/automatic/confirmation and source → preview next three dates → save. Open a period to pay or enter its bill amount. Changing the template fee shows the first effective future period and leaves previously generated periods unchanged unless the user explicitly edits an eligible unpaid future instance.

### Confirm or fail an automatic deduction

Reminder/in-app inbox → Expected deduction detail → **Yes, it was deducted** or **It failed**. Confirmation records a payment with the chosen date/source. Failure records an attempt and leaves the amount outstanding. If a prior assumed payment exists, reporting failure reverses it with an explicit audit reason. **Record payment** later resolves the outstanding period; Tally does not initiate retries with a bank.

### Correct a mistake

Payment detail → **Correct mistake** → explain reason and replacement amount/date/source → review original/reversal/replacement → server transaction commits the correction chain and updates balances. Cancelling this editor does not alter history. For an invalid replacement, the whole correction is rejected rather than reversing the original alone.

### Reconnect after offline work

Open cached data → save payment to durable outbox → close/reopen app → command still pending → reconnect → retry same command ID → accepted once → pending preview replaced by canonical payment. A schedule change/closed obligation can instead produce a visible conflict that needs revised input.

## Dashboard definitions and presentation

Show one selected currency with an obvious code; other currencies have their own tabs/buckets. No card combines currencies. **You Owe** and **Owed to You** cover remaining finite borrowing/lending obligations, including finite installments. **Net position** is the difference between those two and is informational. Monthly dues outstanding appears separately so an open recurring template is not treated as an infinite debt.

**Due this month** is the scheduled amount of payable instances in the user's current civil month, excluding skipped/cancelled items. **Remaining this month** is their outstanding amount after payments allocated to those instances. **Paid this month** is outgoing payment history by payment date and can include a previous month's bill; it is not subtracted blindly from Due this month. Use a tooltip/helper sentence to explain the difference and a separate Received this month view for lending receipts. Show assumed auto payments as a distinct subtotal/label.

Due Today includes unpaid items due on the local date; Due Soon means the next seven days excluding today; Overdue means unpaid items strictly before today. Incoming expected repayments are labeled **Expected from others** and not added to outgoing dues. Upcoming automatic deductions show amount or Amount needed, source, date, and behavior. Recent activity includes links and friendly verbs.

## Forms and financial feedback

Display Original, Paid/Repaid, Remaining side by side in details. A source label is optional for manual payments and required for auto behavior. A variable bill with no amount says **Enter this bill’s amount** and cannot be paid/assumed until a positive amount is set.

Validate progressively and preserve the draft on network failure. Use **Waiting to sync**, **Syncing**, **Recorded**, **Needs your attention** for command state. Submission disables repeat taps locally, while server idempotency handles repeat requests independently. Payment previews say **After this payment** rather than presenting unaccepted changes as recorded.

Paused/ended/cancelled editors explain their effective date and what existing periods still need attention. Archiving a person/category/source explains that historical records stay visible. Cancelling an obligation does not invent a payment or forgiveness receipt.

## Empty, loading and error states

| Context | Copy / action |
| --- | --- |
| No borrowing | **Nothing owed yet.** Add money you've borrowed or an obligation you want Tally to remember. **Add obligation** |
| No lending | **No money owed to you yet.** Record money you've lent to keep repayments clear. **I lent money** |
| No dues | **Make room for fewer surprises.** Add rent, bills, or another regular payment. **Add monthly due** |
| Calendar empty | **Nothing due on this date.** Choose another day or add a payment to remember. |
| No contacts | **Start with someone you know.** Add a person or organization when recording an obligation. |
| All filters exclude results | **No matches for these filters.** **Clear filters** |
| Offline | **Showing saved information. New entries will sync when you're online.** |
| Rejected payment | State the specific reason, retain the entered amount, and offer Review balance. |
| Projection stale | Keep last data with **Updating totals** and an as-of time; record details remain accessible. |

Use skeletons for initial reads; preserve loaded data during refresh. Avoid a blank screen on recoverable failures.

## Theme and accessibility

Material 3 ColorScheme supports light/dark/system. Financial status always includes text and a meaningful icon. Use accessible contrast, at least 48 logical-pixel interactive targets, visible keyboard focus, semantic labels that include currency and status, and predictable tab order. Respect reduced motion, safe areas, keyboard insets, and text scaling without fixed-height financial cards. Screen readers announce errors and submitted state without repeatedly announcing stream refreshes.

Long names, long currency labels, right-to-left-ready layouts, and localized date/number formatting are design fixtures. Editors remain constrained to a readable width on desktop; desktop tables become cards/rows on smaller screens rather than horizontal overflow.
