#!/usr/bin/env python3
"""Start Expo against Tally's isolated local backend using public configuration."""
import json
import os
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
cli = os.environ.get('TALLY_SUPABASE_CLI') or shutil.which('supabase') or '/home/jess/.local/share/tally-tools/supabase-2.120.0/supabase'
status = json.loads(subprocess.check_output([cli, 'status', '-o', 'json'], cwd=root, stderr=subprocess.DEVNULL))
if status.get('API_URL') != 'http://127.0.0.1:56321':
    raise RuntimeError('Start the isolated Tally Supabase stack first.')
environment = dict(os.environ, EXPO_PUBLIC_SUPABASE_URL=status['API_URL'],
                   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=status.get('PUBLISHABLE_KEY') or status['ANON_KEY'])
subprocess.run(['npx', 'expo', 'start', '--web', '--port', '7384', '--clear'], cwd=root / 'apps/tally', env=environment, check=True)
