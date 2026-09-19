#!/usr/bin/env python3
"""Optional repo-local Codex guardrails for SIT.

This script deliberately has no product/runtime imports. It consumes the
official Codex hook JSON shape on stdin and emits only bounded hook decisions.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile


DESTRUCTIVE_GIT_TOKEN = "SIT_DESTRUCTIVE_GIT_APPROVED=R0_DESTRUCTIVE_GIT_GO"
EXTERNAL_MUTATION_TOKEN = "SIT_EXTERNAL_MUTATION_APPROVED=R0_EXTERNAL_MUTATION_GO"

DESTRUCTIVE_GIT = re.compile(
    r"\bgit\s+(?:-[^\s]+\s+)*(?:"
    r"reset\s+--hard\b|"
    r"clean\s+-[^\s;|&]*f[^\s;|&]*\b|"
    r"push\b[^\n;|&]*(?:--force(?:-with-lease)?\b|-f\b|--delete\b)|"
    r"rebase\b|"
    r"merge\b[^\n;|&]*--squash\b|"
    r"branch\s+-(?:d|D)\b|"
    r"tag\s+-d\b"
    r")",
    re.IGNORECASE,
)

PROTECTED_BRANCH_PUSH = re.compile(
    r"\bgit\s+(?:-[^\s]+\s+)*push\b[^\n;|&]*"
    r"(?:\b(?:main|master)\b|refs/heads/(?:main|master)\b)",
    re.IGNORECASE,
)

CURRENT_BRANCH_MUTATION = re.compile(
    r"\bgit\s+(?:-[^\s]+\s+)*(?:commit|merge|rebase|cherry-pick|revert|push)\b",
    re.IGNORECASE,
)

EXTERNAL_MUTATIONS = (
    ("pull-request merge", re.compile(r"\bgh\s+pr\s+merge\b", re.IGNORECASE)),
    ("mutating GitHub API", re.compile(
        r"\bgh\s+api\b[^\n;|&]*(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)\b",
        re.IGNORECASE,
    )),
    ("Firebase deployment", re.compile(r"\bfirebase\s+deploy\b", re.IGNORECASE)),
    ("Google Cloud mutation", re.compile(
        r"\bgcloud\b[^\n;|&]*\b(?:deploy|create|delete|update|replace|set-traffic)\b",
        re.IGNORECASE,
    )),
    ("Kubernetes mutation", re.compile(
        r"\bkubectl\s+(?:--[^\s]+\s+)*(?:apply|create|delete|edit|patch|replace|rollout|scale|set)\b",
        re.IGNORECASE,
    )),
    ("Helm mutation", re.compile(r"\bhelm\s+(?:install|upgrade|uninstall|rollback)\b", re.IGNORECASE)),
    ("Terraform mutation", re.compile(
        r"\bterraform\s+(?:apply|destroy|import|taint|untaint)\b",
        re.IGNORECASE,
    )),
    ("Pulumi mutation", re.compile(r"\bpulumi\s+(?:up|destroy|import)\b", re.IGNORECASE)),
    ("AWS mutation", re.compile(
        r"\baws\b[^\n;|&]*\b(?:create|delete|deploy|put|update|change-resource-record-sets)\b|"
        r"\baws\s+s3\s+(?:cp|mv|rm|sync)\b",
        re.IGNORECASE,
    )),
    ("Cloudflare mutation", re.compile(
        r"\b(?:wrangler\s+(?:deploy|publish|delete)|cloudflared\s+tunnel\s+route)\b",
        re.IGNORECASE,
    )),
    ("production hosting deployment", re.compile(
        r"\b(?:vercel|netlify\s+deploy)\b[^\n;|&]*--prod\b",
        re.IGNORECASE,
    )),
    ("real payment provider mutation", re.compile(
        r"\bstripe\s+(?:trigger|listen\b[^\n;|&]*--forward-to|"
        r"(?:payment_intents|charges|refunds|customers|accounts|transfers|payouts|"
        r"subscriptions|invoices|invoiceitems|prices|products|"
        r"checkout\s+sessions|billing_portal\s+sessions|identity\s+verification_sessions)\s+"
        r"(?:create|update|cancel|confirm|capture|expire))\b",
        re.IGNORECASE,
    )),
    ("provider billing mutation", re.compile(
        r"\bgcloud\s+billing\b[^\n;|&]*\b(?:link|unlink|enable|disable)\b",
        re.IGNORECASE,
    )),
    ("KYC provider mutation", re.compile(
        r"\b(?:onfido|persona|sumsub)\b[^\n;|&]*\b(?:create|update|delete|submit)\b",
        re.IGNORECASE,
    )),
    ("Store automation", re.compile(
        r"\b(?:bundle\s+exec\s+)?fastlane\b|\bupload_to_play_store\b|"
        r"\bgradle(?:w)?\b[^\n;|&]*\bpublish(?:Bundle)?\b|"
        r"\bxcrun\s+(?:altool\b[^\n;|&]*--upload-app|notarytool\s+submit)\b|"
        r"\bfirebase\s+appdistribution:distribute\b",
        re.IGNORECASE,
    )),
    ("public release mutation", re.compile(
        r"\bgh\s+release\s+(?:create|delete|edit|upload)\b",
        re.IGNORECASE,
    )),
    ("remote host mutation path", re.compile(
        r"(?:^|[;&|]\s*)(?:env\s+[^;&|]+\s+)?(?:ssh|scp|sftp|rsync)\b",
        re.IGNORECASE,
    )),
    ("mutating production HTTP request", re.compile(
        r"\bcurl\b[^\n;|&]*(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b"
        r"[^\n;|&]*(?:prod(?:uction)?|api\.stripe\.com|api\.openai\.com|play\.google\.com|"
        r"cloudflare|onfido|withpersona|sumsub)",
        re.IGNORECASE,
    )),
)

SECRET_PATTERNS = (
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    re.compile(rb"\bsk-(?!example|test|fake)[A-Za-z0-9_-]{20,}"),
    re.compile(rb"\bghp_[A-Za-z0-9]{30,}"),
    re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{40,}"),
    re.compile(rb"\bglpat-[A-Za-z0-9_-]{20,}"),
    re.compile(rb"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}"),
    re.compile(rb"\bAIza[0-9A-Za-z_-]{35}\b"),
)

OAUTH_BEARER = re.compile(rb"\bBearer\s+([A-Za-z0-9._~+/=-]{20,})", re.IGNORECASE)
SENSITIVE_ASSIGNMENT = re.compile(
    rb"\b(?:password|passwd|pwd|api[_-]?key|oauth[_-]?token|access[_-]?token|"
    rb"client[_-]?secret|keystore[_-]?password|key[_-]?password|"
    rb"store[_-]?password|signing[_-]?password)[\"']?\s*(?:=|:)\s*"
    rb"[\"']?([^\s\"';|&]{8,})",
    re.IGNORECASE,
)
SENSITIVE_ARGUMENT = re.compile(
    rb"(?:--password|--api[_-]?key|--oauth[_-]?token|--access[_-]?token|"
    rb"--client[_-]?secret|--keystore[_-]?password|--key[_-]?password|"
    rb"--store[_-]?password|--signing[_-]?password)\s+"
    rb"[\"']?([^\s\"';|&]{8,})",
    re.IGNORECASE,
)
PLACEHOLDER_WORDS = frozenset({
    b"example", b"test", b"fake", b"dummy", b"redacted", b"placeholder",
    b"changeme", b"replace_me", b"replace-me",
})
SIGNING_SECRET_SUFFIXES = frozenset({".jks", ".keystore", ".p12", ".pfx"})

PACKAGE_COMPLETION_COMMANDS = {
    "R12_HOOKS_CODEX_AUTONOMY_GUARDRAILS": (
        ("node", "--test", "test/tool/blue_ocean_n11_codex_hook_behavior.test.mjs"),
        ("node", "--test", "test/tool/r12_codex_hook_guardrails.test.mjs"),
        ("node", "--test", "test/tool/validate_r12_codex_hook_guardrails.test.mjs"),
        ("node", "tool/validate_r12_codex_hook_guardrails.mjs"),
    ),
    "R14_HEILBRONN_WAVE0_OPERATIONS": (
        ("node", "--test", "test/tool/run_r9_database_recovery.test.mjs"),
        ("node", "--test", "test/tool/blue_ocean_n9_wave0_wiring.test.mjs"),
        ("node", "--test", "test/tool/validate_blue_ocean_n9_heilbronn_wave0.test.mjs"),
        ("node", "--test", "test/tool/validate_r14_heilbronn_wave0_operations.test.mjs"),
        ("node", "tool/validate_r14_heilbronn_wave0_operations.mjs"),
    ),
    "R15_GOOGLE_PLAY_INTERNAL_READY_PACK": (
        ("node", "--test", "test/tool/validate_android_signing_config.test.mjs"),
        ("node", "--test", "test/tool/archive_android_release_candidate.test.mjs"),
        ("node", "--test", "test/tool/r15_google_play_internal_ready_pack_wiring.test.mjs"),
        ("node", "--test", "test/tool/validate_r15_google_play_internal_ready_pack.test.mjs"),
        ("node", "tool/validate_r15_google_play_internal_ready_pack.mjs"),
    ),
    "R16_PR7_PILOT_FREEZE_INTEGRATION_REVIEW": (
        ("node", "--test", "test/tool/r16_pr7_pilot_freeze_integration_review_wiring.test.mjs"),
        ("node", "--test", "test/tool/validate_r16_pr7_pilot_freeze_integration_review.test.mjs"),
        ("node", "tool/validate_r16_pr7_pilot_freeze_integration_review.mjs"),
    ),
    "R17_TWO_DAY_PRIORITY_QUEUE": (
        ("node", "--test", "test/tool/archive_android_release_candidate.test.mjs"),
        ("node", "--test", "test/tool/r17_two_day_priority_queue_wiring.test.mjs"),
        ("node", "--test", "test/tool/validate_r17_two_day_priority_queue.test.mjs"),
        ("node", "tool/validate_r17_two_day_priority_queue.mjs"),
        ("node", "tool/validate_privacy_disclosures.mjs"),
    ),
}


def read_input() -> dict:
    try:
        value = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as error:
        raise RuntimeError("invalid Codex hook input") from error
    if not isinstance(value, dict):
        raise RuntimeError("invalid Codex hook input")
    return value


def emit_denial(reason: str) -> None:
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


def git_root(cwd: str) -> Path | None:
    result = subprocess.run(
        ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
        capture_output=True,
        check=False,
        text=True,
        timeout=5,
    )
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip()).resolve()


def current_branch(root: Path) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(root), "branch", "--show-current"],
        capture_output=True,
        check=False,
        text=True,
        timeout=5,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def is_placeholder(value: bytes) -> bool:
    lowered = value.strip().strip(b"\"'").lower()
    if lowered.startswith((b"$", b"<")):
        return True
    normalized = re.sub(rb"[^a-z0-9_-]+", b"", lowered)
    return any(
        normalized == marker
        or normalized.startswith(marker + b"_")
        or normalized.startswith(marker + b"-")
        for marker in PLACEHOLDER_WORDS
    )


def contains_probable_secret(content: bytes) -> bool:
    if any(pattern.search(content) for pattern in SECRET_PATTERNS):
        return True
    bearer = OAUTH_BEARER.search(content)
    if bearer is not None and not is_placeholder(bearer.group(1)):
        return True
    assignments = (
        list(SENSITIVE_ASSIGNMENT.finditer(content))
        + list(SENSITIVE_ARGUMENT.finditer(content))
    )
    return any(not is_placeholder(match.group(1)) for match in assignments)


def is_read_only_text_search(command: str) -> bool:
    if any(marker in command for marker in ("\n", ";", "|", "&", "`", "$(")):
        return False
    try:
        arguments = shlex.split(command)
    except ValueError:
        return False
    if not arguments or Path(arguments[0]).name not in {"rg", "grep"}:
        return False
    return "--pre" not in arguments and not any(value.startswith("--pre=") for value in arguments)


def protected_main_mutation(command: str, root: Path | None) -> bool:
    if PROTECTED_BRANCH_PUSH.search(command):
        return True
    return (
        root is not None
        and current_branch(root) in {"main", "master"}
        and CURRENT_BRANCH_MUTATION.search(command) is not None
    )


def staged_paths(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
        capture_output=True,
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError("unable to inspect staged paths")
    return [entry.decode("utf-8", "surrogateescape") for entry in result.stdout.split(b"\0") if entry]


def scan_staged_secrets(root: Path) -> str | None:
    for path in staged_paths(root):
        if Path(path).suffix.lower() in SIGNING_SECRET_SUFFIXES:
            return path
        result = subprocess.run(
            ["git", "-C", str(root), "show", f":{path}"],
            capture_output=True,
            check=False,
            timeout=10,
        )
        if result.returncode != 0:
            raise RuntimeError("unable to inspect staged content")
        content = result.stdout
        if len(content) > 2 * 1024 * 1024 or b"\0" in content:
            continue
        if contains_probable_secret(content):
            return path
    return None


def run_fast_validators(root: Path) -> str | None:
    whitespace = subprocess.run(
        ["git", "-C", str(root), "diff", "--cached", "--check"],
        capture_output=True,
        check=False,
        timeout=20,
    )
    if whitespace.returncode != 0:
        return "staged whitespace validation failed"

    validators = sorted((root / "tool").glob("validate_blue_ocean_n*.mjs"))
    optional = (
        root / "tool" / "validate_pilot_launch_tiers.mjs",
        root / "tool" / "validate_external_gate_setup.mjs",
        root / "tool" / "validate_external_gate_execution_board.mjs",
    )
    validators.extend(path for path in optional if path.is_file())
    for validator in validators:
        result = subprocess.run(
            ["node", str(validator)],
            cwd=root,
            capture_output=True,
            check=False,
            timeout=30,
        )
        if result.returncode != 0:
            return f"fast SIT validator failed: {validator.name}"
    return None


def git_check(root: Path, arguments: list[str], failure: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        capture_output=True,
        check=False,
        timeout=20,
    )
    return None if result.returncode == 0 else failure


def working_tree_clean(root: Path) -> bool:
    result = subprocess.run(
        ["git", "-C", str(root), "status", "--porcelain=v1", "--untracked-files=all"],
        capture_output=True,
        check=False,
        timeout=20,
    )
    if result.returncode != 0:
        raise RuntimeError("unable to inspect working tree")
    return result.stdout == b""


def package_completion_failure(root: Path, package: str) -> str | None:
    commands = PACKAGE_COMPLETION_COMMANDS.get(package)
    if commands is None:
        return "no exact focused-test policy exists for this package"
    for arguments, failure in (
        (["diff", "--check"], "working-tree whitespace validation failed"),
        (["diff", "--cached", "--check"], "staged whitespace validation failed"),
    ):
        result = git_check(root, arguments, failure)
        if result is not None:
            return result
    try:
        if not working_tree_clean(root):
            return "working tree is not clean"
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        return "working-tree policy could not be verified"
    for command in commands:
        try:
            result = subprocess.run(
                command,
                cwd=root,
                capture_output=True,
                check=False,
                timeout=45,
            )
        except (OSError, subprocess.TimeoutExpired):
            return "required focused test could not complete"
        if result.returncode != 0:
            return "required focused test failed"
    try:
        if not working_tree_clean(root):
            return "focused tests changed the working tree"
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        return "post-test working-tree policy could not be verified"
    return None


def pre_tool(payload: dict) -> int:
    if payload.get("tool_name") != "Bash":
        return 0
    tool_input = payload.get("tool_input")
    command = tool_input.get("command", "") if isinstance(tool_input, dict) else ""
    if not isinstance(command, str):
        emit_denial("SIT guardrail blocked an invalid Bash command payload.")
        return 0

    if contains_probable_secret(command.encode("utf-8", "surrogatepass")):
        emit_denial(
            "Probable password, API key, OAuth bearer material or signing secret blocked in command input."
        )
        return 0

    root = git_root(str(payload.get("cwd", ".")))
    read_only_text_search = is_read_only_text_search(command)
    if (not read_only_text_search
            and (DESTRUCTIVE_GIT.search(command) or protected_main_mutation(command, root))
            and DESTRUCTIVE_GIT_TOKEN not in command):
        emit_denial(
            "Destructive Git command blocked, including protected-branch or history-rewrite mutation. A separately approved exact command must include the SIT destructive-Git token."
        )
        return 0
    if not read_only_text_search and EXTERNAL_MUTATION_TOKEN not in command:
        for label, pattern in EXTERNAL_MUTATIONS:
            if pattern.search(command):
                emit_denial(
                    f"External {label} blocked. No production, payment, Store, VPS, DNS or Cloud mutation is authorized."
                )
                return 0

    if re.search(r"\bgit\s+(?:-[^\s]+\s+)*commit\b", command, re.IGNORECASE):
        if root is None:
            emit_denial("SIT pre-commit guard could not resolve the repository root.")
            return 0
        try:
            secret_path = scan_staged_secrets(root)
            if secret_path is not None:
                emit_denial(f"High-confidence secret pattern detected in staged file: {secret_path}")
                return 0
            failure = run_fast_validators(root)
        except (OSError, RuntimeError, subprocess.TimeoutExpired):
            emit_denial("SIT pre-commit validation could not complete safely.")
            return 0
        if failure is not None:
            emit_denial(failure)
            return 0
    return 0


def session_start() -> int:
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": (
                "SIT repo-local hooks are optional defense in depth and never replace owner gates, "
                "permissions, CI or full regression. If and only if work must stop at a real gate, "
                "end with SIT_PENDING_GATE: <UPPER_SNAKE_TOKEN>. Before declaring a package green, "
                "end with SIT_PACKAGE_GREEN: <UPPER_SNAKE_TOKEN>."
            ),
        }
    }, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


def write_pending_gate_document(root: Path, gate: str) -> None:
    directory = root / "docs"
    if directory.is_symlink():
        raise RuntimeError("unsafe docs directory")
    if directory.exists():
        if not directory.is_dir():
            raise RuntimeError("unsafe docs directory")
    else:
        directory.mkdir(mode=0o700)
    target = directory / f"SIT_PENDING_GATE_{gate}.md"
    content = (
        f"# SIT pending gate: `{gate}`\n\n"
        "- State: `PENDING`\n"
        "- Source: Codex Stop hook\n"
        "- Contains personal data: `false`\n\n"
        "Dependent work remains stopped until the governing SIT instruction records "
        "the exact owner decision and evidence.\n"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(target, flags, 0o600)
    except FileExistsError:
        if target.is_symlink() or not target.is_file() or target.read_text(encoding="utf-8") != content:
            raise RuntimeError("pending gate document already exists with different content")
        return
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(content)


def write_pending_gate_metadata(root: Path, gate: str) -> None:
    path_result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--git-path", "codex/sit-pending-gate.json"],
        capture_output=True,
        check=False,
        text=True,
        timeout=5,
    )
    if path_result.returncode != 0:
        raise RuntimeError("unable to resolve pending gate metadata")
    target = Path(path_result.stdout.strip())
    if not target.is_absolute():
        target = root / target
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    record = {
        "schemaVersion": 1,
        "state": "pending",
        "gate": gate,
        "source": "codex-stop-hook",
        "containsPersonalData": False,
    }
    descriptor, temporary = tempfile.mkstemp(prefix=".sit-pending-", dir=target.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(record, handle, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def emit_stop_block(reason: str, already_active: bool) -> None:
    if already_active:
        json.dump({
            "continue": False,
            "stopReason": reason,
            "systemMessage": reason,
        }, sys.stdout, separators=(",", ":"))
    else:
        json.dump({"decision": "block", "reason": reason}, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


def stop(payload: dict) -> int:
    message = payload.get("last_assistant_message")
    if isinstance(message, str):
        match = re.search(r"(?:^|\n)SIT_PENDING_GATE:\s*([A-Z][A-Z0-9_]{2,79})(?:\s|$)", message)
        if match:
            root = git_root(str(payload.get("cwd", ".")))
            if root is None:
                emit_stop_block(
                    "SIT pending-gate artifact could not be recorded safely.",
                    payload.get("stop_hook_active") is True,
                )
                return 0
            try:
                write_pending_gate_document(root, match.group(1))
                write_pending_gate_metadata(root, match.group(1))
            except (OSError, RuntimeError, subprocess.TimeoutExpired):
                emit_stop_block(
                    "SIT pending-gate artifact could not be recorded safely.",
                    payload.get("stop_hook_active") is True,
                )
                return 0
        green = re.search(r"(?:^|\n)SIT_PACKAGE_GREEN:\s*([A-Z][A-Z0-9_]{2,79})(?:\s|$)", message)
        if green:
            root = git_root(str(payload.get("cwd", ".")))
            if root is None:
                emit_stop_block(
                    "SIT package completion blocked: repository root is unavailable.",
                    payload.get("stop_hook_active") is True,
                )
                return 0
            failure = package_completion_failure(root, green.group(1))
            if failure is not None:
                emit_stop_block(
                    f"SIT package completion blocked: {failure}.",
                    payload.get("stop_hook_active") is True,
                )
                return 0
    sys.stdout.write("{}\n")
    return 0


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"session-start", "pre-tool", "stop"}:
        return 2
    try:
        payload = read_input()
    except RuntimeError:
        return 2
    if sys.argv[1] == "session-start":
        return session_start()
    if sys.argv[1] == "pre-tool":
        return pre_tool(payload)
    return stop(payload)


if __name__ == "__main__":
    raise SystemExit(main())
