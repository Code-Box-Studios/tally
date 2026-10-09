-- Normalize audit instants before JSON comparison; civil due dates stay strings.
create function tally_private.query_value(field_name text,value jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select case when field_name ~ '(At|Until)$' and jsonb_typeof(value)='string'
  then to_jsonb(to_char((value#>>'{}')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  else coalesce(value,'null'::jsonb) end;
$$;
revoke all on function tally_private.query_value(text,jsonb) from public,anon;
grant execute on function tally_private.query_value(text,jsonb) to authenticated,service_role;

-- Read-only, owner-fenced, bounded keyset pagination for existing repositories.
create function public.tally_read_page(collection_name text, request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare table_name text; conditions text := 'user_id=$1'; sorting text := '';
 predicate text := ''; prefix text := ''; term text; field text; operation text;
 item record; ordering jsonb; cursor jsonb; comparator text; take integer;
 result jsonb; descending boolean := false; value jsonb;
begin
 if (select auth.uid()) is null then raise insufficient_privilege; end if;
 if collection_name not in ('obligations','obligationInstances','contacts','payments','paymentSources','categories',
  'activities','summaries','ledgerState','deductionAttempts','paymentEvidence','reminders','notificationPreferences','attachments') then
  raise exception 'invalid-argument' using errcode='22023';
 end if;
 take := (request->>'limit')::integer;
 if take not between 1 and 200 or octet_length(request::text)>16384 then raise exception 'invalid-argument' using errcode='22023'; end if;
 table_name := tally_private.table_name(collection_name);
 for item in select * from jsonb_each(coalesce(request->'equals','{}')) loop
  if item.key !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  conditions := conditions || format(' and tally_private.query_value(%L,data->%L)=tally_private.query_value(%L,%L::jsonb)',item.key,item.key,item.key,item.value::text);
 end loop;
 for ordering in select * from jsonb_array_elements(coalesce(request->'ranges','[]')) loop
  field:=ordering->>'field'; operation:=ordering->>'comparison';
  if field !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  comparator:=case operation when 'greaterThan' then '>' when 'greaterThanOrEqual' then '>='
   when 'lessThan' then '<' when 'lessThanOrEqual' then '<=' end;
  if comparator is null then raise exception 'invalid-argument'; end if;
  conditions:=conditions||format(' and tally_private.query_value(%L,data->%L) %s tally_private.query_value(%L,%L::jsonb)',field,field,comparator,field,(ordering->'value')::text);
 end loop;
 cursor:=request->'after';
 for ordering in select * from jsonb_array_elements(coalesce(request->'order','[]')) loop
  field:=ordering->>'field'; descending:=coalesce((ordering->>'descending')::boolean,false);
  if field !~ '^[A-Za-z][A-Za-z0-9]{0,99}$' then raise exception 'invalid-argument'; end if;
  term:=format('tally_private.query_value(%L,data->%L)',field,field);
  sorting:=sorting||case when sorting='' then '' else ',' end||term||case when descending then ' desc' else ' asc' end;
  if cursor is not null and cursor <> 'null'::jsonb then
   value:=coalesce(cursor->'values'->field,'null'::jsonb);
   predicate:=predicate||case when predicate='' then '' else ' or ' end||'('||prefix||
    format('%s %s tally_private.query_value(%L,%L::jsonb)',term,case when descending then '<' else '>' end,field,value::text)||')';
   prefix:=prefix||format('%s=tally_private.query_value(%L,%L::jsonb) and ',term,field,value::text);
  end if;
 end loop;
 sorting:=sorting||case when sorting='' then '' else ',' end||'id'||case when descending then ' desc' else ' asc' end;
 if cursor is not null and cursor <> 'null'::jsonb then
  if cursor->>'id' !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid-argument'; end if;
  predicate:=predicate||case when predicate='' then '' else ' or ' end||'('||prefix||
   format('id %s %L',case when descending then '<' else '>' end,cursor->>'id')||')';
  conditions:=conditions||' and ('||predicate||')';
 end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''data'',data) order by rank),''[]'') from
  (select id,data,row_number() over(order by %s) rank from public.%I where %s order by %s limit %s) page',
  sorting,table_name,conditions,sorting,take+1) into result using (select auth.uid());
 return result;
end;
$$;
revoke all on function public.tally_read_page(text,jsonb) from public,anon;
grant execute on function public.tally_read_page(text,jsonb) to authenticated;
