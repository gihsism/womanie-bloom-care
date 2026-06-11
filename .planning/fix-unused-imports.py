#!/usr/bin/env python3
"""One-off: remove unused *imports* reported by tsc (TS6133 on import
lines, TS6192 whole-statement). Leaves non-import TS6133 (variables)
untouched for manual review. Run from repo root; iterate until stable."""
import re
import subprocess
import sys

ERR_RE = re.compile(r"^(.+?)\((\d+),(\d+)\): error (TS6133|TS6192): '?([\w$]*)'?")


def tsc_errors():
    out = subprocess.run(
        ["npx", "tsc", "-b", "--pretty", "false"], capture_output=True, text=True
    ).stdout
    errs = []
    for line in out.splitlines():
        m = ERR_RE.match(line)
        if m:
            errs.append((m.group(1), int(m.group(2)), m.group(4), m.group(5)))
    return errs


def remove_member(line, name):
    """Remove `name` (or `x as name`) from a brace import list on this line."""
    pat = re.compile(r"(?:[\w$]+\s+as\s+)?" + re.escape(name) + r"\b")
    m_braces = re.search(r"\{([^}]*)\}", line)
    if not m_braces:
        return None
    members = [s.strip() for s in m_braces.group(1).split(",") if s.strip()]
    kept = [s for s in members if not pat.fullmatch(s)]
    if len(kept) == len(members):
        return None
    if kept:
        return line[: m_braces.start()] + "{ " + ", ".join(kept) + " }" + line[m_braces.end():]
    # brace list now empty
    before = line[: m_braces.start()].rstrip()
    if re.search(r"import\s+[\w$]+\s*,\s*$", before):  # default import remains
        return re.sub(r",\s*$", " ", before) + line[m_braces.end():]
    return ""  # whole statement gone


def fix_file(path, errs):
    with open(path) as f:
        lines = f.readlines()
    changed = False
    for lineno, code, name in sorted(errs, key=lambda e: -e[0]):
        i = lineno - 1
        if i >= len(lines):
            continue
        line = lines[i]
        if code == "TS6192":
            # delete statement from this line through the one containing 'from' or ';'
            j = i
            while j < len(lines) and "from" not in lines[j] and not lines[j].rstrip().endswith(";"):
                j += 1
            del lines[i : j + 1]
            changed = True
            continue
        # TS6133 — only touch import lines / member-per-line inside imports
        stripped = line.strip()
        member_only = re.fullmatch(
            r"(?:[\w$]+\s+as\s+)?" + re.escape(name) + r"\s*,?", stripped
        )
        if member_only:
            # verify we're inside an import block: scan up for 'import' before any ';'
            k = i - 1
            inside = False
            while k >= 0:
                s = lines[k].strip()
                if s.startswith("import"):
                    inside = True
                    break
                if s.endswith(";") or s.startswith("}"):
                    break
                k -= 1
            if inside:
                del lines[i]
                changed = True
                continue
        if "import" in line:
            new = remove_member(line, name)
            if new is None:
                # default import unused? `import Name from` / `import Name, {..} from`
                m = re.match(r"^(\s*import\s+)" + re.escape(name) + r"\s*,\s*(.*)$", line)
                if m:
                    lines[i] = m.group(1) + m.group(2) + ("\n" if not m.group(2).endswith("\n") else "")
                    changed = True
                elif re.match(r"^\s*import\s+" + re.escape(name) + r"\s+from", line):
                    del lines[i]
                    changed = True
                continue
            if new == "":
                del lines[i]
            else:
                lines[i] = new
            changed = True
    if changed:
        with open(path, "w") as f:
            f.writelines(lines)
    return changed


for round_ in range(6):
    errs = tsc_errors()
    by_file = {}
    for path, lineno, code, name in errs:
        by_file.setdefault(path, []).append((lineno, code, name))
    any_change = False
    for path, file_errs in by_file.items():
        if fix_file(path, file_errs):
            any_change = True
    print(f"round {round_}: {len(errs)} errors, changed={any_change}")
    if not any_change:
        break
