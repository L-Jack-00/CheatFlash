# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v2.2.0
Test: Tab 2 Advanced Cheat Records, Undocked OS Window Form, Authentic Flash Context Menu & Interactive Demo
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


class TestTab2AndFlashContextMenu(unittest.TestCase):
    def setUp(self):
        self.html = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        self.inspector_html = (PROJECT_DIR / "inspector.html").read_text(encoding="utf-8")
        self.js = (PROJECT_DIR / "cheat_harness.js").read_text(encoding="utf-8")
        self.main_py = (PROJECT_DIR / "main.py").read_text(encoding="utf-8")

    def test_top_menubar_removed_from_index_html(self):
        """Top menubar (.classic-menubar) must not be rendered in the body of index.html."""
        # Menubar div should NOT be in index.html body
        self.assertNotIn('<div class="classic-menubar">', self.html)
        self.assertNotIn('<span>파일(F)</span>', self.html)
        self.assertNotIn('<span>도움말(H)</span>', self.html)

    def test_authentic_flash_context_menu_dom(self):
        """Flash context menu must include all authentic items plus toolbar and undock controls."""
        self.assertIn('id="flash-context-menu"', self.html)
        self.assertIn('id="flash-ctx-chk-toolbar"', self.html)
        self.assertIn('id="flash-ctx-label-undock"', self.html)
        self.assertIn("Harness.toggleToolbarCheckbox()", self.html)
        self.assertIn("Harness.toggleUndockInspector()", self.html)
        self.assertIn("Harness.flashZoom(1.25)", self.html)
        self.assertIn("Harness.flashZoom(0.8)", self.html)
        self.assertIn("Harness.flashZoom(1.0)", self.html)
        self.assertIn("Harness.togglePause()", self.html)
        self.assertIn("Harness.flashRewind()", self.html)
        self.assertIn("Harness.stepFrame()", self.html)
        self.assertIn("Harness.setFlashQuality('high')", self.html)
        self.assertIn("Harness.toggleFullscreen()", self.html)

    def test_flash_context_menu_capture_interception(self):
        """Context menu event must use capturing phase (true) to bypass game right-click lockouts."""
        self.assertIn("window.addEventListener('contextmenu', (e) => {", self.js)
        self.assertIn("e.stopPropagation()", self.js)
        self.assertIn("this.showFlashContextMenu(e.clientX, e.clientY)", self.js)
        self.assertIn("}, true);", self.js)

    def test_native_os_window_create_window_pyqt(self):
        """main.py must implement CustomWebPage.createWindow creating independent QMainWindow and handling window close."""
        self.assertIn("class CustomWebPage(QWebEnginePage):", self.main_py)
        self.assertIn("def createWindow(self, type_):", self.main_py)
        self.assertIn("popup_win = QMainWindow()", self.main_py)
        self.assertIn("popup_view = QWebEngineView(popup_win)", self.main_py)
        self.assertIn("popup_page.windowCloseRequested.connect(popup_win.close)", self.main_py)
        self.assertIn("popup_win.show()", self.main_py)

    def test_inspector_html_opener_binding(self):
        """inspector.html must bind seamlessly to window.opener.Harness and forward commands."""
        self.assertIn("getOpenerHarness()", self.inspector_html)
        self.assertIn("delegateCall(methodName, ...args)", self.inspector_html)
        self.assertIn("h.bindInspectorWindow(window)", self.inspector_html)
        self.assertIn("h.onInspectorWindowClosed()", self.inspector_html)
        self.assertIn("dockBack()", self.inspector_html)

    def test_tab2_cheat_records_logic_contract(self):
        """cheat_harness.js must implement all Cheat Table CRUD & Freeze operations."""
        methods = [
            "addOrUpdateCheatRecord(key, val, defaultName)",
            "_renderCheatRecords()",
            "renameCheatRecord(id)",
            "editCheatRecordValue(id)",
            "quickSetCheatRecordValue(id, val)",
            "toggleFreezeCheatRecord(id)",
            "deleteCheatRecord(id)",
            "promptAddCustomCheatRecord()",
        ]
        for m in methods:
            self.assertIn(m, self.js, f"Missing Tab 2 method: {m}")

    def test_tab2_table_dom_elements(self):
        """Cheat records table body must exist in index.html and inspector.html."""
        self.assertIn('id="cheat-records-tbody"', self.html)
        self.assertIn('id="cheat-records-tbody"', self.inspector_html)

    def test_interactive_demo_methods_contract(self):
        """Interactive test sandbox demo methods must exist in cheat_harness.js."""
        demo_methods = [
            "demoTakeDamage(dmg = 15)",
            "demoHeal(amt = 20)",
            "demoAddGold(amt = 100)",
            "demoSpendGold(amt = 120)",
            "toggleDemoAutoCombat()",
        ]
        for dm in demo_methods:
            self.assertIn(dm, self.js, f"Missing demo interaction method: {dm}")

    def test_inspector_window_closing_on_dock(self):
        """dockInspector must explicitly close the separated popup window."""
        self.assertIn("targetWin = this.inspectorWindow", self.js)
        self.assertIn("targetWin.close()", self.js)
        self.assertIn("this.hideFlashContextMenu()", self.js)

    def test_js_syntax_integrity(self):
        """cheat_harness.js brace and parenthesis balance test."""
        self.assertEqual(self.js.count("{"), self.js.count("}"))
        self.assertEqual(self.js.count("("), self.js.count(")"))

    def test_spacebar_not_intercepted_by_harness(self):
        """Spacebar must not be captured or bound as pause hotkey so games receive all jump/action input."""
        self.assertNotIn("case ' ':", self.js)
        self.assertNotIn("Resume (Space)", self.js)
        self.assertNotIn("Pause (Space)", self.js)
        self.assertNotIn("F1 / Space", self.html)


if __name__ == "__main__":
    unittest.main()
