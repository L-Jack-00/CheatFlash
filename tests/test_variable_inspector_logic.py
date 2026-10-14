# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.1.0
Test: Quick Number Inspector (Deep Recursive Variable Search & Heuristic Ranking)
"""

import sys
import unittest

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


class DeepObjectInspector:
    """Python simulation of the Deep Recursive Variable Inspector & Ranker."""

    GAME_KEYWORDS = ["hp", "gold", "money", "score", "life", "ammo", "level", "gem", "coin", "exp"]

    def __init__(self, root_obj: dict):
        self.root_obj = root_obj
        self.frozen_vars = {}  # path -> locked_value

    def search_by_value(self, target_val: float, max_depth: int = 5) -> list[dict]:
        results = []

        def recurse(current, path, depth):
            if depth > max_depth or not isinstance(current, dict):
                return

            for key, val in current.items():
                current_path = f"{path}.{key}" if path else key

                if isinstance(val, (int, float)):
                    if abs(val - target_val) < 0.001:
                        # Compute relevance score for ranking
                        score = 0
                        lower_path = current_path.lower()
                        for kw in self.GAME_KEYWORDS:
                            if kw in lower_path:
                                score += 10
                        results.append({
                            "path": current_path,
                            "value": val,
                            "score": score
                        })
                elif isinstance(val, dict):
                    recurse(val, current_path, depth + 1)

        recurse(self.root_obj, "", 1)
        # Sort by score descending (high relevance first)
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    def set_value(self, path: str, new_val: float) -> bool:
        parts = path.split(".")
        curr = self.root_obj
        for p in parts[:-1]:
            if p not in curr or not isinstance(curr[p], dict):
                return False
            curr = curr[p]

        target_key = parts[-1]
        if target_key in curr:
            curr[target_key] = new_val
            return True
        return False

    def freeze_value(self, path: str, lock_val: float):
        self.frozen_vars[path] = lock_val
        self.set_value(path, lock_val)

    def enforce_freeze(self):
        for path, lock_val in self.frozen_vars.items():
            self.set_value(path, lock_val)


class TestDeepInspector(unittest.TestCase):
    def setUp(self):
        self.sample_flash_state = {
            "player": {
                "stats": {
                    "hp": 100,
                    "max_hp": 100
                },
                "inventory": {
                    "gold": 500,
                    "gems": 25
                }
            },
            "game": {
                "wave": 3,
                "score": 1240,
                "sub_system": {
                    "timer_counter": 100,  # Same value as hp (100), but less relevant
                    "ambient_light": 500   # Same value as gold (500), but less relevant
                }
            }
        }
        self.inspector = DeepObjectInspector(self.sample_flash_state)

    def test_deep_search_and_keyword_ranking(self):
        """Searching 100 should rank player.stats.hp and max_hp above sub_system.timer_counter."""
        results = self.inspector.search_by_value(100)
        self.assertEqual(len(results), 3)
        # Top ranks must be hp-related due to 'hp' keyword
        top_paths = [r["path"] for r in results[:2]]
        self.assertIn("player.stats.hp", top_paths)
        self.assertIn("player.stats.max_hp", top_paths)
        self.assertGreater(results[0]["score"], results[2]["score"])

    def test_direct_value_modification(self):
        """Modifying deep variable player.inventory.gold must update nested dict."""
        success = self.inspector.set_value("player.inventory.gold", 999999)
        self.assertTrue(success)
        self.assertEqual(self.sample_flash_state["player"]["inventory"]["gold"], 999999)

    def test_freeze_enforcement(self):
        """Frozen value must be restored when external game logic changes it."""
        self.inspector.freeze_value("player.stats.hp", 100)

        # Game inflicts 40 damage
        self.sample_flash_state["player"]["stats"]["hp"] = 60
        self.assertEqual(self.sample_flash_state["player"]["stats"]["hp"], 60)

        # Enforce freeze
        self.inspector.enforce_freeze()
        self.assertEqual(self.sample_flash_state["player"]["stats"]["hp"], 100)


if __name__ == "__main__":
    unittest.main()
