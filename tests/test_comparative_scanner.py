# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.4.0
Test: Cheat Engine-Grade Comparative Value Scanner & Unknown Initial Value Rig
"""

import struct
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


class ComparativeScannerSimulator:
    def __init__(self, size_bytes: int = 65536):
        self.buffer = bytearray(size_bytes)
        self.candidates = []
        self.is_active = False

    def write_f64(self, offset: int, val: float):
        struct.pack_into("<d", self.buffer, offset, val)

    def read_f64(self, offset: int) -> float:
        return struct.unpack_from("<d", self.buffer, offset)[0]

    def run_first_scan_unknown(self) -> int:
        """Captures snapshot of all valid Float64 numbers in RAM."""
        self.candidates = []
        for offset in range(0, len(self.buffer) - 8, 4):
            val = self.read_f64(offset)
            self.candidates.append({
                "offset": offset,
                "initial_val": val,
                "last_val": val,
                "current_val": val
            })
        self.is_active = True
        return len(self.candidates)

    def run_next_scan(self, scan_type: str, exact_val: float = None) -> list[dict]:
        pruned = []
        for c in self.candidates:
            curr = self.read_f64(c["offset"])
            matches = False
            if scan_type == "unchanged":
                matches = abs(curr - c["last_val"]) < 0.0001
            elif scan_type == "changed":
                matches = abs(curr - c["last_val"]) >= 0.0001
            elif scan_type == "decreased":
                matches = curr < c["last_val"]
            elif scan_type == "increased":
                matches = curr > c["last_val"]
            elif scan_type == "exact" and exact_val is not None:
                matches = abs(curr - exact_val) < 0.0001

            if matches:
                c["last_val"] = curr
                c["current_val"] = curr
                pruned.append(c)

        self.candidates = pruned
        return pruned


class TestComparativeScanner(unittest.TestCase):
    def setUp(self):
        self.scanner = ComparativeScannerSimulator(65536)
        # Populate RAM with fluctuating timers and coordinates
        for off in range(0, 1000, 8):
            self.scanner.write_f64(off, float(off % 100))

        # Obfuscated / Encrypted Gold at offset 0x0280 (starts at 500.0)
        self.gold_offset = 0x0280
        self.scanner.write_f64(self.gold_offset, 500.0)

    def test_unknown_initial_value_scan_and_noise_pruning(self):
        """
        Step 1: Unknown initial value scan captures all RAM offsets.
        Step 2: When game runs and timers change, 'unchanged' eliminates fluctuating offsets.
        Step 3: When player spends 50 gold (500 -> 450), 'decreased' isolates the exact gold offset.
        """
        total = self.scanner.run_first_scan_unknown()
        self.assertGreater(total, 500)

        # Timers fluctuate in RAM
        for off in range(0, 500, 8):
            prev = self.scanner.read_f64(off)
            self.scanner.write_f64(off, prev + 1.0)
        # Gold is unchanged (500.0)

        # Filter: unchanged
        survived_unchanged = self.scanner.run_next_scan("unchanged")
        self.assertLess(len(survived_unchanged), total)
        self.assertTrue(any(c["offset"] == self.gold_offset for c in survived_unchanged))

        # Player spends 50 gold (500 -> 450)
        self.scanner.write_f64(self.gold_offset, 450.0)

        # Filter: decreased
        survived_decreased = self.scanner.run_next_scan("decreased")
        self.assertTrue(any(c["offset"] == self.gold_offset for c in survived_decreased))

        # Filter: exact 450.0
        final_candidates = self.scanner.run_next_scan("exact", exact_val=450.0)
        self.assertEqual(len(final_candidates), 1)
        self.assertEqual(final_candidates[0]["offset"], self.gold_offset)


if __name__ == "__main__":
    unittest.main()
