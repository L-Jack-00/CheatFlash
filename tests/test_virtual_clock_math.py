# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.0.0
Test: Virtual Clock & Drift-Free Time Dilation Logic Test
"""

import sys
import unittest

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class VirtualClockSimulator:
    """Python simulation of the Drift-Free Virtual Clock Engine."""

    def __init__(self):
        self.time_scale = 1.0
        self.is_paused = False
        self.virtual_time = 0.0
        self.step_pending = False
        self.step_delta = 0.0

    def set_time_scale(self, scale: float):
        self.time_scale = max(0.01, min(50.0, scale))

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def step_frame(self, ms: float = 16.666):
        self.is_paused = True
        self.step_pending = True
        self.step_delta = ms

    def update_tick(self, real_delta: float) -> float:
        """Computes next virtual delta and updates virtual_time."""
        v_delta = 0.0
        if not self.is_paused:
            v_delta = real_delta * self.time_scale
        elif self.step_pending:
            v_delta = self.step_delta
            self.step_pending = False
            self.step_delta = 0.0

        self.virtual_time += v_delta
        return v_delta


class TestVirtualClockMath(unittest.TestCase):
    def setUp(self):
        self.clock = VirtualClockSimulator()

    def test_normal_time_flow(self):
        """1x speed should match real time delta exactly."""
        self.clock.set_time_scale(1.0)
        v_delta = self.clock.update_tick(16.666)
        self.assertAlmostEqual(v_delta, 16.666, places=3)
        self.assertAlmostEqual(self.clock.virtual_time, 16.666, places=3)

    def test_speedhack_acceleration(self):
        """5x speed should advance virtual time by 5x."""
        self.clock.set_time_scale(5.0)
        v_delta = self.clock.update_tick(10.0)
        self.assertAlmostEqual(v_delta, 50.0, places=3)
        self.assertAlmostEqual(self.clock.virtual_time, 50.0, places=3)

    def test_slowmo_deceleration(self):
        """0.2x speed should advance virtual time by 0.2x."""
        self.clock.set_time_scale(0.2)
        v_delta = self.clock.update_tick(100.0)
        self.assertAlmostEqual(v_delta, 20.0, places=3)
        self.assertAlmostEqual(self.clock.virtual_time, 20.0, places=3)

    def test_pause_zero_delta(self):
        """When paused, virtual delta must be exactly 0 regardless of real delta."""
        self.clock.pause()
        for _ in range(100):
            v_delta = self.clock.update_tick(16.666)
            self.assertEqual(v_delta, 0.0)
        self.assertEqual(self.clock.virtual_time, 0.0)

    def test_single_frame_step(self):
        """Single frame step while paused must advance exactly 16.666ms once, then freeze."""
        self.clock.pause()
        self.clock.step_frame(16.666)

        # First tick executes the step
        v_delta1 = self.clock.update_tick(33.333)  # real time doesn't matter
        self.assertAlmostEqual(v_delta1, 16.666, places=3)
        self.assertAlmostEqual(self.clock.virtual_time, 16.666, places=3)

        # Subsequent tick remains frozen
        v_delta2 = self.clock.update_tick(33.333)
        self.assertEqual(v_delta2, 0.0)
        self.assertAlmostEqual(self.clock.virtual_time, 16.666, places=3)

    def test_stress_drift_invariance(self):
        """10,000 continuous ticks at 2.5x must not accumulate floating drift."""
        self.clock.set_time_scale(2.5)
        tick_ms = 16.0
        total_ticks = 10000

        for _ in range(total_ticks):
            self.clock.update_tick(tick_ms)

        expected_vtime = total_ticks * tick_ms * 2.5
        self.assertAlmostEqual(self.clock.virtual_time, expected_vtime, places=2)


if __name__ == "__main__":
    unittest.main()
