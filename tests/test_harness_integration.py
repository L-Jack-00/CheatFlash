# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.0.0
Test: Comprehensive Integration & Static DOM/Resource Integrity Test
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


class TestCheatFlashIntegrity(unittest.TestCase):
    def test_required_files_exist(self):
        """All critical runtime assets must exist in the root."""
        required = [
            "index.html",
            "style.css",
            "virtual_clock.js",
            "cheat_harness.js",
            "main.py",
            "server.py",
        ]
        for name in required:
            path = PROJECT_DIR / name
            self.assertTrue(path.exists(), f"Missing required file: {name}")

    def test_html_dom_ids_match_js_contracts(self):
        """Every ID referenced in cheat_harness.js must exist in index.html."""
        html_content = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        required_dom_ids = [
            "viewport-container",
            "player-viewport",
            "drop-zone",
            "btn-pause",
            "speed-slider",
            "speed-label",
            "metric-vtime",
            "metric-rtime",
            "metric-scale",
            "metric-fps",
            "blackboard-tbody",
            "scanner-tbody",
            "scan-val-input",
            "scan-type-select",
            "hunter-base-input",
            "hunter-next-input",
            "hunter-status-msg",
            "delta-hunter-tbody",
            "cheat-console-logs",
            "current-game-title",
            "game-status-badge",
            "status-text",
        ]
        for dom_id in required_dom_ids:
            self.assertIn(
                f'id="{dom_id}"',
                html_content,
                f"Contract violation: ID [{dom_id}] not found in index.html",
            )

    def test_virtual_clock_contract(self):
        """virtual_clock.js must export window.VirtualClock, timing intercepts, and audio hooks."""
        clock_js = (PROJECT_DIR / "virtual_clock.js").read_text(encoding="utf-8")
        self.assertIn("root.VirtualClock = new VirtualClockEngine()", clock_js)
        self.assertIn("window.performance.now", clock_js)
        self.assertIn("window.requestAnimationFrame", clock_js)
        self.assertIn("window.setTimeout", clock_js)
        self.assertIn("_syncAllAudio", clock_js)
        self.assertIn("AudioContext", clock_js)

    def test_retro_styling_tone_contract(self):
        """CSS must implement the Retro 2000s Classic Luna/Silver Flash theme."""
        css = (PROJECT_DIR / "style.css").read_text(encoding="utf-8")
        self.assertIn("--win-bg: #ECE9D8", css)
        self.assertIn("--flash-red: #EE3124", css)
        self.assertIn(".classic-menubar", css)
        self.assertIn(".classic-toolbar", css)
        self.assertIn(".btn-classic", css)

    def test_harness_js_syntax_and_export_contract(self):
        """[Regression Test BUG-JS-SYNTAX-01] Ensure cheat_harness.js has valid syntax and exports root.Harness."""
        harness_js = (PROJECT_DIR / "cheat_harness.js").read_text(encoding="utf-8")
        # Ensure root export
        self.assertIn("root.Harness = new CheatHarness()", harness_js)
        # Ensure log method exists
        self.assertIn("log(msg) {", harness_js)
        # Ensure brace and paren balance
        self.assertEqual(harness_js.count("{"), harness_js.count("}"))
        self.assertEqual(harness_js.count("("), harness_js.count(")"))

    def test_context_menu_and_undock_dom_contract(self):
        """Right-click context menu and undockable floating inspector DOM must exist."""
        html_content = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        for dom_id in [
            "retro-context-menu",
            "ctx-chk-toolbar",
            "ctx-label-undock",
            "btn-undock",
            "inspector-drag-handle",
            "inspector-panel",
        ]:
            self.assertIn(f'id="{dom_id}"', html_content, f"Missing UI element: {dom_id}")

    def test_3tab_layout_dom_contract(self):
        """3-tab navigation buttons and respective pages must exist in index.html."""
        html_content = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        for tab_id in [
            "tab-btn-scanner",
            "tab-btn-cheats",
            "tab-btn-logs",
            "page-scanner",
            "page-cheats",
            "page-logs",
        ]:
            self.assertIn(f'id="{tab_id}"', html_content, f"Missing tab element: {tab_id}")

    def test_harness_ui_methods_contract(self):
        """cheat_harness.js must implement all UI ergonomics, context menu, and undock methods."""
        harness_js = (PROJECT_DIR / "cheat_harness.js").read_text(encoding="utf-8")
        methods = [
            "switchTab(tabName)",
            "toggleToolbar(visible)",
            "toggleToolbarCheckbox()",
            "toggleUndockInspector()",
            "showContextMenu(x, y)",
            "hideContextMenu()",
            "_setupContextMenuAndDrag()",
        ]
        for method in methods:
            self.assertIn(method, harness_js, f"Missing UI method: {method}")


if __name__ == "__main__":
    unittest.main()
