# -*- coding: utf-8 -*-
"""
[Cheat Flash v1.0.0]
Zero-Dependency Local HTTP Server Runner
Supports automatic browser launch and WASM MIME types.
"""

import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PORT = 8088
DIRECTORY = Path(__file__).resolve().parent


import json
import zlib


def disarm_swf_bytes(data: bytes) -> tuple[bytes, list[str]]:
    """Disarms ActionScript anti-cheat functions by replacing their entry with ActionPush(true) + ActionReturn."""
    if len(data) < 8 or not (data.startswith(b'CWS') or data.startswith(b'FWS')):
        return data, []

    version = data[3:4]
    try:
        if data.startswith(b'CWS'):
            decompressed = bytearray(zlib.decompress(data[8:]))
        else:
            decompressed = bytearray(data[8:])
    except Exception:
        return data, []

    patches = []
    # Known Anti-Cheat function signatures across Flash games
    anti_cheat_names = [
        b'confereNDS',
        b'calculaNDS',
        b'calcNDS',
        b'cheaterHash',
        b'ptsCheck',
        b'dinCheck',
        b'antiCheat',
        b'checkAntiCheat',
        b'checkSum',
        b'validateScore',
        b'verifyScore',
        b'isHacked',
        b'verifyIntegrity',
        b'checkSecurity'
    ]

    for name in anti_cheat_names:
        pos = 0
        while True:
            fn_pos = decompressed.find(name + b'\x00', pos)
            if fn_pos == -1:
                break

            # 1. ActionDefineFunction2 (0x8e)
            if fn_pos >= 3 and decompressed[fn_pos - 3] == 0x8e:
                def_pos = fn_pos - 3
                hdr_len = int.from_bytes(decompressed[def_pos+1:def_pos+3], 'little')
                code_len_pos = def_pos + 3 + hdr_len
                code_len = int.from_bytes(decompressed[code_len_pos:code_len_pos+2], 'little')
                code_start = code_len_pos + 2
                if code_len >= 6 and code_start + 6 <= len(decompressed):
                    # Patch: Push true (96 02 00 05 01), Return (3e)
                    decompressed[code_start:code_start+6] = b'\x96\x02\x00\x05\x01\x3e'
                    patches.append(f"{name.decode(errors='ignore')}()")

            # 2. ActionDefineFunction (0x9b)
            elif fn_pos >= 3 and decompressed[fn_pos - 3] == 0x9b:
                def_pos = fn_pos - 3
                hdr_len = int.from_bytes(decompressed[def_pos+1:def_pos+3], 'little')
                code_len_pos = def_pos + 3 + hdr_len
                code_len = int.from_bytes(decompressed[code_len_pos:code_len_pos+2], 'little')
                code_start = code_len_pos + 2
                if code_len >= 6 and code_start + 6 <= len(decompressed):
                    decompressed[code_start:code_start+6] = b'\x96\x02\x00\x05\x01\x3e'
                    patches.append(f"{name.decode(errors='ignore')}()")

            pos = fn_pos + len(name) + 1

    total_len = len(decompressed) + 8
    disarmed_swf = b'FWS' + version + total_len.to_bytes(4, 'little') + bytes(decompressed)
    return disarmed_swf, patches


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def do_POST(self):
        if self.path == "/api/disarm":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            disarmed_data, patches = disarm_swf_bytes(body)
            self.send_response(200)
            self.send_header("Content-Type", "application/x-shockwave-flash")
            self.send_header("Content-Length", str(len(disarmed_data)))
            self.send_header("X-Patched-Count", str(len(patches)))
            self.send_header("X-Patched-Names", ",".join(patches[:10]))
            self.end_headers()
            self.wfile.write(disarmed_data)
            return
        self.send_error(404, "Not Found")

    def end_headers(self):
        # Force fresh reload of assets (prevent stale CSS/JS cache)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Enable CORS and WASM headers
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Patched-Count, X-Patched-Names")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".swf"):
            return "application/x-shockwave-flash"
        return super().guess_type(path)



import threading


def create_server(preferred_port: int = PORT) -> tuple[socketserver.TCPServer, int]:
    """Binds to 127.0.0.1 on preferred_port or fallback ports."""
    socketserver.TCPServer.allow_reuse_address = True
    for port in range(preferred_port, preferred_port + 20):
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", port), CustomHandler)
            return httpd, port
        except OSError:
            continue
    # Fallback to dynamic free port
    httpd = socketserver.TCPServer(("127.0.0.1", 0), CustomHandler)
    return httpd, httpd.server_address[1]


def run_server_in_background(preferred_port: int = PORT) -> int:
    """Synchronously binds the port, starts serve_forever in a daemon thread, and returns the bound port."""
    httpd, port = create_server(preferred_port)
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"[Cheat Flash v1.0.0] Web Server running at: {url}")
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return port


def start_server(open_browser: bool = True, port: int = PORT):
    httpd, actual_port = create_server(port)
    url = f"http://127.0.0.1:{actual_port}/index.html"
    print(f"[Cheat Flash v1.0.0] Web Server running at: {url}")
    if open_browser:
        print("Press Ctrl+C to terminate.")
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except (KeyboardInterrupt, SystemExit):
        print("\n[Cheat Flash] Server stopped cleanly.")


if __name__ == "__main__":
    start_server(open_browser=True)


