#!/usr/bin/env python3
"""Start isolated Tally services and provision local Cron secrets without logs."""
import json, os, shutil, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
cli=os.environ.get('TALLY_SUPABASE_CLI') or shutil.which('supabase') or '/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase'
# Never capture or emit the CLI's successful credential status in a log file.
result=subprocess.run([cli,'start','--exclude','studio,imgproxy,logflare,vector,supavisor'],cwd=root,capture_output=True,text=True)
if result.returncode:
    raise RuntimeError('Supabase startup failed. Run `supabase start` locally to inspect startup diagnostics.')
status=json.loads(subprocess.check_output([cli,'status','-o','json'],cwd=root,stderr=subprocess.DEVNULL))
if status.get('API_URL')!='http://127.0.0.1:56321':raise RuntimeError('Wrong stack; refusing to provision secrets.')
def literal(value):return "'"+value.replace("'","''")+"'"
sql="""do $$ declare item record; begin
 for item in select id from vault.secrets where name in ('tally_project_url','tally_job_secret') loop
  delete from vault.secrets where id=item.id;
 end loop;
 perform vault.create_secret('http://kong:8000','tally_project_url');
 perform vault.create_secret(%s,'tally_job_secret');
end $$;"""%literal(status['SERVICE_ROLE_KEY'])
subprocess.run(['docker','exec','-i','supabase_db_tally-supabase','psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
print('Tally Supabase ready: API localhost:56321; database localhost:56322; Cron enabled.')
print('Serve workers with: supabase functions serve tally-api --no-verify-jwt')
print('Start app with: python3 tool/run_supabase_local.py')
