# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.3.0
Test: Smart Delta Hunter Engine (Live Delta Watcher & 99.9% Candidate Pruning Rig)
"""

import struct
import sys
import unittest

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class SmartDeltaHunterSimulator:
    """Python simulation of the Smart Delta Hunter Engine."""

    def __init__(self, size_bytes: int = 131072):
        self.buffer = bytearray(size_bytes)
        self.candidates = []  # [{ offset, base_val, last_val, delta_count, is_match }]
        self.is_hunting = False

    def write_f64(self, offset: int, value: float):
        struct.pack_into("<d", self.buffer, offset, value)

    def read_f64(self, offset: int) -> float:
        return struct.unpack_from("<d", self.buffer, offset)[0]

    def lock_on_baseline(self, base_val: float) -> int:
        """Step 1: Scans all offsets having base_val (e.g. 100.0)."""
        self.candidates = []
        byte_len = len(self.buffer)
        for offset in range(0, byte_len - 8, 4):
            val = self.read_f64(offset)
            if abs(val - base_val) < 0.0001:
                self.candidates.append({
                    "offset": offset,
                    "hex": f"0x{offset:06X}",
                    "base_val": base_val,
                    "last_val": base_val,
                    "changed": False
                })
        self.is_hunting = True
        return len(self.candidates)

    def tick_live_delta(self) -> list[dict]:
        """Step 2: Real-time delta surveillance tick. Detects which candidate changed value."""
        changed_targets = []
        for c in self.candidates:
            curr_val = self.read_f64(c["offset"])
            if abs(curr_val - c["base_val"]) > 0.0001:
                c["last_val"] = curr_val
                c["changed"] = True
                changed_targets.append(c)

        # Sort: changed items first
        self.candidates.sort(key=lambda x: 0 if x["changed"] else 1)
        return changed_targets

    def prune_by_exact_next_value(self, target_next_val: float) -> list[dict]:
        """Step 3: Prune down candidates to only those matching target_next_val exactly."""
        pruned = []
        for c in self.candidates:
            curr_val = self.read_f64(c["offset"])
            if abs(curr_val - target_next_val) < 0.0001:
                c["last_val"] = curr_val
                c["changed"] = True
                pruned.append(c)
        self.candidates = pruned
        return pruned


    def lock_on_baseline_with_checksum(self, base_val: float, ratio: float = 0.25) -> int:
        """Scans both base_val (e.g. 500.0) and paired checksum (e.g. 125.0)."""
        self.candidates = []
        byte_len = len(self.buffer)
        check_val = base_val * ratio
        for offset in range(0, byte_len - 8, 4):
            val = self.read_f64(offset)
            if abs(val - base_val) < 0.0001:
                self.candidates.append({
                    "offset": offset,
                    "hex": f"0x{offset:06X}",
                    "base_val": base_val,
                    "last_val": base_val,
                    "changed": False,
                    "ratio": 1.0
                })
            elif abs(val - check_val) < 0.0001:
                self.candidates.append({
                    "offset": offset,
                    "hex": f"0x{offset:06X}",
                    "base_val": check_val,
                    "last_val": check_val,
                    "changed": False,
                    "ratio": ratio
                })
        self.is_hunting = True
        return len(self.candidates)

    def poke_and_sync_checksum(self, target_offset: int, new_val: float, ratio: float = 0.25):
        """Pokes target_offset and syncs paired checksum offset."""
        target_cand = next((c for c in self.candidates if c["offset"] == target_offset), None)
        if not target_cand:
            return
        is_checksum = (target_cand.get("ratio") == ratio)
        primary_val = new_val / ratio if is_checksum else new_val
        checksum_val = new_val if is_checksum else new_val * ratio

        # Write target
        self.write_f64(target_offset, new_val)

        # Sync paired candidates
        for c in self.candidates:
            if c["offset"] == target_offset:
                continue
            if not is_checksum and c.get("ratio") == ratio:
                self.write_f64(c["offset"], checksum_val)
                c["last_val"] = checksum_val
            elif is_checksum and c.get("ratio") == 1.0:
                self.write_f64(c["offset"], primary_val)
                c["last_val"] = primary_val


class TestSmartDeltaHunter(unittest.TestCase):
    def setUp(self):
        self.hunter = SmartDeltaHunterSimulator(131072)
        # Populate 500 noise offsets with 100.0 (UI coords, alpha, background timers)
        for offset in range(0x1000, 0x1000 + (500 * 8), 8):
            self.hunter.write_f64(offset, 100.0)

        # Place the TRUE Player HP at offset 0x0240
        self.true_hp_offset = 0x0240
        self.hunter.write_f64(self.true_hp_offset, 100.0)

    def test_baseline_capture(self):
        """Captures all 501 offsets holding 100.0."""
        count = self.hunter.lock_on_baseline(100.0)
        self.assertEqual(count, 501)

    def test_live_delta_auto_isolation(self):
        """When player takes 15 damage (100 -> 85), hunter must isolate exactly offset 0x0240."""
        self.hunter.lock_on_baseline(100.0)

        # Game simulation: Player HP drops to 85.0, noise remains 100.0
        self.hunter.write_f64(self.true_hp_offset, 85.0)

        # Live delta supervisor tick
        changed = self.hunter.tick_live_delta()
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0]["offset"], self.true_hp_offset)
        self.assertEqual(changed[0]["last_val"], 85.0)

    def test_pruning_wizard_one_hit_kill(self):
        """Pruning by exact 85.0 eliminates 500 noise offsets and leaves exactly 1 candidate."""
        self.hunter.lock_on_baseline(100.0)
        self.hunter.write_f64(self.true_hp_offset, 85.0)

        final_candidates = self.hunter.prune_by_exact_next_value(85.0)
        self.assertEqual(len(final_candidates), 1)
        self.assertEqual(final_candidates[0]["offset"], self.true_hp_offset)

    def test_ant_buster_checksum_pairing_and_synchronized_poke(self):
        """
        Ant Buster Anti-Cheat Verification:
        money = 500.0, dinCheck = 125.0 (dinCheck = money / 4).
        confereNDS() requires: money == dinCheck * 4.
        When money is poked to 999,999.0, dinCheck must automatically become 249,999.75.
        """
        money_offset = 0x0300
        din_check_offset = 0x0320
        self.hunter.write_f64(money_offset, 500.0)
        self.hunter.write_f64(din_check_offset, 125.0)

        # Lock-on with 0.25 ratio
        count = self.hunter.lock_on_baseline_with_checksum(500.0, ratio=0.25)
        self.assertGreaterEqual(count, 2)

        # Poke money -> 999,999
        self.hunter.poke_and_sync_checksum(money_offset, 999999.0, ratio=0.25)

        # Verify values in memory
        written_money = self.hunter.read_f64(money_offset)
        written_din = self.hunter.read_f64(din_check_offset)
        self.assertEqual(written_money, 999999.0)
        self.assertEqual(written_din, 249999.75)

        # Verify Ant Buster confereNDS() anti-cheat rule
        self.assertTrue(abs(written_money - (written_din * 4.0)) < 0.0001)


if __name__ == "__main__":
    unittest.main()

