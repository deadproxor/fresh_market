#!/usr/bin/env python3
"""
FreshMarket Local Development Server
- Multi-threaded (ThreadingHTTPServer)
- Automatic No-Cache headers (Cache-Control: no-store, no-cache, must-revalidate)
- Prevents 304 Not Modified to guarantee instant reload of local CSS/JS/HTML changes
"""

import http.server
import socketserver
import sys

PORT = 3030

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force browser to never cache files locally during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_head(self):
        # Remove conditional cache headers so server always serves 200 OK with fresh disk bytes
        while 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        while 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        return super().send_head()

def run():
    socketserver.TCPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHTTPRequestHandler) as httpd:
        print(f"🚀 FreshMarket Dev Server (No-Cache) started at http://127.0.0.1:{PORT}")
        print("⚡ Changes to CSS, JS, and HTML will now be visible immediately upon browser refresh.")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down dev server...")

if __name__ == '__main__':
    run()
