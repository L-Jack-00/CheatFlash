# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.0.0
Test: Architectural Optimization Verification (CSS Single Source of Truth, Zero-Thrash Live Value Updates, Universal Freeze Enforcement & UX Copy Audit)
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


class TestArchitectureOptimization(unittest.TestCase):
    def setUp(self):
        self.html = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        self.css = (PROJECT_DIR / "style.css").read_text(encoding="utf-8")
        self.js = (PROJECT_DIR / "cheat_harness.js").read_text(encoding="utf-8")
        self.main_py = (PROJECT_DIR / "main.py").read_text(encoding="utf-8")

    def test_css_single_source_of_truth_no_duplicate_inline_style(self):
        """index.html must not contain massive duplicate <style> blocks; style.css must be the authoritative stylesheet."""
        self.assertNotIn("<!-- Embedded Atomic Styles", self.html)
        self.assertNotIn(":root {", self.html)
        self.assertIn('<link rel="stylesheet" href="style.css?v=2.2.0">', self.html)
        # All required layout rules must exist in style.css
        self.assertIn(".classic-toolbar", self.css)
        self.assertIn(".workspace-container", self.css)
        self.assertIn(".inspector-panel", self.css)
        self.assertIn(".sandbox-control-bar", self.css)

    def test_telemetry_throttling_and_zero_gc_in_place_updates(self):
        """cheat_harness.js must throttle telemetry to 10 FPS (100ms) and perform in-place live value updates without innerHTML thrashing."""
        self.assertIn("_lastTelemetryTime", self.js)
        self.assertIn("_updateCheatRecordsLiveValues()", self.js)
        self.assertIn("cheat-val-${item.id}", self.js)
        self.assertIn("el.textContent = formattedVal", self.js)

    def test_universal_memory_freeze_loop(self):
        """_enforceFrozenVariables must be hooked into the supervisor telemetry loop so it holds freezes for real SWF games as well as sandbox."""
        self.assertIn("this._enforceFrozenVariables();", self.js)
        # Must have zero-load early exit guard
        self.assertIn("if (this.wasmFrozenOffsets.size === 0 && this.frozenVariables.size === 0) return;", self.js)

    def test_blackboard_render_caching(self):
        """_renderBlackboardTable must cache rendering by hash to eliminate redundant DOM rebuilds."""
        self.assertIn("this._lastBlackboardHash", self.js)

    def test_ux_copy_audit_zero_violations(self):
        """User-facing strings must be clean and free of internal developer jargon."""
        self.assertNotIn("Universal Flash Runtime Harness", self.html)
        self.assertNotIn("Universal Flash Runtime Harness", self.main_py)
        self.assertIn("플래시 치트 & 스피드", self.html)
        self.assertIn("플래시 게임 치트 & 스피드", self.main_py)

    def test_wasm_heap_growth_and_detached_buffer_guard(self):
        """WebAssembly.Memory.grow hook and detached buffer guards must be implemented."""
        clock_js = (PROJECT_DIR / "virtual_clock.js").read_text(encoding="utf-8")
        self.assertIn("origWasmMemory.prototype.grow", clock_js)
        self.assertIn("window.Harness.onWasmMemoryGrown", clock_js)
        self.assertIn("onWasmMemoryGrown(mem, oldBytes, newBytes)", self.js)
        self.assertIn("item.offset + 8 <= target.view.byteLength", self.js)

    def test_multi_monitor_geometry_persistence(self):
        """Inspector window geometry must be persisted via QSettings in PyQt6 and localStorage in browser."""
        self.assertIn("QSettings(\"CheatFlash\", \"InspectorWindow\")", self.main_py)
        self.assertIn("popup_win.restoreGeometry(saved_geom)", self.main_py)
        self.assertIn("settings.setValue(\"geometry\", popup_win.saveGeometry())", self.main_py)
        self.assertIn("localStorage.getItem('cheat_inspector_geom')", self.js)
        inspector_html = (PROJECT_DIR / "inspector.html").read_text(encoding="utf-8")
        self.assertIn("localStorage.setItem('cheat_inspector_geom'", inspector_html)

    def test_scanner_subsegment_toggle_and_table_expansion(self):
        """Tab 1 must feature sub-segment toggle switch and 400px+ expanded tables in both index.html and inspector.html."""
        inspector_html = (PROJECT_DIR / "inspector.html").read_text(encoding="utf-8")
        
        # CSS check
        self.assertIn(".sub-segment-bar", self.css)
        self.assertIn(".sub-segment-btn", self.css)
        self.assertIn(".sub-segment-panel", self.css)
        
        # index.html check
        self.assertIn("sub-segment-bar", self.html)
        self.assertIn("subseg-btn-hunter", self.html)
        self.assertIn("subseg-btn-scanner", self.html)
        self.assertIn("subseg-panel-hunter", self.html)
        self.assertIn("subseg-panel-scanner", self.html)
        self.assertIn("min-height: 400px", self.html)
        
        # inspector.html check
        self.assertIn("sub-segment-bar", inspector_html)
        self.assertIn("subseg-btn-hunter", inspector_html)
        self.assertIn("subseg-btn-scanner", inspector_html)
        self.assertIn("subseg-panel-hunter", inspector_html)
        self.assertIn("subseg-panel-scanner", inspector_html)
        self.assertIn("min-height: 400px", inspector_html)
        self.assertIn("switchScannerSubSegment", inspector_html)
        
        # JS method and state
        self.assertIn("this.scannerSubSegment = 'hunter';", self.js)
        self.assertIn("switchScannerSubSegment(segmentName)", self.js)

    def test_cf_obs_01_utf8_encoding_safety_net(self):
        """[CF-OBS-01] Every python file in the project must have the UTF-8 stdout & stderr safety net."""
        for py_path in PROJECT_DIR.rglob("*.py"):
            code = py_path.read_text(encoding="utf-8")
            self.assertIn(
                'sys.stdout.reconfigure(encoding="utf-8", errors="replace")',
                code,
                f"Missing stdout UTF-8 safety net in {py_path.name}"
            )
            self.assertIn(
                'sys.stderr.reconfigure(encoding="utf-8", errors="replace")',
                code,
                f"Missing stderr UTF-8 safety net in {py_path.name}"
            )


if __name__ == "__main__":
    unittest.main()
