#!/usr/bin/env python3
"""Versioned, per-service alert incidents; no application imports or secrets in logs.

SMTP cannot guarantee exactly-once recipient delivery. A durable pending attempt
is therefore treated as unknown after interruption, never as permission to retry.
Recovery gets one attempt; an unchanged open failure never sends a reminder.
"""
import email.utils
import fcntl
import hashlib
import json
import os
import re
import secrets
import socket
import stat
import subprocess
import sys
import tempfile
import time


class AlertError(Exception):
    pass


def private_metadata(fd, directory=False):
    meta = os.fstat(fd)
    expected = 0o700 if directory else 0o600
    valid_type = stat.S_ISDIR(meta.st_mode) if directory else stat.S_ISREG(meta.st_mode)
    if (not valid_type or meta.st_uid != os.geteuid()
            or stat.S_IMODE(meta.st_mode) != expected
            or (not directory and meta.st_nlink != 1)):
        raise AlertError('state unavailable')


def read_private(directory, name):
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    except FileNotFoundError:
        return None
    with os.fdopen(fd, 'rb') as source:
        private_metadata(source.fileno())
        before = os.fstat(source.fileno())
        data = source.read(4097)
        after = os.fstat(source.fileno())
        linked = os.stat(name, dir_fd=directory, follow_symlinks=False)
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink',
                  'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if any(getattr(before, key) != getattr(after, key)
               or getattr(after, key) != getattr(linked, key) for key in fields):
            raise AlertError('state unavailable: changed during read')
    if len(data) > 4096 or not data.endswith(b'\n'):
        raise AlertError('state unavailable')
    return data


def replace_state(directory, name, value):
    temporary = name + '.' + secrets.token_hex(12) + '.tmp'
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=directory)
        with os.fdopen(fd, 'wb') as target:
            target.write((json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode())
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        os.fsync(directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def load_state(directory, name, service):
    data = read_private(directory, name)
    if data is None:
        # Preserve legacy evidence; import the old marker once, conservatively.
        legacy = read_private(directory, re.sub(r'[^A-Za-z0-9_.-]', '_', service) + '.last')
        if legacy is None:
            return None
        if not re.fullmatch(rb'[0-9]{1,16}\n', legacy):
            raise AlertError('state unavailable')
        value = dict(version=1, service=service, phase='open', kind='failure',
                     last_attempt=int(legacy), delivery='unknown')
        replace_state(directory, name, value)
        return value
    try:
        value = json.loads(data)
        base_keys = {'version', 'service', 'phase', 'kind', 'last_attempt', 'delivery'}
        if (not isinstance(value, dict)
                or type(value.get('version')) is not int or value['version'] not in (1, 2)
                or set(value) != (base_keys if value['version'] == 1
                                  else base_keys | {'failure_fingerprint'})
                or value['service'] != service or value['phase'] not in ('open', 'closed')
                or value['kind'] not in ('failure', 'reminder', 'recovery')
                or (value['phase'] == 'closed') != (value['kind'] == 'recovery')
                or type(value['last_attempt']) is not int or not 0 <= value['last_attempt'] <= 2**53
                or value['delivery'] not in ('pending', 'unknown', 'delivered', 'not_sent')):
            raise ValueError()
        if value['version'] == 2 and not (
                value['kind'] in ('failure', 'recovery')
                and
                isinstance(value['failure_fingerprint'], str)
                and re.fullmatch(r'[a-f0-9]{64}', value['failure_fingerprint'])):
            raise ValueError()
    except (ValueError, TypeError, UnicodeError):
        raise AlertError('state unavailable') from None
    if value['delivery'] == 'pending':
        value['delivery'] = 'unknown'
        replace_state(directory, name, value)
        print('ShareItToo alert previous delivery unknown for ' + service)
    return value


def failure_fingerprint(service):
    """Classify an exact failed invocation without retaining raw journal data."""
    properties = ('Id', 'InvocationID', 'Result', 'ExecMainCode', 'ExecMainStatus')
    result = subprocess.run(['systemctl', 'show', service,
                             '--property=' + ','.join(properties), '--no-pager'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=10, check=False, text=True)
    if result.returncode != 0 or len(result.stdout) > 4096:
        raise AlertError('failure identity unavailable')
    observed = {}
    for line in result.stdout.splitlines():
        key, separator, value = line.partition('=')
        if not separator or key not in properties or key in observed:
            raise AlertError('failure identity unavailable')
        observed[key] = value
    if (set(observed) != set(properties) or observed['Id'] != service
            or not re.fullmatch(r'[a-f0-9]{32}', observed['InvocationID'])
            or observed['Result'] not in ('exit-code', 'signal', 'core-dump', 'timeout',
                                         'watchdog', 'protocol', 'resources',
                                         'start-limit-hit', 'oom-kill')
            or not re.fullmatch(r'[0-9]{1,3}', observed['ExecMainCode'])
            or not re.fullmatch(r'[0-9]{1,3}', observed['ExecMainStatus'])
            or os.environ.get('MONITOR_UNIT', service) != service
            or os.environ.get('MONITOR_INVOCATION_ID', observed['InvocationID'])
            != observed['InvocationID']):
        raise AlertError('failure identity unavailable')
    tags = []
    if service == 'shareittoo-health.service':
        journal = subprocess.run(['journalctl', '--quiet', '--no-pager', '--output=json',
                                  '--lines=200', '_SYSTEMD_UNIT=' + service,
                                  '_SYSTEMD_INVOCATION_ID=' + observed['InvocationID']],
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 timeout=10, check=False, text=True)
        if journal.returncode != 0 or len(journal.stdout) > 262144:
            raise AlertError('failure identity unavailable')
        allowed = {'website', 'api', 'database', 'mail', 'release', 'release-identity',
                   'disk', 'backup', 'restore-check', 'container:shareittoo-web',
                   'container:shareittoo-api', 'container:shareittoo-postgres',
                   'health:shareittoo-api', 'health:shareittoo-postgres'}
        matches = []
        try:
            for line in journal.stdout.splitlines():
                record = json.loads(line)
                message = record.get('MESSAGE', '')
                if not isinstance(message, str) or not message.startswith('ShareItToo health check failed: '):
                    continue
                if (record.get('_SYSTEMD_UNIT') != service
                        or record.get('_SYSTEMD_INVOCATION_ID') != observed['InvocationID']):
                    raise ValueError()
                reasons = message.removeprefix('ShareItToo health check failed: ').split()
                if not reasons or not set(reasons) <= allowed or len(reasons) != len(set(reasons)):
                    raise ValueError()
                matches.append(sorted(reasons))
        except (ValueError, TypeError, AttributeError):
            raise AlertError('failure identity unavailable') from None
        if len(matches) != 1:
            raise AlertError('failure identity unavailable')
        tags = matches[0]
    # A subsequent timer invocation is not a new incident. Deliberately omit
    # invocation ID/time while binding target and actual failure classification.
    identity = {key: observed[key] for key in ('Id', 'Result', 'ExecMainCode', 'ExecMainStatus')}
    identity['tags'] = tags
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def smtp_settings():
    keys = {'MAIL_TRANSPORT', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_REQUIRE_TLS',
            'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'ALERT_EMAIL_TO'}
    values = {}
    try:
        with open(os.environ.get('ALERT_ENV_FILE', '/docker/shareittoo/backend/.env')) as source:
            for line in source:
                key, separator, value = line.rstrip('\n').partition('=')
                if separator and key in keys and key not in values:
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                        value = value[1:-1]
                    values[key] = value
    except OSError:
        pass
    if any(not values.get(key) for key in keys):
        try:
            result = subprocess.run(['docker', 'inspect', '--format',
                                     '{{range .Config.Env}}{{println .}}{{end}}',
                                     os.environ.get('ALERT_CONTAINER_NAME', 'shareittoo-api')],
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    timeout=10, check=False, text=True)
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    key, separator, value = line.partition('=')
                    if separator and key in keys and not values.get(key):
                        values[key] = value
        except (OSError, subprocess.SubprocessError):
            pass
    if (values.get('MAIL_TRANSPORT') != 'smtp' or not values.get('SMTP_HOST')
            or bool(values.get('SMTP_USER')) != bool(values.get('SMTP_PASSWORD'))
            or any('\r' in value or '\n' in value or '\x00' in value for value in values.values())):
        raise AlertError('SMTP alert delivery is not configured')
    return values


def send_mail(values, service, kind):
    def escaped(value):
        return value.replace('\\', '\\\\').replace('"', '\\"')

    mail_from = values.get('MAIL_FROM') or 'ShareItToo <contact@shareittoo.com>'
    recipient = values.get('ALERT_EMAIL_TO') or 'contact@shareittoo.com'
    envelope_from = email.utils.parseaddr(mail_from)[1]
    if not envelope_from:
        raise AlertError('SMTP alert delivery is not configured')
    subject = {'failure': 'ShareItToo critical service alert',
               'recovery': 'ShareItToo service recovered'}[kind]
    description = {'failure': 'A critical ShareItToo service check failed.',
                   'recovery': 'A later successful run confirms the ShareItToo service recovered.'}[kind]
    with tempfile.TemporaryDirectory(prefix='sit-alert-') as temporary:
        message_path = os.path.join(temporary, 'message.eml')
        config_path = os.path.join(temporary, 'curl.conf')
        message = ('From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\n'
                   'Content-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n\r\n'
                   'Service: %s\r\nHost: %s\r\nInspect with: systemctl status %s\r\n') % (
                       mail_from, recipient, subject, email.utils.formatdate(localtime=False),
                       description, service, socket.getfqdn(), service)
        with open(message_path, 'w', newline='') as target:
            target.write(message)
        scheme = 'smtps' if values.get('SMTP_SECURE') == 'true' else 'smtp'
        config = ['url = "%s://%s:%s"' % (scheme, escaped(values['SMTP_HOST']),
                                         escaped(values.get('SMTP_PORT') or '587'))]
        if values.get('SMTP_USER'):
            config.append('user = "%s:%s"' % (escaped(values['SMTP_USER']), escaped(values['SMTP_PASSWORD'])))
        config += ['mail-from = "%s"' % escaped(envelope_from),
                   'mail-rcpt = "%s"' % escaped(recipient),
                   'upload-file = "%s"' % escaped(message_path), 'fail', 'silent', 'max-time = 30']
        # Mandatory TLS for both authenticated SMTP and IP-allowlisted relay.
        config.append('ssl-reqd')
        with open(config_path, 'w') as target:
            target.write('\n'.join(config) + '\n')
        try:
            result = subprocess.run(['curl', '--config', config_path],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    timeout=35, check=False)
            return result.returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False


def incident(directory, service, mode):
    key = hashlib.sha256(service.encode()).hexdigest()
    try:
        lock = os.open(key + '.lock', os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK,
                       0o600, dir_fd=directory)
    except FileExistsError:
        # Do not race a nonexclusive create/open. Never replace a held lock inode.
        lock = os.open(key + '.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(lock, 'rb') as held:
        private_metadata(held.fileno())
        deadline = time.monotonic() + 50
        while True:
            try:
                fcntl.flock(held.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise AlertError('state unavailable: lock busy') from None
                time.sleep(0.05)
        name = key + '.json'
        previous = load_state(directory, name, service)
        state_snapshot = read_private(directory, name)
        if (None if state_snapshot is None else json.loads(state_snapshot)) != previous:
            raise AlertError('state unavailable: changed while locked')
        fingerprint = failure_fingerprint(service) if mode == 'failure' else (
            previous.get('failure_fingerprint') if previous else None)
        # V1 did not record a failure class; preserve its reader contract, then
        # bind one fresh classified event instead of claiming the class matched.
        if mode == 'recovery' and previous and fingerprint is None:
            fingerprint = hashlib.sha256(('legacy\n' + service).encode()).hexdigest()
        linked_lock = os.stat(key + '.lock', dir_fd=directory, follow_symlinks=False)
        held_lock = os.fstat(held.fileno())
        if ((linked_lock.st_dev, linked_lock.st_ino) != (held_lock.st_dev, held_lock.st_ino)
                or read_private(directory, name) != state_snapshot):
            raise AlertError('state unavailable: changed while locked')
        now = int(subprocess.check_output(['date', '+%s'], stderr=subprocess.DEVNULL, timeout=5))
        if now < 0:
            raise AlertError('state unavailable')
        opened = previous is not None and previous['phase'] == 'open'
        unsent = previous is not None and previous['delivery'] == 'not_sent'
        if mode == 'recovery' and not opened and not unsent:
            return 0
        if (mode == 'failure' and opened and not unsent
                and previous.get('failure_fingerprint') == fingerprint):
            print('ShareItToo alert suppressed unchanged failure for ' + service)
            return 0
        kind = 'recovery' if mode == 'recovery' else 'failure'
        state = dict(version=2, service=service, phase='closed' if mode == 'recovery' else 'open',
                     kind=kind, last_attempt=now, delivery='pending', failure_fingerprint=fingerprint)
        # Reserve durably before any transport. A crash cannot grant rapid retry.
        replace_state(directory, name, state)
        try:
            values = smtp_settings()
        except AlertError:
            state['delivery'] = 'not_sent'
            replace_state(directory, name, state)
            raise
        delivered = send_mail(values, service, kind)
        state['delivery'] = 'delivered' if delivered else 'unknown'
        try:
            replace_state(directory, name, state)
        except (OSError, AlertError):
            raise AlertError('state unavailable; delivery unknown') from None
        if not delivered:
            raise AlertError('delivery unknown; attempt retained')
        print('ShareItToo alert delivered for %s (%s)' % (service, kind))
        return 0


def main():
    os.umask(0o077)
    service = sys.argv[1] if len(sys.argv) >= 2 else ''
    mode = sys.argv[2] if len(sys.argv) >= 3 else 'failure'
    policy = os.environ.get('ALERT_NOTIFICATION_POLICY', 'transitions-only')
    if (len(sys.argv) > 3 or not re.fullmatch(r'[A-Za-z0-9_.@:-]{1,160}', service)
            or mode not in ('failure', 'recovery') or policy != 'transitions-only'):
        print('Invalid alert service, mode or notification policy', file=sys.stderr)
        return 2
    state_dir = os.environ.get('ALERT_STATE_DIR', '/var/lib/shareittoo-alerts')
    try:
        try:
            os.mkdir(state_dir, 0o700)
            # Persist a newly created directory's parent entry before reserving mail.
            parent = os.open(os.path.dirname(os.path.abspath(state_dir)), os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(parent)
            finally:
                os.close(parent)
        except FileExistsError:
            pass
        directory = os.open(state_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            private_metadata(directory, directory=True)
            return incident(directory, service, mode)
        finally:
            os.close(directory)
    except AlertError as error:
        print('ShareItToo alert ' + str(error), file=sys.stderr)
    except OSError as error:
        trace = error.__traceback__
        while trace.tb_next:
            trace = trace.tb_next
        print('ShareItToo alert state unavailable (errno=%s, phase=%s:%s)' % (
            error.errno, trace.tb_frame.f_code.co_name, trace.tb_lineno), file=sys.stderr)
    except (ValueError, subprocess.SubprocessError):
        print('ShareItToo alert state unavailable', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
