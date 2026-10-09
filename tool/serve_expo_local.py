#!/usr/bin/env python3
"""Serve an already exported local Expo app with SPA routing."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
class SpaHandler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(Path(__file__).resolve().parents[1]/'apps/tally/dist'),**kwargs)
 def do_GET(self):
  path=self.translate_path(self.path.split('?',1)[0])
  if not Path(path).is_file():self.path='/index.html'
  return super().do_GET()
 def end_headers(self):
  self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');super().end_headers()
 def log_message(self,*args):pass
print('Tally Expo static app: http://localhost:7385',flush=True)
ThreadingHTTPServer(('127.0.0.1',7385),SpaHandler).serve_forever()
