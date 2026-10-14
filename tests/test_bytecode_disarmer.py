# -*- coding: utf-8 -*-
"""
[LJack Protocol Test Rig]
Target: Cheat Flash (치트 플래시) v1.4.0
Test: SWF Bytecode Anti-Cheat Disarmer Engine
"""

import sys
import unittest
from pathlib import Path
import zlib

# LJack 강령 10: UTF-8 입출력 인코딩 안전망 (Windows cp949 콘솔 이모지 호환성 보장)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PROJECT_DIR = Path(__file__).resolve().parent.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import server


class TestBytecodeDisarmer(unittest.TestCase):
    def test_synthetic_swf_disarm(self):
        """Creates a mock SWF with ActionDefineFunction2 confereNDS and tests patching."""
        # Mock ActionDefineFunction2 confereNDS
        # 8e <hdr_len:2> 'confereNDS\0' <numParams:2> <regCount:1> <flags:2> <codeLen:2> <code...>
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

        mock_decompressed = b'\x00' * 100 + fn_bytes + b'\x00' * 50
        compressed = zlib.compress(mock_decompressed)
        total_uncompressed_len = len(mock_decompressed) + 8
        cws_mock = b'CWS\x08' + total_uncompressed_len.to_bytes(4, 'little') + compressed

        disarmed_bytes, patches = server.disarm_swf_bytes(cws_mock)

        # Must convert to FWS
        self.assertTrue(disarmed_bytes.startswith(b'FWS\x08'))
        self.assertEqual(len(patches), 1)
        self.assertIn("confereNDS()", patches[0])

        # Verify bytecode starts with Push true (96 02 00 05 01) and Return (3e)
        target_fn = b'\x8e' + hdr_len.to_bytes(2, 'little') + fn_name
        pos = disarmed_bytes.find(target_fn)
        self.assertNotEqual(pos, -1)
        code_start = pos + 3 + hdr_len + 2
        patched_code = disarmed_bytes[code_start:code_start+6]
        self.assertEqual(patched_code, b'\x96\x02\x00\x05\x01\x3e')

    def test_real_ant_buster_disarm(self):
        """Tests disarming real Ant Buster.swf binary if present."""
        ant_buster_path = Path(r"c:\Users\SBK\Desktop\정리\노아의 방주\Ant Buster.swf")
        if not ant_buster_path.exists():
            self.skipTest("Ant Buster.swf not found in local test environment.")

        with open(ant_buster_path, "rb") as f:
            data = f.read()

        disarmed_bytes, patches = server.disarm_swf_bytes(data)
        self.assertTrue(disarmed_bytes.startswith(b"FWS\x08"))
        self.assertGreaterEqual(len(patches), 2)
        patch_str = " ".join(patches)
        self.assertIn("confereNDS", patch_str)


if __name__ == "__main__":
    unittest.main()
