-- Private bucket content is read and written only by authenticated Edge actions.
-- Restrictive policies also prevent an unrelated permissive policy from granting
-- access to this bucket if the project later hosts another storage feature.
create policy tally_private_files on storage.objects as restrictive for all to anon,authenticated
 using (bucket_id<>'tally-attachments') with check (bucket_id<>'tally-attachments');
