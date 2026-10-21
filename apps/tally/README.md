# Tally

Expo SDK 57 frontend. See [repository operations](../../docs/operations/expo.md) for setup, tests, exports, and native distribution.

`npm start`, `npm run web`, `npm run android`, and `npm run ios` use public backend environment values. Root `npm run start:local` obtains public configuration from the isolated local Supabase stack.

For purchases someone makes using your card or lending account, choose **Add installments → Someone else is repaying**, select the person from People and your account, then set the installment schedule. Tally creates linked provider and repayment schedules in one save. Record your provider payments and the person's repayments on their respective schedules; each has its own balance. The repayment appears under that person in People, and either schedule links to the other. Edits and cancellation affect only the schedule you open.

Open a receivable loan and choose **Share with borrower** to invite one verified email. Share the displayed link yourself; Tally does not send invitation emails. The recipient accepts under **Shared with me** (inside **More** on mobile), reviews the balance and schedule, and can submit payment proof. Sending proof does not change the balance. The owner reviews it from the loan and explicitly approves or rejects it. Access can be revoked at any time.

**Settings → Import spreadsheet** accepts CSV upload or paste with column mapping and a preview. Select the rows to import; possible duplicates start unchecked. Unsupported payment history, settled statuses, and advanced interest terms are reported rather than silently changed. Retrying the same import reuses its saved commands.

**Payoff simulator** on a finite loan compares the remaining plan with extra monthly payments without changing the ledger. Interest already fixed at origination remains payable; the simulator does not invent interest savings.

Receipt scanning runs locally and fills a review draft. It never uploads the selected image or records a payment automatically. JPEG, PNG, and WebP images up to 10 MiB are supported; PDFs and handwriting are not supported. Amount, date, and reference remain editable, and references are preserved in payment notes.

`npm ci` prepares pinned Tesseract 7 worker/core files and English data in the ignored `public/ocr/v7` directory. Run `node scripts/prepare-receipt-ocr.mjs` if those generated assets are missing. The web export serves all OCR assets from the app's own origin, and the service worker excludes them from initial precaching. A first browser scan needs a network connection; OCR availability offline is not guaranteed. Receipt images and recognized text are never placed in the app's offline store.

Native scanning uses `expo-text-extractor` 2.0.0 (Apple Vision on iOS and Google ML Kit on Android). Install a new development or distribution build after adding it; Expo Go and existing binaries do not contain the native module. Android may need to download its recognition model on first use. SDK57 autolinking and JavaScript exports can be checked locally, but actual native builds and physical iPhone/PWA behavior require device verification.
