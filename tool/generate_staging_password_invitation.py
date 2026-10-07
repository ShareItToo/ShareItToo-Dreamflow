#!/usr/bin/env python3
"""Offline SIT staging invitation bundle; no runtime activation or delivery.

Only path arguments are accepted. Request/allowlist contents never reach logs.
Two protected files are published together using an exclusive directory rename.
"""
import base64
import ctypes
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import time


class InvitationError(Exception):
    def __init__(self):
        super().__init__('invitation_generation_failed')


class PublicationUnconfirmed(InvitationError):
    """Complete bundle exists, but the parent-directory durability sync failed."""
    def __init__(self, result):
        super().__init__()
        self.result = dict(result, status='publication_unconfirmed')


def require(condition):
    if not condition:
        raise InvitationError()


def absolute_path(value):
    value = os.fspath(value)
    require(isinstance(value, str) and value.startswith('/') and '\x00' not in value)
    require(all(part not in ('.', '..', '') for part in value.split('/')[1:]))
    return Path(value)


def directory(path, private=False):
    """Walk every component without following symlinks; use anchored descriptors."""
    path = absolute_path(path)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        st = os.fstat(fd)
        require(stat.S_ISDIR(st.st_mode))
        if private:
            require(st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700)
        return fd
    except BaseException:
        os.close(fd)
        raise


def private_file_stat(st):
    require(stat.S_ISREG(st.st_mode) and st.st_uid == os.getuid()
            and st.st_nlink == 1 and stat.S_IMODE(st.st_mode) == 0o600)


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def read_private_json(path):
    path = absolute_path(path)
    parent = directory(path.parent)
    fd = None
    try:
        # NONBLOCK prevents a hostile FIFO from hanging before fstat rejects it.
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(fd)
        private_file_stat(before)
        require(0 < before.st_size <= 16384)
        raw = os.read(fd, 16385)
        after = os.fstat(fd)
        private_file_stat(after)
        require((before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_size, after.st_mtime_ns, after.st_ctime_ns))
        require(len(raw) == before.st_size)
        value = json.loads(raw.decode('utf8'), object_pairs_hook=no_duplicate_keys)
        require(type(value) is dict)
        return value
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def validate(request, allowlist):
    require(set(request) == {'email', 'userId', 'ttlSeconds'})
    email = request['email']
    require(type(email) is str and email.isascii() and len(email) <= 254
            and email == email.strip().lower()
            and re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+", email))
    local = email.split('@')[0]
    require(len(local) <= 64 and not local.startswith('.') and not local.endswith('.') and '..' not in local)
    require(type(request['ttlSeconds']) is int and 1 <= request['ttlSeconds'] <= 86400)
    require(set(allowlist) == {'schema', 'version', 'allowedUserIds'}
            and allowlist['schema'] == 'sit-staging-access-allowlist'
            and type(allowlist['version']) is int and allowlist['version'] == 1)
    ids = allowlist['allowedUserIds']
    require(type(ids) is list and 1 <= len(ids) <= 1000)
    require(all(type(value) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}', value) for value in ids))
    require(len(set(ids)) == len(ids))
    require(type(request['userId']) is str and request['userId'] in ids)


def exclusive_rename(parent, old, new):
    """No check-then-rename fallback: unsupported hosts/filesystems deny."""
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == 'darwin':
        function, flag = libc.renameatx_np, 0x00000004  # RENAME_EXCL
    elif sys.platform.startswith('linux'):
        function, flag = libc.renameat2, 1  # RENAME_NOREPLACE
    else:
        raise InvitationError()
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    require(function(parent, os.fsencode(old), parent, os.fsencode(new), flag) == 0)


def write_private_json(parent, name, value):
    data = (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode('utf8')
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
    try:
        os.fchmod(fd, 0o600)
        private_file_stat(os.fstat(fd))
        remaining = memoryview(data)
        while remaining:
            count = os.write(fd, remaining)
            require(count > 0)
            remaining = remaining[count:]
        os.fsync(fd)
        private_file_stat(os.fstat(fd))
    finally:
        os.close(fd)
    return hashlib.sha256(data).hexdigest()


def iso(seconds):
    return datetime.datetime.fromtimestamp(seconds, datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def valid_clock(clock):
    now = (clock or time.time)()
    require(type(now) in (int, float) and math.isfinite(now) and 0 <= now <= 253402214400)
    return math.floor(now * 1000) / 1000


def verify_file(parent, name, digest):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    try:
        private_file_stat(os.fstat(fd))
        require(hashlib.sha256(os.read(fd, 16385)).hexdigest() == digest)
        private_file_stat(os.fstat(fd))
    finally:
        os.close(fd)


def generate(request_file, allowlist_file, output_bundle, *, test_mode=False,
             entropy=None, clock=None, failpoint=None):
    """Test-only injected entropy/clock/failure hooks are never exposed by CLI."""
    parent = stage_fd = None
    stage = None
    stage_created = False
    published = False
    try:
        require(os.getuid() == os.geteuid())
        require(type(test_mode) is bool)
        require(test_mode or all(hook is None for hook in (entropy, clock, failpoint)))
        request = read_private_json(request_file)
        allowlist = read_private_json(allowlist_file)
        validate(request, allowlist)
        output = absolute_path(output_bundle)
        require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', output.name))
        parent = directory(output.parent, private=True)
        try:
            os.stat(output.name, dir_fd=parent, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise InvitationError()
        # Whole milliseconds agree exactly with Date.parse/ISO in the resolver.
        now = valid_clock(clock)
        issued, expiry = iso(now), iso(now + request['ttlSeconds'])
        raw = entropy() if entropy is not None else secrets.token_bytes(32)
        require(type(raw) is bytes and len(raw) == 32)
        token = base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')
        digest = hashlib.sha256(token.encode('ascii')).hexdigest()
        record = {'schema': 'sit-staging-password-invitation', 'version': 1,
                  'tokenDigest': digest,
                  'emailDigest': hashlib.sha256((digest + '\n' + request['email']).encode('utf8')).hexdigest(),
                  'userId': request['userId'], 'issuedAt': issued, 'expiresAt': expiry}
        handoff = {'schema': 'sit-staging-password-handoff', 'version': 1,
                   'email': request['email'], 'token': token, 'expiresAt': expiry}
        stage = '.sit-invitation-' + secrets.token_hex(16)
        os.mkdir(stage, 0o700, dir_fd=parent)
        stage_created = True
        stage_fd = os.open(stage, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        st = os.fstat(stage_fd)
        require(st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700)
        files = {}
        for name, value, point in [('handoff.json', handoff, 'after-handoff'),
                                   ('server-record.json', record, 'after-record')]:
            files[name] = {'path': str(output / name), 'sha256': write_private_json(stage_fd, name, value)}
            if failpoint is not None:
                failpoint(point)
        os.fsync(stage_fd)
        if failpoint is not None:
            failpoint('before-publish')
        # Revalidate anchored destination before publication; no runtime flags,
        # external credentials, provider calls or environment input are read.
        st = os.fstat(parent)
        require(st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == 0o700)
        source = os.stat(stage, dir_fd=parent, follow_symlinks=False)
        opened = os.fstat(stage_fd)
        require(stat.S_ISDIR(source.st_mode) and source.st_uid == os.getuid()
                and stat.S_IMODE(source.st_mode) == 0o700
                and (source.st_dev, source.st_ino) == (opened.st_dev, opened.st_ino))
        for name, metadata in files.items():
            verify_file(stage_fd, name, metadata['sha256'])
        require(now <= valid_clock(clock) < now + request['ttlSeconds'])
        exclusive_rename(parent, stage, output.name)
        published = True
        result = {'status': 'created', 'path': str(output), 'files': files}
        try:
            os.fsync(parent)
        except OSError:
            raise PublicationUnconfirmed(result) from None
        return result
    except PublicationUnconfirmed:
        raise
    except BaseException:
        raise InvitationError() from None
    finally:
        # Never recursively delete a caller path or remove a published bundle.
        if stage_fd is not None:
            if not published:
                for name in ('handoff.json', 'server-record.json'):
                    try:
                        os.unlink(name, dir_fd=stage_fd)
                    except FileNotFoundError:
                        pass
            os.close(stage_fd)
        if parent is not None:
            try:
                if stage_created and not published:
                    os.rmdir(stage, dir_fd=parent)
            finally:
                os.close(parent)


def main(argv=None):
    try:
        args = list(sys.argv[1:] if argv is None else argv)
        names = {'--request-file', '--allowlist-file', '--output-bundle'}
        require(len(args) == 6 and set(args[::2]) == names)
        values = dict(zip(args[::2], args[1::2]))
        result = generate(values['--request-file'], values['--allowlist-file'], values['--output-bundle'])
        print(json.dumps(result, sort_keys=True))
        return 0
    except PublicationUnconfirmed as error:
        print(json.dumps(error.result, sort_keys=True))
        return 2
    except BaseException:
        # No argparse echo, exception text, input content or tracebacks.
        print('{"status":"denied"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
