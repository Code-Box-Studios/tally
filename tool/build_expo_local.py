#!/usr/bin/env python3
"""Export a real local test app; these artifacts must not be publicly deployed."""
import json, os, shutil, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
cli=os.environ.get('TALLY_SUPABASE_CLI') or shutil.which('supabase') or '/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase'
status=json.loads(subprocess.check_output([cli,'status','-o','json'],cwd=root,stderr=subprocess.DEVNULL))
if status.get('API_URL')!='http://127.0.0.1:56321':raise RuntimeError('Use the isolated Tally local backend.')
environment=dict(os.environ,EXPO_PUBLIC_SUPABASE_URL=status['API_URL'],EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=status.get('PUBLISHABLE_KEY') or status['ANON_KEY'])
subprocess.run(['node','tool/build_expo_web.mjs','--local'],cwd=root,env=environment,check=True)
