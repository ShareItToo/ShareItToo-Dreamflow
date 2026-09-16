#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import struct
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPOSITORY_ROOT / 'tool' / 'seed_booking_qa_cdp.py'
SPEC = importlib.util.spec_from_file_location('seed_booking_qa_cdp', TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def websocket_text_frame(message: dict[str, object]) -> bytes:
    payload = json.dumps(message).encode()
    if len(payload) < 126:
        return bytes([0x81, len(payload)]) + payload
    return bytes([0x81, 126]) + struct.pack('!H', len(payload)) + payload


class FragmentedFakeSocket:
    def __init__(self, messages: list[dict[str, object]]):
        self.buffer = bytearray(b''.join(websocket_text_frame(message) for message in messages))
        self.sent = bytearray()
        self.timeout: float | None = 10

    def recv(self, size: int) -> bytes:
        if not self.buffer:
            return b''
        take = min(size, 1)
        chunk = bytes(self.buffer[:take])
        del self.buffer[:take]
        return chunk

    def sendall(self, data: bytes) -> None:
        self.sent.extend(data)

    def gettimeout(self) -> float | None:
        return self.timeout

    def settimeout(self, timeout: float | None) -> None:
        self.timeout = timeout


class CdpReloadEventTest(unittest.TestCase):
    def test_preserves_an_early_correlated_load_event_until_reload_response(self) -> None:
        page = MODULE.CdpPage('127.0.0.1', 9224, '/devtools/page/test')
        page.sock = FragmentedFakeSocket([
            {
                'method': 'Page.lifecycleEvent',
                'params': {
                    'name': 'load',
                    'frameId': 'main-frame',
                    'loaderId': 'loader-new',
                },
            },
            {'id': 1, 'result': {}},
        ])

        reload_result = page.call('Page.reload', {'loaderId': 'loader-old'})
        event = page.wait_for_event(
            'Page.lifecycleEvent',
            lambda params: (
                params.get('name') == 'load'
                and params.get('frameId') == 'main-frame'
                and params.get('loaderId') != 'loader-old'
            ),
        )

        self.assertEqual(reload_result, {})
        self.assertEqual(event['name'], 'load')
        self.assertEqual(event['loaderId'], 'loader-new')
        self.assertEqual(page.pending_events, [])

    def test_post_reload_validation_checks_state_without_returning_values(self) -> None:
        payload = {'flutter.users': 'users', 'flutter.currentUser': None}
        result = MODULE.validate_post_reload(
            json.dumps({'readyState': 'complete', 'values': payload}),
            payload,
        )

        self.assertEqual(result, {'readyState': 'complete', 'verifiedKeys': 2})
        self.assertNotIn('users', json.dumps(result))

    def test_post_reload_validation_fails_closed_on_a_mismatch(self) -> None:
        with self.assertRaisesRegex(RuntimeError, 'flutter.users'):
            MODULE.validate_post_reload(
                json.dumps({
                    'readyState': 'complete',
                    'values': {'flutter.users': 'different'},
                }),
                {'flutter.users': 'expected'},
            )

    def test_source_contains_no_blind_reload_wait(self) -> None:
        source = TOOL_PATH.read_text(encoding='utf-8')
        self.assertNotIn('time.sleep(', source)
        self.assertNotIn('setTimeout(() => location.reload()', source)
        self.assertIn("page.call('Page.getFrameTree')", source)
        self.assertIn("page.call('Page.reload', {'loaderId': prior_loader_id})", source)
        self.assertIn("'Page.lifecycleEvent'", source)
        self.assertIn("params.get('frameId') == main_frame_id", source)
        self.assertIn("params.get('loaderId') != prior_loader_id", source)


if __name__ == '__main__':
    unittest.main()
