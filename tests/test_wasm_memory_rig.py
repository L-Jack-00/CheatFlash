# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.2.0
Test: True WebAssembly Linear Memory Binary Scanner & Direct Poking Rig
"""

import struct
import sys
import unittest

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class WasmMemoryScannerSimulator:
    """Python simulation of the True WebAssembly Linear Memory Binary Scanner."""

    def __init__(self, size_bytes: int = 65536):
        self.buffer = bytearray(size_bytes)
        self.frozen_offsets = {}  # (offset, type) -> locked_val

    def write_f64(self, offset: int, value: float):
        struct.pack_into("<d", self.buffer, offset, value)

    def read_f64(self, offset: int) -> float:
        return struct.unpack_from("<d", self.buffer, offset)[0]

    def write_i32(self, offset: int, value: int):
        struct.pack_into("<i", self.buffer, offset, value)

    def read_i32(self, offset: int) -> int:
        return struct.unpack_from("<i", self.buffer, offset)[0]

    def scan_number(self, target_val: float) -> list[dict]:
        results = []
        byte_len = len(self.buffer)

        # 1. Scan Float64 (8 bytes, Little Endian)
        for offset in range(0, byte_len - 8, 4):
            val = self.read_f64(offset)
            if abs(val - target_val) < 0.0001:
                results.append({
                    "offset": offset,
                    "hex": f"0x{offset:06X}",
                    "type": "f64",
                    "value": val
                })

        # 2. Scan Int32 if target is integer
        if target_val.is_integer():
            int_val = int(target_val)
            for offset in range(0, byte_len - 4, 4):
                val = self.read_i32(offset)
                if val == int_val:
                    results.append({
                        "offset": offset,
                        "hex": f"0x{offset:06X}",
                        "type": "i32",
                        "value": val
                    })

        return results

    def freeze_offset(self, offset: int, val_type: str, locked_val: float):
        self.frozen_offsets[(offset, val_type)] = locked_val
        if val_type == "f64":
            self.write_f64(offset, locked_val)
        elif val_type == "i32":
            self.write_i32(offset, int(locked_val))

    def enforce_freeze(self):
        for (offset, val_type), locked_val in self.frozen_offsets.items():
            if val_type == "f64":
                self.write_f64(offset, locked_val)
            elif val_type == "i32":
                self.write_i32(offset, int(locked_val))


class TestWasmMemoryRig(unittest.TestCase):
    def setUp(self):
        self.scanner = WasmMemoryScannerSimulator(65536)
        # Place Flash player.hp at 0x0100 (Float64: 100.0)
        self.scanner.write_f64(0x0100, 100.0)
        # Place Flash player.gold at 0x0200 (Float64: 500.0)
        self.scanner.write_f64(0x0200, 500.0)
        # Place Flash player.score at 0x0300 (Int32: 1240)
        self.scanner.write_i32(0x0300, 1240)

    def test_scan_float64_flash_number(self):
        """Scanning 100.0 should find the exact offset 0x0100 in binary WASM memory."""
        results = self.scanner.scan_number(100.0)
        matched_offsets = [r["offset"] for r in results if r["type"] == "f64"]
        self.assertIn(0x0100, matched_offsets)

    def test_direct_memory_poking(self):
        """Overwriting offset 0x0200 with 999999.0 must mutate the binary buffer directly."""
        self.scanner.write_f64(0x0200, 999999.0)
        self.assertEqual(self.scanner.read_f64(0x0200), 999999.0)

    def test_freeze_loop_lock(self):
        """When an offset is frozen, external game mutations must be reverted."""
        self.scanner.freeze_offset(0x0100, "f64", 100.0)

        # Game inflicts damage: hp becomes 30.0
        self.scanner.write_f64(0x0100, 30.0)
        self.assertEqual(self.scanner.read_f64(0x0100), 30.0)

        # Tick enforces freeze
        self.scanner.enforce_freeze()
        self.assertEqual(self.scanner.read_f64(0x0100), 100.0)


if __name__ == "__main__":
    unittest.main()
