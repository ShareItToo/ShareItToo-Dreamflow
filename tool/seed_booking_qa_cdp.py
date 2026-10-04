#!/usr/bin/env python3
"""
LOCAL QA ONLY — DO NOT USE IN PRODUCTION

Seeds a minimal booking QA dataset into the running local Flutter-web tab
at http://127.0.0.1:8123/ via Chrome DevTools Protocol (CDP).

- Creates a backup of targeted localStorage keys first.
- Writes only local QA `flutter.*` keys plus QA auth accounts/session state.
- Default mode clears session/currentUser so login can be tested realistically.
- Manual/local use only; no app imports, no auto-run.
-
-SINGLE-PROFILE LIMIT:
-Two tabs in the same Chrome profile share localStorage.
-So Walid and Laura cannot be tested reliably in parallel in the same profile.
-Standard QA flow is sequential: login Walid -> logout -> login Laura.
-Parallel persona testing requires separate Chrome profiles / separate CDP ports.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import pathlib
import secrets
import socket
import struct
import sys
import urllib.request
from typing import Any, Callable

DEBUG_PORT = 9224
TARGET_URL_FRAGMENT = '127.0.0.1:8123/'
TARGET_KEYS = [
    'flutter.users',
    'flutter.currentUser',
    'flutter.items',
    'flutter.rental_requests',
    'flutter.message_threads_v1',
    'flutter.booking_selections',
    'flutter.timeline_events',
    'flutter.auth_accounts_v1',
    'flutter.auth_session_v1',
]
OPTIONAL_KEYS = ['flutter.notifications']
BACKUP_DIR = pathlib.Path('tool/.qa_seed_backups')


class CdpPage:
    def __init__(self, ws_host: str, ws_port: int, ws_path: str):
        self.ws_host = ws_host
        self.ws_port = ws_port
        self.ws_path = ws_path
        self.sock: socket.socket | None = None
        self.next_id = 1
        self.pending_events: list[dict[str, Any]] = []

    def connect(self) -> None:
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock = socket.create_connection((self.ws_host, self.ws_port), timeout=10)
        req = (
            f'GET {self.ws_path} HTTP/1.1\r\n'
            f'Host: {self.ws_host}:{self.ws_port}\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n'
        )
        self.sock.sendall(req.encode())
        resp = self.sock.recv(4096)
        if b' 101 ' not in resp:
            raise RuntimeError(f'WebSocket handshake failed: {resp!r}')

    def close(self) -> None:
        if self.sock:
            try:
                self.sock.close()
            finally:
                self.sock = None

    def _send_text(self, txt: str) -> None:
        assert self.sock is not None
        payload = txt.encode()
        mask = os.urandom(4)
        n = len(payload)
        hdr = bytearray([0x81])
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126)
            hdr.extend(struct.pack('!H', n))
        else:
            hdr.append(0x80 | 127)
            hdr.extend(struct.pack('!Q', n))
        masked = bytes(payload[i] ^ mask[i % 4] for i in range(n))
        self.sock.sendall(bytes(hdr) + mask + masked)

    def _recv_text(self) -> str | None:
        assert self.sock is not None
        while True:
            head = self._recv_exact(2, allow_clean_eof=True)
            if head is None:
                return None
            b1, b2 = head[0], head[1]
            opcode = b1 & 0x0F
            masked = b2 >> 7
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack('!H', self._recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack('!Q', self._recv_exact(8))[0]
            mask = self._recv_exact(4) if masked else None
            data = self._recv_exact(n)
            if masked and mask is not None:
                data = bytes(data[i] ^ mask[i % 4] for i in range(n))
            if opcode == 0x1:
                return data.decode()
            if opcode == 0x8:
                return None
            if opcode == 0x9:
                pong = bytearray([0x8A])
                if n < 126:
                    pong.append(n)
                elif n < 65536:
                    pong.append(126)
                    pong.extend(struct.pack('!H', n))
                else:
                    pong.append(127)
                    pong.extend(struct.pack('!Q', n))
                self.sock.sendall(bytes(pong) + data)

    def _recv_exact(self, size: int, allow_clean_eof: bool = False) -> bytes | None:
        assert self.sock is not None
        data = bytearray()
        while len(data) < size:
            chunk = self.sock.recv(size - len(data))
            if not chunk:
                if allow_clean_eof and not data:
                    return None
                raise RuntimeError('CDP socket closed in the middle of a WebSocket frame')
            data.extend(chunk)
        return bytes(data)

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        call_id = self.next_id
        self.next_id += 1
        self._send_text(json.dumps({'id': call_id, 'method': method, 'params': params or {}}))
        while True:
            text = self._recv_text()
            if text is None:
                raise RuntimeError('CDP socket closed while waiting for response')
            obj = json.loads(text)
            if obj.get('id') != call_id:
                if 'method' in obj and 'id' not in obj:
                    self.pending_events.append(obj)
                continue
            if 'error' in obj:
                raise RuntimeError(f'CDP {method} failed: {obj["error"]}')
            return obj.get('result', {})

    def discard_events(self, method: str) -> None:
        self.pending_events = [
            event for event in self.pending_events if event.get('method') != method
        ]

    def wait_for_event(
        self,
        method: str,
        predicate: Callable[[dict[str, Any]], bool],
        timeout_seconds: int = 10,
    ) -> dict[str, Any]:
        for index, event in enumerate(self.pending_events):
            params = event.get('params', {})
            if event.get('method') == method and predicate(params):
                self.pending_events.pop(index)
                return params

        assert self.sock is not None
        previous_timeout = self.sock.gettimeout()
        self.sock.settimeout(timeout_seconds)
        try:
            while True:
                try:
                    text = self._recv_text()
                except TimeoutError as error:
                    raise RuntimeError(f'Timed out waiting for CDP event {method}') from error
                if text is None:
                    raise RuntimeError(f'CDP socket closed while waiting for event {method}')
                event = json.loads(text)
                params = event.get('params', {})
                if event.get('method') == method and predicate(params):
                    return params
                if 'method' in event and 'id' not in event:
                    self.pending_events.append(event)
        finally:
            self.sock.settimeout(previous_timeout)

    def evaluate_json(self, expression: str) -> Any:
        res = self.call('Runtime.evaluate', {
            'expression': expression,
            'returnByValue': True,
            'awaitPromise': True,
        })
        result = res.get('result', {})
        if 'value' not in result:
            raise RuntimeError(f'No value returned: {result}')
        return result['value']


def find_target_tab(debug_port: int, url_fragment: str, tab_index: int | None = None) -> dict[str, Any]:
    with urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json/list', timeout=10) as resp:
        tabs = json.load(resp)
    matches = [t for t in tabs if t.get('type') == 'page' and url_fragment in t.get('url', '')]
    if not matches:
        raise RuntimeError(f'No Chrome tab found with URL containing {url_fragment!r}')
    if tab_index is not None:
        if tab_index < 1 or tab_index > len(matches):
            raise RuntimeError(f'--tab-index {tab_index} is out of range for {len(matches)} matching tabs')
        return matches[tab_index - 1]
    if len(matches) > 1:
        exact = [t for t in matches if t.get('url') == f'http://{url_fragment}']
        if len(exact) == 1:
            return exact[0]
        lines = ['Multiple matching tabs found. Re-run with --tab-index N:']
        for idx, tab in enumerate(matches, start=1):
            lines.append(f"  [{idx}] {tab.get('title')} — {tab.get('url')}")
        raise RuntimeError('\n'.join(lines))
    return matches[0]


def iso(days_offset: int, hour: int = 10, minute: int = 0) -> str:
    base = dt.datetime(2026, 4, 30, hour, minute, 0, tzinfo=dt.timezone.utc)
    return (base + dt.timedelta(days=days_offset)).isoformat().replace('+00:00', 'Z')


def build_payload(
    session_persona: str | None = None,
    qa_passwords: dict[str, str] | None = None,
) -> dict[str, str | None]:
    qa_passwords = qa_passwords or {
        'walid': secrets.token_urlsafe(24),
        'laura': secrets.token_urlsafe(24),
    }
    walid = {
        'id': 'qa-user-walid',
        'displayName': 'Walid',
        'email': 'walid.qa@shareittoo.local',
        'phone': None,
        'emailVerified': True,
        'phoneVerified': False,
        'photoURL': 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=150&h=150&fit=crop&crop=face',
        'bio': 'Lokaler QA-Renter',
        'city': 'Berlin',
        'country': 'Deutschland',
        'preferredLanguage': 'de-DE',
        'isVerified': True,
        'isBanned': False,
        'role': 'user',
        'payoutAccountId': None,
        'avgRating': 4.9,
        'reviewCount': 12,
        'createdAt': iso(-120),
        'isDeactivated': False,
        'deactivatedAt': None,
        'languages': ['Deutsch', 'English'],
        'interests': ['Marketplace QA'],
        'workTitle': None,
        'hobbies': None,
        'homeLocation': None,
        'favoriteSong': None,
        'showWork': False,
        'showHobbies': False,
        'showHomeLocation': False,
        'showBioPublic': True,
        'showFavoriteSong': False,
        'homeLat': None,
        'homeLng': None,
        'birthDate': None,
        'socialX': None,
        'socialFacebook': None,
        'socialInstagram': None,
        'socialTiktok': None,
        'socialSnapchat': None,
        'addressStreet': None,
        'addressHouseNumber': None,
        'addressPostalCode': None,
        'addressCity': None,
        'addressCountry': None,
        'addressExtra': None,
    }
    laura = {
        **walid,
        'id': 'qa-user-laura',
        'displayName': 'Laura',
        'email': 'laura.qa@shareittoo.local',
        'photoURL': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
        'bio': 'Lokale QA-Ownerin',
        'city': 'Hamburg',
        'isVerified': True,
        'avgRating': 4.8,
        'reviewCount': 19,
    }
    items = [
        {
            'id': 'qa-item-camera',
            'ownerId': 'qa-user-laura',
            'title': 'Sony Alpha 7 III',
            'description': 'QA-Testartikel für Buchungszustände.',
            'categoryId': 'cat1',
            'subcategory': 'Kameras',
            'tags': ['qa', 'kamera'],
            'pricePerDay': 35,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 35,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Mitte',
            'lat': 53.5511,
            'lng': 9.9937,
            'geohash': 'u1x0',
            'condition': 'like-new',
            'minDays': 1,
            'maxDays': 14,
            'createdAt': iso(-20),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 4,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'flexible',
        },
        {
            'id': 'qa-item-speaker',
            'ownerId': 'qa-user-laura',
            'title': 'JBL Partybox',
            'description': 'QA-Zweitartikel für Review-/Abschlussfälle.',
            'categoryId': 'cat14',
            'subcategory': 'Audio',
            'tags': ['qa', 'speaker'],
            'pricePerDay': 22,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 22,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Altona',
            'lat': 53.5511,
            'lng': 9.935,
            'geohash': 'u1x1',
            'condition': 'good',
            'minDays': 1,
            'maxDays': 7,
            'createdAt': iso(-18),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 2,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'moderate',
        },
        {
            'id': 'qa-item-drill',
            'ownerId': 'qa-user-laura',
            'title': 'Akku-Bohrschrauber Bosch 18V',
            'description': 'Kräftiger Akku-Bohrschrauber für kleine Heimwerkerjobs und Möbelmontage.',
            'categoryId': 'cat8',
            'subcategory': 'Werkzeuge',
            'tags': ['qa', 'werkzeug', 'heimwerken'],
            'pricePerDay': 14,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 14,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Eimsbüttel',
            'lat': 53.5776,
            'lng': 9.9511,
            'geohash': 'u1x2',
            'condition': 'good',
            'minDays': 1,
            'maxDays': 5,
            'createdAt': iso(-12),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 1,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'flexible',
        },
        {
            'id': 'qa-item-projector',
            'ownerId': 'qa-user-laura',
            'title': 'Full-HD Beamer Epson',
            'description': 'Heller Beamer für Filmabend, Präsentation oder kleines Event zu Hause.',
            'categoryId': 'cat1',
            'subcategory': 'Beamer',
            'tags': ['qa', 'elektronik', 'beamer'],
            'pricePerDay': 29,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 29,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1528395874238-34ebe249b3f2?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Winterhude',
            'lat': 53.5952,
            'lng': 10.0006,
            'geohash': 'u1x3',
            'condition': 'like-new',
            'minDays': 1,
            'maxDays': 10,
            'createdAt': iso(-10),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 3,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'moderate',
        },
        {
            'id': 'qa-item-camping-chairs',
            'ownerId': 'qa-user-laura',
            'title': 'Campingstuhl-Set für 4 Personen',
            'description': 'Vier faltbare Campingstühle für Festival, Garten oder Wochenendtrip.',
            'categoryId': 'cat20',
            'subcategory': 'Camping',
            'tags': ['qa', 'outdoor', 'camping'],
            'pricePerDay': 9,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 9,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1504280390368-397d44c4e6a8?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Bahrenfeld',
            'lat': 53.5686,
            'lng': 9.9023,
            'geohash': 'u1x4',
            'condition': 'good',
            'minDays': 1,
            'maxDays': 14,
            'createdAt': iso(-8),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 0,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'flexible',
        },
        {
            'id': 'qa-item-roof-box',
            'ownerId': 'qa-user-laura',
            'title': 'Dachbox Thule 420L',
            'description': 'Geräumige Dachbox für Urlaub, Ski oder lange Wochenendfahrten.',
            'categoryId': 'cat10',
            'subcategory': 'Autozubehör',
            'tags': ['qa', 'reise', 'auto'],
            'pricePerDay': 18,
            'currency': 'EUR',
            'priceUnit': 'day',
            'priceRaw': 18,
            'deposit': None,
            'autoApplyDiscounts': False,
            'longRentalDiscounts': [],
            'photos': ['https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&h=800&fit=crop'],
            'locationText': 'Hamburg-Bergedorf',
            'lat': 53.4899,
            'lng': 10.2062,
            'geohash': 'u1x5',
            'condition': 'good',
            'minDays': 2,
            'maxDays': 21,
            'createdAt': iso(-6),
            'isActive': True,
            'verificationStatus': 'approved',
            'city': 'Hamburg',
            'country': 'Deutschland',
            'status': 'active',
            'endedAt': None,
            'timesLent': 2,
            'offersDeliveryAtDropoff': False,
            'offersPickupAtReturn': False,
            'offersExpressAtDropoff': False,
            'maxDeliveryKmAtDropoff': None,
            'maxPickupKmAtReturn': None,
            'cancellationPolicy': 'moderate',
        },
    ]
    requests = [
        {
            'id': 'qa-pending',
            'itemId': 'qa-item-camera',
            'ownerId': 'qa-user-laura',
            'renterId': 'qa-user-walid',
            'start': iso(1),
            'end': iso(3),
            'status': 'pending',
            'message': 'QA pending request',
            'cancelledBy': None,
            'expressRequested': False,
            'expressStatus': None,
            'expressFee': 5.0,
            'ownerDeliversAtDropoffChosen': False,
            'ownerPicksUpAtReturnChosen': False,
            'deliveryAddressLine': None,
            'deliveryCity': None,
            'deliveryLat': None,
            'deliveryLng': None,
            'createdAt': iso(0, 8, 0),
            'expressRequestedAt': None,
            'expressConfirmedAt': None,
            'needsReview': False,
            'reviewReason': None,
            'reviewSource': None,
            'reviewRequestedAt': None,
            'handoverConfirmation': None,
            'returnConfirmation': None,
            'quotedTotalRenter': 70.0,
            'quotedSubtitle': '2 Tage',
        },
        {
            'id': 'qa-accepted',
            'itemId': 'qa-item-camera',
            'ownerId': 'qa-user-laura',
            'renterId': 'qa-user-walid',
            'start': iso(0, 14, 0),
            'end': iso(2, 14, 0),
            'status': 'accepted',
            'message': 'QA accepted / handover-ready',
            'cancelledBy': None,
            'expressRequested': False,
            'expressStatus': None,
            'expressFee': 5.0,
            'ownerDeliversAtDropoffChosen': False,
            'ownerPicksUpAtReturnChosen': False,
            'deliveryAddressLine': None,
            'deliveryCity': None,
            'deliveryLat': None,
            'deliveryLng': None,
            'createdAt': iso(-1, 9, 15),
            'expressRequestedAt': None,
            'expressConfirmedAt': None,
            'needsReview': False,
            'reviewReason': None,
            'reviewSource': None,
            'reviewRequestedAt': None,
            'handoverConfirmation': None,
            'returnConfirmation': None,
            'quotedTotalRenter': 70.0,
            'quotedSubtitle': '2 Tage',
        },
        {
            'id': 'qa-running',
            'itemId': 'qa-item-camera',
            'ownerId': 'qa-user-laura',
            'renterId': 'qa-user-walid',
            'start': iso(-1, 10, 0),
            'end': iso(1, 10, 0),
            'status': 'running',
            'message': 'QA running / return-ready',
            'cancelledBy': None,
            'expressRequested': False,
            'expressStatus': None,
            'expressFee': 5.0,
            'ownerDeliversAtDropoffChosen': False,
            'ownerPicksUpAtReturnChosen': False,
            'deliveryAddressLine': None,
            'deliveryCity': None,
            'deliveryLat': None,
            'deliveryLng': None,
            'createdAt': iso(-2, 8, 30),
            'expressRequestedAt': None,
            'expressConfirmedAt': None,
            'needsReview': False,
            'reviewReason': None,
            'reviewSource': None,
            'reviewRequestedAt': None,
            'handoverConfirmation': {'confirmedAt': iso(-1, 10, 5)},
            'returnConfirmation': None,
            'quotedTotalRenter': 70.0,
            'quotedSubtitle': '2 Tage',
        },
        {
            'id': 'qa-completed',
            'itemId': 'qa-item-speaker',
            'ownerId': 'qa-user-laura',
            'renterId': 'qa-user-walid',
            'start': iso(-5, 11, 0),
            'end': iso(-3, 11, 0),
            'status': 'completed',
            'message': 'QA completed booking',
            'cancelledBy': None,
            'expressRequested': False,
            'expressStatus': None,
            'expressFee': 5.0,
            'ownerDeliversAtDropoffChosen': False,
            'ownerPicksUpAtReturnChosen': False,
            'deliveryAddressLine': None,
            'deliveryCity': None,
            'deliveryLat': None,
            'deliveryLng': None,
            'createdAt': iso(-6, 9, 0),
            'expressRequestedAt': None,
            'expressConfirmedAt': None,
            'needsReview': False,
            'reviewReason': None,
            'reviewSource': None,
            'reviewRequestedAt': None,
            'handoverConfirmation': {'confirmedAt': iso(-5, 11, 5)},
            'returnConfirmation': {'confirmedAt': iso(-3, 11, 5)},
            'quotedTotalRenter': 44.0,
            'quotedSubtitle': '2 Tage',
        },
        {
            'id': 'qa-review',
            'itemId': 'qa-item-speaker',
            'ownerId': 'qa-user-laura',
            'renterId': 'qa-user-walid',
            'start': iso(-9, 12, 0),
            'end': iso(-7, 12, 0),
            'status': 'completed',
            'message': 'QA needsReview / In Prüfung',
            'cancelledBy': None,
            'expressRequested': False,
            'expressStatus': None,
            'expressFee': 5.0,
            'ownerDeliversAtDropoffChosen': False,
            'ownerPicksUpAtReturnChosen': False,
            'deliveryAddressLine': None,
            'deliveryCity': None,
            'deliveryLat': None,
            'deliveryLng': None,
            'createdAt': iso(-10, 9, 30),
            'expressRequestedAt': None,
            'expressConfirmedAt': None,
            'needsReview': True,
            'reviewReason': 'damage',
            'reviewSource': 'return',
            'reviewRequestedAt': iso(-7, 12, 10),
            'handoverConfirmation': {'confirmedAt': iso(-9, 12, 5)},
            'returnConfirmation': {'confirmedAt': iso(-7, 12, 5)},
            'quotedTotalRenter': 44.0,
            'quotedSubtitle': '2 Tage',
        },
    ]
    threads = [
        {
            'id': 'thread_qa_accepted',
            'requestId': 'qa-accepted',
            'itemId': 'qa-item-camera',
            'itemTitle': 'Sony Alpha 7 III',
            'user1Id': 'qa-user-walid',
            'user2Id': 'qa-user-laura',
            'threadType': None,
            'bookingStatus': 'accepted',
            'handoverAt': iso(0, 14, 0),
            'returnAt': iso(2, 14, 0),
            'otherUserOnline': True,
            'otherUserLastActive': iso(0, 9, 0),
            'archivedForUserIds': [],
            'messages': [
                {'id': 'm_qa_accepted_1', 'senderId': 'system', 'text': 'Buchung bestätigt', 'timestamp': iso(-1, 9, 15), 'isRead': False}
            ],
            'createdAt': iso(-1, 9, 15),
            'lastMessageAt': iso(-1, 9, 15),
        },
        {
            'id': 'thread_qa_running',
            'requestId': 'qa-running',
            'itemId': 'qa-item-camera',
            'itemTitle': 'Sony Alpha 7 III',
            'user1Id': 'qa-user-walid',
            'user2Id': 'qa-user-laura',
            'threadType': None,
            'bookingStatus': 'running',
            'handoverAt': iso(-1, 10, 0),
            'returnAt': iso(1, 10, 0),
            'otherUserOnline': True,
            'otherUserLastActive': iso(0, 8, 45),
            'archivedForUserIds': [],
            'messages': [
                {'id': 'm_qa_running_1', 'senderId': 'system', 'text': 'Laufende Buchung', 'timestamp': iso(-1, 10, 5), 'isRead': False}
            ],
            'createdAt': iso(-2, 8, 30),
            'lastMessageAt': iso(-1, 10, 5),
        },
        {
            'id': 'thread_qa_completed',
            'requestId': 'qa-completed',
            'itemId': 'qa-item-speaker',
            'itemTitle': 'JBL Partybox',
            'user1Id': 'qa-user-walid',
            'user2Id': 'qa-user-laura',
            'threadType': None,
            'bookingStatus': 'completed',
            'handoverAt': iso(-5, 11, 0),
            'returnAt': iso(-3, 11, 0),
            'otherUserOnline': False,
            'otherUserLastActive': iso(-3, 12, 0),
            'archivedForUserIds': [],
            'messages': [
                {'id': 'm_qa_completed_1', 'senderId': 'system', 'text': 'Buchung abgeschlossen', 'timestamp': iso(-3, 11, 5), 'isRead': False}
            ],
            'createdAt': iso(-6, 9, 0),
            'lastMessageAt': iso(-3, 11, 5),
        },
        {
            'id': 'thread_qa_review',
            'requestId': 'qa-review',
            'itemId': 'qa-item-speaker',
            'itemTitle': 'JBL Partybox',
            'user1Id': 'qa-user-walid',
            'user2Id': 'qa-user-laura',
            'threadType': None,
            'bookingStatus': 'completed',
            'handoverAt': iso(-9, 12, 0),
            'returnAt': iso(-7, 12, 0),
            'otherUserOnline': False,
            'otherUserLastActive': iso(-7, 12, 20),
            'archivedForUserIds': [],
            'messages': [
                {'id': 'm_qa_review_1', 'senderId': 'system', 'text': 'Rückgabe in Prüfung', 'timestamp': iso(-7, 12, 10), 'isRead': False}
            ],
            'createdAt': iso(-10, 9, 30),
            'lastMessageAt': iso(-7, 12, 10),
        },
    ]
    timeline = [
        {'requestId': 'qa-accepted', 'type': 'accepted', 'note': 'QA handover-ready', 'ts': iso(-1, 9, 15)},
        {'requestId': 'qa-running', 'type': 'handover_confirmed', 'note': 'QA handover done', 'ts': iso(-1, 10, 5)},
        {'requestId': 'qa-completed', 'type': 'return_confirmed', 'note': 'QA completed', 'ts': iso(-3, 11, 5)},
        {'requestId': 'qa-review', 'type': 'review_requested', 'note': 'QA in Prüfung', 'ts': iso(-7, 12, 10)},
    ]
    booking_selections = {}
    auth_accounts = [
        {
            'email': 'walid.qa@shareittoo.local',
            'password': qa_passwords['walid'],
            'createdAt': iso(-1, 8, 0),
            'qaPersona': 'walid',
        },
        {
            'email': 'laura.qa@shareittoo.local',
            'password': qa_passwords['laura'],
            'createdAt': iso(-1, 8, 5),
            'qaPersona': 'laura',
        },
    ]

    current_user_payload = None
    auth_session_payload = None
    if session_persona == 'walid':
        current_user_payload = walid
        auth_session_payload = {
            'email': 'walid.qa@shareittoo.local',
            'createdAt': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
            'qaPersona': True,
        }
    elif session_persona == 'laura':
        current_user_payload = laura
        auth_session_payload = {
            'email': 'laura.qa@shareittoo.local',
            'createdAt': dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
            'qaPersona': True,
        }

    return {
        'flutter.users': json.dumps(json.dumps([walid, laura], ensure_ascii=False), ensure_ascii=False),
        'flutter.currentUser': None if current_user_payload is None else json.dumps(json.dumps(current_user_payload, ensure_ascii=False), ensure_ascii=False),
        'flutter.items': json.dumps(json.dumps(items, ensure_ascii=False), ensure_ascii=False),
        'flutter.rental_requests': json.dumps(json.dumps(requests, ensure_ascii=False), ensure_ascii=False),
        'flutter.message_threads_v1': json.dumps(json.dumps(threads, ensure_ascii=False), ensure_ascii=False),
        'flutter.booking_selections': json.dumps(json.dumps(booking_selections, ensure_ascii=False), ensure_ascii=False),
        'flutter.timeline_events': json.dumps(json.dumps(timeline, ensure_ascii=False), ensure_ascii=False),
        'flutter.auth_accounts_v1': json.dumps(json.dumps(auth_accounts, ensure_ascii=False), ensure_ascii=False),
        'flutter.auth_session_v1': None if auth_session_payload is None else json.dumps(json.dumps(auth_session_payload, ensure_ascii=False), ensure_ascii=False),
    }


def backup_path() -> pathlib.Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    return BACKUP_DIR / f'booking_qa_seed_backup_{stamp}.json'


def build_backup_expr(keys: list[str]) -> str:
    return """
(() => {
  const keys = %s;
  const out = { url: location.href, title: document.title, capturedAt: new Date().toISOString(), values: {} };
  for (const k of keys) out.values[k] = localStorage.getItem(k);
  return JSON.stringify(out);
})()
""" % json.dumps(keys)


def build_write_expr(payload: dict[str, str | None]) -> str:
    return """
(() => {
  const payload = %s;
  const touched = [];
  for (const [k, raw] of Object.entries(payload)) {
    if (raw === null) {
      localStorage.removeItem(k);
      touched.push(`${k}:removed`);
      continue;
    }
    localStorage.setItem(k, raw);
    touched.push(k);
  }
  const result = { touched, href: location.href, title: document.title };
  return JSON.stringify(result);
})()
""" % json.dumps(payload)


def build_check_expr(keys: list[str]) -> str:
    return """
(() => {
  const keys = %s;
  const out = { href: location.href, readyState: document.readyState, values: {} };
  for (const k of keys) out.values[k] = localStorage.getItem(k);
  return JSON.stringify(out);
})()
""" % json.dumps(keys)


def validate_post_reload(check_raw: str, payload: dict[str, str | None]) -> dict[str, Any]:
    try:
        check = json.loads(check_raw)
    except json.JSONDecodeError as error:
        raise RuntimeError('Post-reload check did not return valid JSON') from error
    if check.get('readyState') != 'complete':
        raise RuntimeError('Post-reload document did not reach readyState complete')
    values = check.get('values')
    if not isinstance(values, dict):
        raise RuntimeError('Post-reload check did not return localStorage state')
    mismatched_keys = [key for key, expected in payload.items() if values.get(key) != expected]
    if mismatched_keys:
        raise RuntimeError(
            'Post-reload localStorage mismatch for keys: ' + ', '.join(sorted(mismatched_keys))
        )
    return {'readyState': 'complete', 'verifiedKeys': len(payload)}


def main() -> int:
    parser = argparse.ArgumentParser(description='Seed local Flutter-web booking QA data via CDP.')
    parser.add_argument('--apply', action='store_true', help='Actually write the seed. Default is dry-run only.')
    parser.add_argument('--no-reload', action='store_true', help='Write without triggering location.reload().')
    parser.add_argument('--session', choices=['walid', 'laura'], help='Optional: preseed a matching session/currentUser for one persona. Default clears both for real login QA.')
    parser.add_argument('--tab-index', type=int, help='When multiple 127.0.0.1:8123 tabs are open, choose the 1-based match index explicitly.')
    parser.add_argument('--port', type=int, default=DEBUG_PORT)
    args = parser.parse_args()

    tab = find_target_tab(args.port, TARGET_URL_FRAGMENT, tab_index=args.tab_index)
    print(f"Target tab: {tab.get('title')} — {tab.get('url')}")
    ws_url = tab.get('webSocketDebuggerUrl')
    if not ws_url or '/devtools/page/' not in ws_url:
        raise RuntimeError('Target tab is missing a usable webSocketDebuggerUrl')
    _, rest = ws_url.split('://', 1)
    hostport, ws_path = rest.split('/', 1)
    ws_host, ws_port_s = hostport.split(':', 1)
    page = CdpPage(ws_host, int(ws_port_s), '/' + ws_path)
    page.connect()
    try:
        should_reload = args.apply and not args.no_reload
        if should_reload:
            page.call('Page.enable')
            page.call('Page.setLifecycleEventsEnabled', {'enabled': True})
            frame_tree = page.call('Page.getFrameTree').get('frameTree', {})
            main_frame = frame_tree.get('frame', {})
            main_frame_id = main_frame.get('id')
            prior_loader_id = main_frame.get('loaderId')
            if not main_frame_id or not prior_loader_id:
                raise RuntimeError('CDP did not return the current main-frame loader identity')

        backup_raw = page.evaluate_json(build_backup_expr(TARGET_KEYS + OPTIONAL_KEYS))
        backup = json.loads(backup_raw)
        if TARGET_URL_FRAGMENT not in (backup.get('url') or ''):
            raise RuntimeError(f"Refusing to continue: tab URL mismatch {backup.get('url')!r}")
        path = backup_path()
        path.write_text(json.dumps(backup, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f'Backup written: {path}')

        qa_passwords = {
            'walid': secrets.token_urlsafe(24),
            'laura': secrets.token_urlsafe(24),
        }
        payload = build_payload(
            session_persona=args.session,
            qa_passwords=qa_passwords,
        )
        summary = {k: ('REMOVE' if v is None else len(v)) for k, v in payload.items()}
        print('Planned payload bytes by key:')
        for k, size in summary.items():
            print(f'  - {k}: {size}')

        if not args.apply:
            print('Dry run only. No keys were changed.')
            return 0

        write_raw = page.evaluate_json(build_write_expr(payload))
        print('Write result:', write_raw)
        print('Ephemeral local QA credentials for this seed run:')
        print(f"  - Walid: walid.qa@shareittoo.local / {qa_passwords['walid']}")
        print(f"  - Laura: laura.qa@shareittoo.local / {qa_passwords['laura']}")
        if should_reload:
            page.discard_events('Page.lifecycleEvent')
            page.call('Page.reload', {'loaderId': prior_loader_id})
            page.wait_for_event(
                'Page.lifecycleEvent',
                lambda params: (
                    params.get('name') == 'load'
                    and params.get('frameId') == main_frame_id
                    and bool(params.get('loaderId'))
                    and params.get('loaderId') != prior_loader_id
                ),
            )
            check_raw = page.evaluate_json(build_check_expr(TARGET_KEYS))
            check = validate_post_reload(check_raw, payload)
            print('Post-reload check:', json.dumps(check, sort_keys=True))
    finally:
        page.close()
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise SystemExit(1)
