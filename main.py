# -*- coding: utf-8 -*-
"""
[LJack Protocol v7.1.0 Implementation]
Target: 치트 플래시 (Cheat Flash) v1.0.0
Desktop Native Frame: PyQt6 QWebEngineView + Ruffle WASM + VirtualClock Hook Rig
"""

import os
import sys
from pathlib import Path

# LJack 강령 10: UTF-8 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def get_base_dir() -> Path:
    """Supports both normal development and PyInstaller _internal portable packaging."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def run_desktop_app():
    from PyQt6.QtCore import QUrl, Qt, QSettings
    from PyQt6.QtGui import QIcon, QKeySequence, QShortcut
    from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEnginePage, QWebEngineSettings
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWidgets import QApplication, QMainWindow

    app = QApplication(sys.argv)
    app.setApplicationName("CheatFlash")

    base_dir = get_base_dir()
    index_file = base_dir / "index.html"

    if not index_file.exists():
        print(f"[Error] index.html not found in {base_dir}")
        sys.exit(1)

    window = QMainWindow()
    window.setWindowTitle("치트 플래시 (Cheat Flash) v1.0.0 - 플래시 게임 치트 & 스피드 조절 플레이어")
    window.resize(1200, 880)
    window.setMinimumSize(800, 650)

    icon_file = base_dir / "icon.png"
    if icon_file.exists():
        app_icon = QIcon(str(icon_file))
        app.setWindowIcon(app_icon)
        window.setWindowIcon(app_icon)

    import server

    # Start local server daemon synchronously binding port for persistent IndexedDB / Flash SharedObject support
    server_port = server.run_server_in_background(8088)

    # QWebEngine Persistent Profile (IndexedDB / Flash SharedObject permanent retention)
    storage_dir = (base_dir / "_storage").resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)

    profile = QWebEngineProfile("CheatFlashPersistentStorage", app)
    profile.setPersistentStoragePath(str(storage_dir))
    profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)

    class CustomWebPage(QWebEnginePage):
        def __init__(self, profile, parent=None):
            super().__init__(profile, parent)
            self.popups = []

        def createWindow(self, type_):
            popup_win = QMainWindow()
            popup_win.setWindowTitle("치트 플래시 - 치트 및 변수 인스펙터")
            popup_win.resize(450, 850)
            popup_win.setMinimumSize(380, 650)
            if icon_file.exists():
                popup_win.setWindowIcon(app_icon)

            # Blind Spot 2: Multi-Monitor Geometry Restoration
            settings = QSettings("CheatFlash", "InspectorWindow")
            saved_geom = settings.value("geometry")
            if saved_geom:
                popup_win.restoreGeometry(saved_geom)

            popup_view = QWebEngineView(popup_win)
            popup_page = QWebEnginePage(self.profile(), popup_view)
            popup_view.setPage(popup_page)
            popup_win.setCentralWidget(popup_view)

            # Connect JS window.close() to close the QMainWindow
            popup_page.windowCloseRequested.connect(popup_win.close)

            # Save geometry on move, resize, and close
            def save_geom():
                try:
                    settings.setValue("geometry", popup_win.saveGeometry())
                except Exception:
                    pass

            # When popup is closed (by user X button or windowCloseRequested), notify main page and cleanup
            def handle_popup_close(event):
                save_geom()
                try:
                    self.runJavaScript("if (window.Harness && window.Harness.inspectorWindow) window.Harness.onInspectorWindowClosed();")
                except Exception:
                    pass
                if popup_win in self.popups:
                    self.popups.remove(popup_win)
                event.accept()

            popup_win.closeEvent = handle_popup_close
            popup_win.show()
            self.popups.append(popup_win)
            return popup_page

        def close_all_popups(self):
            for p in list(self.popups):
                try:
                    p.close()
                except Exception:
                    pass
            self.popups.clear()

    view = QWebEngineView(window)
    view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
    page = CustomWebPage(profile, view)
    view.setPage(page)

    settings = view.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)

    # Load via standard HTTP origin for complete IndexedDB and WebAssembly stability
    target_url = QUrl(f"http://127.0.0.1:{server_port}/index.html")
    view.load(target_url)

    window.setCentralWidget(view)

    # Register OS-Level Fallback Shortcuts (LJack 기둥 6 & 10)
    def trigger_js(code: str):
        view.page().runJavaScript(code)

    QShortcut(QKeySequence("F1"), window, activated=lambda: trigger_js("Harness.togglePause();"))
    QShortcut(QKeySequence("F2"), window, activated=lambda: trigger_js("Harness.setSpeed(0.5);"))
    QShortcut(QKeySequence("F3"), window, activated=lambda: trigger_js("Harness.setSpeed(2.0);"))
    QShortcut(QKeySequence("F4"), window, activated=lambda: trigger_js("Harness.stepFrame();"))
    QShortcut(QKeySequence("F5"), window, activated=lambda: trigger_js("Harness.setSpeed(1.0);"))

    def handle_main_close(event):
        page.close_all_popups()
        event.accept()

    window.closeEvent = handle_main_close
    window.show()
    print("[Cheat Flash v1.0.0] PyQt6 Native Desktop Rig initialized successfully.")
    sys.exit(app.exec())


if __name__ == "__main__":
    run_desktop_app()
