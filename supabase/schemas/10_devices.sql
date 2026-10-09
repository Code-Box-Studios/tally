-- A push token cannot be active for two accounts. Shared-device sign-out
-- unregisters its old owner before another owner enables that token.
create unique index tally_active_push_token on public.tally_notification_devices((data->>'tokenHash'))
 where data->>'active'='true' and data->>'channel'='push' and data->>'tokenHash' is not null;
