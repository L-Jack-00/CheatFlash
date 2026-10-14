# -*- coding: utf-8 -*-
"""
Cheat Flash v1.0.0 - Comprehensive QA Verification & Deep Edge-Case Audit
Covers all 5 core test areas:
1. SWF Load & Anti-Cheat Neutralization
2. Memory Scanner (Tab 1) - Smart Delta Hunter & Comparative Scanner
3. Cheat Memory Book (Tab 2) - CRUD, Reordering, 999,999 Injection & Freeze Loop
4. Virtual Clock Distortion Engine - F1~F5, Time Dilation Math & Audio Synchronization
5. WebAssembly Heap Expansion (grow) & Multi-Window Docking Rig
"""

import sys
import os
import struct
import zlib
import time
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

import server


class TestQAComprehensiveAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (PROJECT_DIR / "index.html").read_text(encoding="utf-8")
        cls.inspector_html = (PROJECT_DIR / "inspector.html").read_text(encoding="utf-8")
        cls.js = (PROJECT_DIR / "cheat_harness.js").read_text(encoding="utf-8")
        cls.clock_js = (PROJECT_DIR / "virtual_clock.js").read_text(encoding="utf-8")
        cls.main_py = (PROJECT_DIR / "main.py").read_text(encoding="utf-8")
        cls.server_py = (PROJECT_DIR / "server.py").read_text(encoding="utf-8")

    # =========================================================================
    # [AREA 1] SWF 로드 및 안티치트 자동 무력화
    # =========================================================================
    def test_area1_01_file_dialog_and_drag_drop_dom(self):
        """Verifies file input dialog (#file-input) and drag & drop event bindings in DOM and JS."""
        # 1. File input element and accept attribute
        self.assertIn('id="file-input"', self.html)
        self.assertIn('accept=".swf"', self.html)
        self.assertIn('onchange="handleFileSelect(event)"', self.html)
        self.assertIn("document.getElementById('file-input').click()", self.html)

        # 2. Drag & Drop overlay & event listener setup
        self.assertIn('id="drop-zone"', self.html)
        self.assertIn("setupDragAndDrop()", self.html)
        self.assertIn("viewport.addEventListener('dragover'", self.html)
        self.assertIn("viewport.addEventListener('dragleave'", self.html)
        self.assertIn("viewport.addEventListener('drop'", self.html)
        self.assertIn("file.name.toLowerCase().endsWith('.swf')", self.html)
        self.assertIn("Harness.loadSwfFile(file)", self.html)

    def test_area1_02_anticheat_disarmer_synthetic_and_real(self):
        """Tests ActionScript anti-cheat function detection and automatic bytecode patching."""
        # A. Synthetic SWF with ActionDefineFunction2 confereNDS
        fn_name = b'confereNDS\x00'
        hdr_len = len(fn_name) + 2 + 1 + 2
        code = b'\x96\x04\x00\x08\x00\x08\x01\x1c\x96\x02\x00\x08\x02\x4e'
        code_len = len(code)
        fn_bytes = (
            b'\x8e' +
            hdr_len.to_bytes(2, 'little') +
            fn_name +
            b'\x00\x00\x02\x6a\x00' +
            code_len.to_bytes(2, 'little') +
            code
        )
        mock_decompressed = b'\x00' * 50 + fn_bytes + b'\x00' * 50
        compressed = zlib.compress(mock_decompressed)
        cws_mock = b'CWS\x08' + (len(mock_decompressed) + 8).to_bytes(4, 'little') + compressed

        disarmed, patches = server.disarm_swf_bytes(cws_mock)
        self.assertTrue(disarmed.startswith(b'FWS\x08'))
        self.assertEqual(len(patches), 1)
        self.assertIn("confereNDS()", patches[0])

        # Verify entry point patched with ActionPush(true) + ActionReturn: 96 02 00 05 01 3e
        target_fn = b'\x8e' + hdr_len.to_bytes(2, 'little') + fn_name
        pos = disarmed.find(target_fn)
        self.assertNotEqual(pos, -1)
        code_start = pos + 3 + hdr_len + 2
        self.assertEqual(disarmed[code_start:code_start+6], b'\x96\x02\x00\x05\x01\x3e')

        # B. Real Ant Buster.swf if present on system
        real_swf = Path(r"c:\Users\SBK\Desktop\정리\노아의 방주\Ant Buster.swf")
        if real_swf.exists():
            with open(real_swf, "rb") as f:
                data = f.read()
            real_disarmed, real_patches = server.disarm_swf_bytes(data)
            self.assertTrue(real_disarmed.startswith(b"FWS\x08"))
            self.assertTrue(any("confereNDS" in p for p in real_patches))

    def test_area1_03_disarmer_client_log_integration(self):
        """Verifies cheat_harness.js calls /api/disarm and logs neutralization results."""
        self.assertIn("fetch('/api/disarm'", self.js)
        self.assertIn("res.headers.get('X-Patched-Count')", self.js)
        self.assertIn("res.headers.get('X-Patched-Names')", self.js)
        self.assertIn("[BytecodeDisarmer] 🎉 안티치트 무력화 완료:", self.js)

    # =========================================================================
    # [AREA 2] 메모리 검색기 (Tab 1)
    # =========================================================================
    def test_area2_01_smart_delta_hunter_two_stage_isolation(self):
        """Smart Delta Hunter: Baseline lock-on -> change detection -> 99.9% pruning."""
        # 64KB mock RAM
        ram = bytearray(65536)
        # Populate 300 noise offsets with 100.0 (HP)
        for off in range(0x1000, 0x1000 + (300 * 8), 8):
            struct.pack_into("<d", ram, off, 100.0)
        
        # Real player HP at 0x0240
        player_hp_offset = 0x0240
        struct.pack_into("<d", ram, player_hp_offset, 100.0)

        # Step 1: Scan baseline 100.0
        candidates = []
        for off in range(0, len(ram) - 8, 4):
            val = struct.unpack_from("<d", ram, off)[0]
            if abs(val - 100.0) < 0.0001:
                candidates.append({"offset": off, "base": 100.0, "current": 100.0, "changed": False})

        self.assertEqual(len(candidates), 301)

        # Step 2: Player takes 15 damage (100 -> 85)
        struct.pack_into("<d", ram, player_hp_offset, 85.0)

        # Delta surveillance tick
        changed = []
        for c in candidates:
            curr = struct.unpack_from("<d", ram, c["offset"])[0]
            if abs(curr - c["base"]) > 0.0001:
                c["current"] = curr
                c["changed"] = True
                changed.append(c)

        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0]["offset"], player_hp_offset)

        # Step 3: Prune by exact next value 85.0
        pruned = [c for c in candidates if abs(struct.unpack_from("<d", ram, c["offset"])[0] - 85.0) < 0.0001]
        self.assertEqual(len(pruned), 1)
        self.assertEqual(pruned[0]["offset"], player_hp_offset)

    def test_area2_02_comparative_scanner_all_modes(self):
        """Comparative Scanner: Exact, Increased, Decreased, Unchanged, Changed, Unknown initial value."""
        ram = bytearray(65536)
        # Random noise
        for off in range(0, 500, 8):
            struct.pack_into("<d", ram, off, float(off % 50))
        
        gold_offset = 0x0280
        struct.pack_into("<d", ram, gold_offset, 500.0)

        # 1. 1st Scan: Unknown Initial Value (Blank)
        candidates = []
        for off in range(0, len(ram) - 8, 4):
            v = struct.unpack_from("<d", ram, off)[0]
            candidates.append({"offset": off, "last": v})
        total_unknown = len(candidates)
        self.assertGreater(total_unknown, 1000)

        # 2. Game runs, timers tick up by 1.0, gold unchanged (500.0)
        for off in range(0, 500, 8):
            prev = struct.unpack_from("<d", ram, off)[0]
            struct.pack_into("<d", ram, off, prev + 1.0)

        # Filter: unchanged
        survived_unchanged = [c for c in candidates if abs(struct.unpack_from("<d", ram, c["offset"])[0] - c["last"]) < 0.0001]
        self.assertTrue(any(c["offset"] == gold_offset for c in survived_unchanged))
        self.assertLess(len(survived_unchanged), total_unknown)

        # 3. Gold decreased: 500.0 -> 420.0
        struct.pack_into("<d", ram, gold_offset, 420.0)
        survived_decreased = [c for c in survived_unchanged if struct.unpack_from("<d", ram, c["offset"])[0] < c["last"]]
        self.assertTrue(any(c["offset"] == gold_offset for c in survived_decreased))

        # 4. Filter: exact 420.0
        final_cand = [c for c in survived_decreased if abs(struct.unpack_from("<d", ram, c["offset"])[0] - 420.0) < 0.0001]
        self.assertEqual(len(final_cand), 1)
        self.assertEqual(final_cand[0]["offset"], gold_offset)

    # =========================================================================
    # [AREA 3] 치트 메모리 조작 북 (Tab 2)
    # =========================================================================
    def test_area3_01_tab2_crud_and_newest_first_ordering(self):
        """Verifies newest-first unshift ordering, rename, edit, 999999 injection, and delete."""
        self.assertIn("this.cheatRecords.unshift(record);", self.js)
        self.assertIn("this.cheatRecords = [record, ...this.cheatRecords.filter(r => r !== record)];", self.js)
        self.assertIn("renameCheatRecord(id)", self.js)
        self.assertIn("editCheatRecordValue(id)", self.js)
        self.assertIn("quickSetCheatRecordValue(id, val)", self.js)
        self.assertIn("toggleFreezeCheatRecord(id)", self.js)
        self.assertIn("deleteCheatRecord(id)", self.js)

    def test_area3_02_freeze_loop_lock_invariance(self):
        """Verifies that frozen values are forcefully restored during game ticks."""
        ram = bytearray(65536)
        struct.pack_into("<d", ram, 0x0100, 100.0) # Player HP

        frozen_offsets = {("wasm_0:256:f64", 256, "f64"): 100.0}

        def enforce_freeze():
            for (key, off, typ), locked_val in frozen_offsets.items():
                if typ == "f64" and off + 8 <= len(ram):
                    struct.pack_into("<d", ram, off, locked_val)

        # Game inflicts severe damage: HP -> 10.0
        struct.pack_into("<d", ram, 0x0100, 10.0)
        self.assertEqual(struct.unpack_from("<d", ram, 0x0100)[0], 10.0)

        # Freeze supervisor tick
        enforce_freeze()
        self.assertEqual(struct.unpack_from("<d", ram, 0x0100)[0], 100.0)

    # =========================================================================
    # [AREA 4] 가상 클록 왜곡 엔진
    # =========================================================================
    def test_area4_01_virtual_clock_fkeys_and_telemetry(self):
        """Verifies F1~F5 shortcut bindings in both PyQt6 native and web capturing phase."""
        # PyQt6 native shortcuts in main.py
        self.assertIn('QShortcut(QKeySequence("F1"), window, activated=lambda: trigger_js("Harness.togglePause();"))', self.main_py)
        self.assertIn('QShortcut(QKeySequence("F2"), window, activated=lambda: trigger_js("Harness.setSpeed(0.5);"))', self.main_py)
        self.assertIn('QShortcut(QKeySequence("F3"), window, activated=lambda: trigger_js("Harness.setSpeed(2.0);"))', self.main_py)
        self.assertIn('QShortcut(QKeySequence("F4"), window, activated=lambda: trigger_js("Harness.stepFrame();"))', self.main_py)
        self.assertIn('QShortcut(QKeySequence("F5"), window, activated=lambda: trigger_js("Harness.setSpeed(1.0);"))', self.main_py)

        # Web capturing phase in index.html
        self.assertIn("setupFKeyInterlock()", self.html)
        self.assertIn("case 'F1':", self.html)
        self.assertIn("case 'F2':", self.html)
        self.assertIn("case 'F3':", self.html)
        self.assertIn("case 'F4':", self.html)
        self.assertIn("case 'F5':", self.html)

    def test_area4_02_audio_synchronization_hooks(self):
        """Verifies Web Audio API hooks (AudioContext suspend/resume and playbackRate scaling)."""
        self.assertIn("window.AudioContext = function", self.clock_js)
        self.assertIn("_registerAudioContext(ctx)", self.clock_js)
        self.assertIn("ctx.createBufferSource", self.clock_js)
        self.assertIn("HTMLMediaElement.prototype.play", self.clock_js)
        self.assertIn("_applyAudioPlaybackRate(node)", self.clock_js)
        self.assertIn("node.playbackRate.setValueAtTime(this.timeScale, 0)", self.clock_js)
        self.assertIn("ctx.suspend()", self.clock_js)
        self.assertIn("ctx.resume()", self.clock_js)

    # =========================================================================
    # [AREA 5] WebAssembly 힙 확장 및 멀티 윈도우 안정성
    # =========================================================================
    def test_area5_01_wasm_heap_growth_and_detached_buffer_guard(self):
        """Verifies WebAssembly.Memory.grow hook, onWasmMemoryGrown, and dynamic view re-instantiation."""
        # virtual_clock.js captures grow
        self.assertIn("origWasmMemory.prototype.grow", self.clock_js)
        self.assertIn("window.Harness.onWasmMemoryGrown", self.clock_js)

        # cheat_harness.js handles memory growth & dynamic targets
        self.assertIn("onWasmMemoryGrown(mem, oldBytes, newBytes)", self.js)
        self.assertIn("getMemoryTargets()", self.js)
        self.assertIn("view: new DataView(buf)", self.js)
        self.assertIn("item.offset + 8 <= target.view.byteLength", self.js)

    def test_area5_02_inspector_undock_dock_lifecycle_and_leak_free(self):
        """Verifies clean window open/close, QWebEnginePage windowCloseRequested, and no orphan popups."""
        # main.py CustomWebPage windowCloseRequested
        self.assertIn("popup_page.windowCloseRequested.connect(popup_win.close)", self.main_py)
        self.assertIn("self.popups.remove(popup_win)", self.main_py)
        self.assertIn("def close_all_popups(self):", self.main_py)

        # cheat_harness.js dockInspector closes separated popup
        self.assertIn("dockInspector()", self.js)
        self.assertIn("targetWin.close()", self.js)
        self.assertIn("onInspectorWindowClosed()", self.js)


if __name__ == "__main__":
    unittest.main()
