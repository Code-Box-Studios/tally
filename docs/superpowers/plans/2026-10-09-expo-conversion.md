# Expo conversion implementation plan

Spec: `docs/superpowers/specs/2026-10-09-expo-conversion-design.md`.

Execute inline on main, without questions. Preserve existing changes and the user's .ignore file. The backend is reused; no unrelated hosted project is modified.

1. Establish Expo SDK and TypeScript app, pinned dependencies, router, theme, responsive shell, local public configuration, and startup validation. Verify dependency compatibility and type checking.
2. Implement typed document decoders, bounded money/date helpers, owner-fenced repository, Auth/profile provider, onboarding and recovery. Write unit tests first for invalid currency/money/owner inputs and late responses.
3. Port durable sync to IndexedDB/SQLite with trust, owner/environment namespaces, immutable payloads, retries, restart recovery and visible pending actions. Test duplicate dispatch, ambiguous responses, account switches and unauthorized reads.
4. Implement dashboard, obligation list/detail, finite/installment/recurring forms, payments and corrections, lifecycle and deduction actions. Exercise the exact existing Edge command payloads against local Supabase.
5. Implement people/organizations, categories/payment sources, calendar/search, activity, attachments, reminder inbox/preferences, notifications, settings and protected deletion. Keep every read and command outside visual components.
6. Finish Expo web export, native EAS configuration, root commands, CI and operations documentation. Run meaningful unit/component/browser/backend suites, verify responsive rendering, obtain one final review, fix important findings with regression tests, and commit on main.

Shared interfaces: all screens consume session-scoped repositories and typed DTOs; every mutation uses the same durable command service. Sync acknowledges canonical results before updating cache. Notifications and attachments use separate bounded trusted endpoints. Existing backend contract tests remain release gates.

Review focus: owner changes during reads/dispatch; PKCE recovery; ambiguous successful payment responses; durable duplicate actions and multi-tab leasing; currency/date decoding; deletion/upload races; queued dependency resolution; notification token cleanup; native/web API differences; complete screen/action parity.
