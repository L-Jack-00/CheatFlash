# -*- coding: utf-8 -*-
"""
[Cheat Flash v1.0.0] Universal One-Click Launcher
Auto-detects PyQt6 Desktop environment; smoothly falls back to Local Web Browser Mode if needed.
"""

import sys
from pathlib import Path

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main():
    print("=" * 60)
    print(" ⚡ 치트 플래시 (Cheat Flash) v1.0.0 - Universal Flash Runtime")
    print("=" * 60)

    try:
        import PyQt6.QtWebEngineWidgets
        import PyQt6.QtWidgets

        print("✔ PyQt6 WebEngine detected. Launching Desktop Native Window...")
        import main

        main.run_desktop_app()
    except ImportError as e:
        print(f"ℹ PyQt6 WebEngine not available ({e}).")
        print("✔ Switching to Zero-Dependency Web Mode via server.py...")
        import server

        server.start_server()


if __name__ == "__main__":
    main()
