#!/usr/bin/env python3
"""Serve and probe the current P0A Web build without readiness polling."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from threading import Thread
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


REQUIRED_ARTIFACTS = ("index.html", "main.dart.js", "manifest.json")
REQUEST_TIMEOUT_SECONDS = 10


class SmokeFailure(RuntimeError):
    """Expected, safely printable smoke-check failure."""


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *args: object) -> None:
        del args


def parse_port(value: str) -> int:
    try:
        port = int(value, 10)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer from 0 to 65535") from error
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be an integer from 0 to 65535")
    return port


def require_web_root(web_root: Path) -> Path:
    resolved_root = web_root.resolve(strict=True)
    if not resolved_root.is_dir():
        raise SmokeFailure("current-source Web build root is not a directory")
    for artifact in REQUIRED_ARTIFACTS:
        artifact_path = resolved_root / artifact
        if not artifact_path.is_file() or artifact_path.stat().st_size == 0:
            raise SmokeFailure(f"missing current-source Web artifact: {artifact}")
    return resolved_root


def fetch_once(base_url: str, artifact: str) -> bytes:
    try:
        with urlopen(
            f"{base_url}/{artifact}",
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as response:
            if response.status != 200:
                raise SmokeFailure(f"loopback returned HTTP {response.status} for {artifact}")
            return response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        raise SmokeFailure(f"single loopback request failed for {artifact}") from error


def run_smoke(web_root: Path, requested_port: int) -> int:
    handler = partial(QuietStaticHandler, directory=str(web_root))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", requested_port), handler)
    except OSError as error:
        raise SmokeFailure("could not bind the loopback Web smoke server") from error

    actual_port = server.server_address[1]
    server_thread = Thread(target=server.serve_forever, name="p0a-web-smoke", daemon=True)
    server_thread.start()
    try:
        base_url = f"http://127.0.0.1:{actual_port}"
        responses = {
            artifact: fetch_once(base_url, artifact)
            for artifact in REQUIRED_ARTIFACTS
        }
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join()

    if b"ShareItToo" not in responses["manifest.json"]:
        raise SmokeFailure("current-source Web manifest does not identify ShareItToo")
    return actual_port


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-root", required=True, type=Path)
    parser.add_argument("--port", required=True, type=parse_port)
    arguments = parser.parse_args()

    try:
        web_root = require_web_root(arguments.web_root)
        actual_port = run_smoke(web_root, arguments.port)
    except (OSError, SmokeFailure) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        "P0A web smoke: PASS "
        f"(loopback only, bound port {actual_port}, current-source debug build)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
