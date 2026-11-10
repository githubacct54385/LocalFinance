#!/usr/bin/env python3
"""Static dev server that disables caching so edits always show up. Usage: python3 scripts/dev-server.py [port]"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
print(f'LocalFinance dev server: http://localhost:{port}  (Ctrl+C to stop)')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
