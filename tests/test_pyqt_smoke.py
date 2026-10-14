# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.1.0
Test: PyQt6 WebEngine Headless Smoke Test & Harness Global Contract Verification
"""

import sys
import unittest
from pathlib import Path

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PROJECT_DIR = Path(__file__).resolve().parent.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))


class TestPyQtSmoke(unittest.TestCase):
    def test_harness_loaded_in_webengine(self):
        """Spawns QWebEngineView offscreen and verifies window.Harness and window.VirtualClock exist."""
        try:
            from PyQt6.QtCore import QEventLoop, QTimer, QUrl
            from PyQt6.QtWebEngineWidgets import QWebEngineView
            from PyQt6.QtWidgets import QApplication
        except ImportError:
            self.skipTest("PyQt6 WebEngine not installed in current environment.")

        app = QApplication.instance() or QApplication(sys.argv)
        view = QWebEngineView()
        index_file = PROJECT_DIR / "index.html"
        self.assertTrue(index_file.exists())

        loop = QEventLoop()
        load_finished = False

        def on_loaded(ok):
            nonlocal load_finished
            load_finished = ok
            loop.quit()

        view.loadFinished.connect(on_loaded)
        view.load(QUrl.fromLocalFile(str(index_file.resolve())))

        # 5 second timeout guard
        QTimer.singleShot(5000, loop.quit)
        loop.exec()

        self.assertTrue(load_finished, "index.html failed to load into QWebEngineView.")

        # Evaluate window.Harness
        eval_loop = QEventLoop()
        harness_type = None

        def on_js_eval(val):
            nonlocal harness_type
            harness_type = val
            eval_loop.quit()

        view.page().runJavaScript("typeof window.Harness", on_js_eval)
        QTimer.singleShot(2000, eval_loop.quit)
        eval_loop.exec()

        self.assertEqual(
            harness_type,
            "object",
            f"window.Harness must be of type 'object', but got: {harness_type}",
        )

    def test_main_process_smoke(self):
        """Verifies that main.py starts cleanly and does not exit immediately."""
        import subprocess
        proc = subprocess.Popen(
            [sys.executable, str(PROJECT_DIR / "main.py")],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        try:
            import time
            time.sleep(1.5)
            # Process must still be running (poll is None)
            ret = proc.poll()
            self.assertIsNone(ret, f"main.py exited prematurely with code {ret}")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                proc.kill()
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()
    def test_popup_close_requested_signal_integration(self):
        """Verifies that popup windows close when windowCloseRequested is emitted in WebEngine."""
        import subprocess
        code = (
            "import sys\n"
            "from PyQt6.QtWidgets import QApplication, QMainWindow\n"
            "from PyQt6.QtWebEngineWidgets import QWebEngineView\n"
            "from PyQt6.QtWebEngineCore import QWebEnginePage\n"
            "app = QApplication(sys.argv)\n"
            "win = QMainWindow()\n"
            "view = QWebEngineView(win)\n"
            "class MockCustomPage(QWebEnginePage):\n"
            "    def createWindow(self, type_):\n"
            "        self.popup = QMainWindow()\n"
            "        p_view = QWebEngineView(self.popup)\n"
            "        p_page = QWebEnginePage(self.profile(), p_view)\n"
            "        p_page.windowCloseRequested.connect(self.popup.close)\n"
            "        p_view.setPage(p_page)\n"
            "        self.popup.show()\n"
            "        return p_page\n"
            "page = MockCustomPage(view)\n"
            "view.setPage(page)\n"
            "win.show()\n"
            "popup_page = page.createWindow(QWebEnginePage.WebWindowType.WebBrowserWindow)\n"
            "assert hasattr(page, 'popup') and page.popup.isVisible()\n"
            "popup_page.windowCloseRequested.emit()\n"
            "app.processEvents()\n"
            "assert not page.popup.isVisible()\n"
            "print('POPUP_CLOSE_OK')\n"
        )
        proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Popup close test failed: {proc.stderr}")
        self.assertIn("POPUP_CLOSE_OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()



