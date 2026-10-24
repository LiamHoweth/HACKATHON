#!/usr/bin/env python3
"""Check local inline Markdown links and common sensitive filenames, without deps."""

from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


INLINE_LINK = re.compile(r"!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+\"[^\"\n]*\")?\s*\)")
PRIVATE_SUFFIXES = {".pem", ".key", ".p8", ".p12", ".pfx", ".pkcs12", ".mobileprovision"}
PRIVATE_NAMES = {"id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", "credentials.json", ".netrc"}


def sensitive_filename(path: Path) -> bool:
    name = path.name.lower()
    if name == ".env" or (name.startswith(".env.") and not name.endswith(".example")):
        return True
    if name in PRIVATE_NAMES or path.suffix.lower() in PRIVATE_SUFFIXES:
        return True
    if name.startswith("service-account") and name.endswith(".json"):
        return True
    return name == "credentials" and ".aws" in path.parts


def markdown_without_code(content: str) -> str:
    """Ignore fenced examples so illustrative links are not treated as real links."""
    lines = []
    fence = None
    for line in content.splitlines():
        marker = re.match(r"^\s*(`{3,}|~{3,})", line)
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            lines.append("")
        else:
            lines.append(line if fence is None else "")
    return "\n".join(lines)


def check_repository(root: Path) -> list[str]:
    root = root.resolve()
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    paths = sorted({Path(p.decode("utf-8")) for p in result.stdout.split(b"\0") if p})
    errors = []
    for relative in paths:
        if sensitive_filename(relative):
            errors.append(f"{relative}: sensitive filename; remove from Git and use a safe example")
            continue
        source = root / relative
        if not source.resolve().is_relative_to(root):
            errors.append(f"{relative}: file resolves outside the repository")
            continue
        if source.suffix.lower() != ".md":
            continue
        try:
            content = markdown_without_code(source.read_text(encoding="utf-8"))
        except (OSError, UnicodeError):
            errors.append(f"{relative}: cannot read Markdown as UTF-8")
            continue
        for match in INLINE_LINK.finditer(content):
            target = match.group(1) or match.group(2)
            try:
                parsed = urlsplit(target)
            except ValueError:
                errors.append(f"{relative}: malformed link")
                continue
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            destination = (source.parent / unquote(parsed.path)).resolve()
            # Print no link contents: even a malformed URL might contain a secret.
            line = content.count("\n", 0, match.start()) + 1
            if not destination.is_relative_to(root):
                errors.append(f"{relative}:{line}: local link leaves the repository")
            elif not destination.exists():
                errors.append(f"{relative}:{line}: local link target does not exist")
    return errors


def main() -> int:
    try:
        errors = check_repository(Path(__file__).resolve().parent.parent)
    except (OSError, subprocess.CalledProcessError, UnicodeError) as error:
        print(f"Repository check could not run ({type(error).__name__}).", file=sys.stderr)
        return 1
    if errors:
        print("Repository hygiene failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Repository hygiene passed: local Markdown file links and common sensitive filenames.")
    print("External URLs, heading anchors, secret values, and application behavior are not checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
