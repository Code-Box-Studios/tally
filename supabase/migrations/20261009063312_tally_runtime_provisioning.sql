-- Runtime data and extensions are not emitted by the declarative schema diff.
-- These statements run on fresh local and hosted Tally projects alike.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tally-attachments','tally-attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
select cron.schedule('tally-workers','* * * * *','select tally_private.enqueue_worker();');
-- No secrets or user records belong in migrations. Set the endpoint and shared
-- job secret in Vault after deploying the functions. Missing secrets fail closed.
