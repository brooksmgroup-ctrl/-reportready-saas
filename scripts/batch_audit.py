#!/usr/bin/env python3
"""
ReportReady batch audit runner — extended (internal tool).

Reads a list of URLs (one per line, "#" comments allowed) from a file, POSTs
each to the production audit API (https://getreportready.com/api/audit) with
a short pause between requests, adds a per-URL technical-setup layer
(robots.txt status + blocked AI crawlers + WAF/block fingerprint), handles
failures gracefully, and writes a summary: CSV + Markdown table into
/home/team/shared/audits/<batch>-<date> (.csv + .md).

OPTIONAL GROUP COLUMN (new in this version):
    Each line may carry a group label after a TAB or "|", e.g.
        https://TripHippies.com  |tech-mixed
        https://My-Symbian.com    |tech-mixed
    When groups are present, the markdown output gains a per-group summary
    section: n tested, n walled, n AI-blocked (robots), avg scores, and the
    invisible-image total per group (parsed from issue messages).

New per-URL columns (always appended, empty when probe fails):
    robots_status      -> 200 / 403 / missing / error
    robots_cf_managed  -> Y if the Cloudflare "managed content" AI-block
                          template is present (BEGIN Cloudflare Managed /
                          Content-Signal), else n
    ai_robots_blocked  -> semicolon-list of AI user-agents disallowed by
                          robots.txt, each with its disallow line, e.g.
                          "GPTBot: /; CCBot: /"
    wall               -> OPEN / cloudflare-challenge / http-403 /
                          robots-block / network-error

Usage:
    python3 /home/team/shared/scripts/batch_audit.py <urls-file> [--batch NAME]
    python3 /home/team/shared/scripts/batch_audit.py <urls-file> --pause 2 --timeout 60

Notes:
- Standard library only (urllib + subprocess curl for the probes). No deps.
- Points at the LIVE production API — never localhost.
- Per-request timeout defaults to 60s; a hung site fails fast, the batch
  never aborts.
- Robots/WAF probes use a browser-ish UA (same family the audit uses) so we
  distinguish "deliberate robots.txt block" from "technical wall" without
  manual curl.
"""
import argparse
import csv
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://getreportready.com/api/audit"
OUT_DIR = "/home/team/shared/audits"
CAT_MSGS = 400  # truncate issue-message cells in the markdown table (CSV keeps full text)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0"

# AI crawlers we track (name = the exact User-agent token in robots.txt).
AI_BOTS = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User", "Google-Extended", "CCBot",
    "ClaudeBot", "PerplexityBot", "Bytespider", "Amazonbot",
    "Applebot-Extended", "Common Crawl",
]

IMG_RE = re.compile(r"(\d+)\s+images?\s+can't be seen by AI", re.I)


def load_entries(path: str) -> list[dict]:
    """One line per entry. Optional group label: split on '|' or TAB."""
    entries: list[dict] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            url = line
            group = ""
            for sep in ("|", "\t"):
                if sep in line:
                    url, _, group = line.partition(sep)
                    url, group = url.strip(), group.strip()
                    break
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            entries.append({"url": url, "group": group})
    return entries


def audit_one(url: str, timeout: int) -> dict:
    body = json.dumps({"url": url}).encode("utf-8")
    req = urllib.request.Request(
        API, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    scores = payload.get("scores", {})
    issues = payload.get("issues", [])
    return {
        "url": url,
        "status": "ok",
        "seo": scores.get("seo", ""),
        "performance": scores.get("performance", ""),
        "accessibility": scores.get("accessibility", ""),
        "ai_readiness": scores.get("aiReadiness", ""),
        "ai_crawlers_blocked": "; ".join(payload.get("aiCrawlersBlocked", [])),
        "issues_count": len(issues),
        "issue_messages": " | ".join(
            f"[{i.get('category', '')}] {i.get('message', '')}" for i in issues
        ),
        "error": "",
    }


# ---------------- technical layer (robots.txt + WAF) ----------------

def _curl(args: list[str]) -> tuple[str, str]:
    """Return (stdout, stderr). Runs curl with a browser-ish UA and a cap."""
    cmd = ["curl", "-s", "--max-time", "20", "-A", UA] + args
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return r.stdout, r.stderr
    except Exception as exc:  # noqa: BLE001
        return "", str(exc)


def probe_robots(url: str) -> dict:
    """Fetch /robots.txt; report status, CF-managed template, blocked AI bots."""
    out = {"robots_status": "error", "robots_cf_managed": "n", "ai_robots_blocked": ""}
    body, _ = _curl(["-w", "\n%{http_code}", url.rstrip("/") + "/robots.txt"])
    if not body:
        return out
    parts = body.rsplit("\n", 1)
    http_code = parts[1].strip() if len(parts) == 2 else "?"
    if http_code == "404":
        out["robots_status"] = "missing"
    elif http_code in ("403", "401"):
        out["robots_status"] = f"robots-{http_code}"
    elif http_code.startswith("2") or http_code == "?":  # 200 or redirect already followed
        out["robots_status"] = "200"
    else:
        out["robots_status"] = http_code or "error"

    txt = parts[0] if len(parts) == 2 else body
    if "BEGIN Cloudflare Managed" in txt or "Content-Signal" in txt:
        out["robots_cf_managed"] = "Y"
    out["ai_robots_blocked"] = "; ".join(parse_ai_disallows(txt)) or ""
    return out


def parse_ai_disallows(robots_text: str) -> list[str]:
    """Robots.txt UA->Disallow map; return '<Bot>: <disallow>' for AI bots."""
    if not robots_text:
        return []
    ua = None
    disallow_by_ua: dict[str, list[str]] = {}
    ua_tokens: dict[str, str] = {}
    for line in robots_text.splitlines():
        line = line.strip()
        m = re.match(r"^\s*User-agent\s*:\s*(.+)$", line, re.I)
        if m:
            ua = m.group(1).strip()
            ua_tokens.setdefault(ua, ua)
            continue
        if ua:
            m = re.match(r"^\s*Disallow\s*:\s*(.*)$", line, re.I)
            if m:
                disallow_by_ua.setdefault(ua, []).append(m.group(1).strip() or "/")
    blocked: list[str] = []
    wildcard = disallow_by_ua.get("*", [])
    for bot in AI_BOTS:
        rules = disallow_by_ua.get(bot) or []
        if not rules and wildcard:
            rules = wildcard
        hit = next((d for d in rules if d), None)
        if hit is not None:
            blocked.append(f"{bot}: {hit or '/'}")
    return blocked


def probe_wall(url: str) -> str:
    """HEAD the homepage with browser UA; classify door."""
    head, _ = _curl(["-I", url])
    if not head:
        return "network-error"
    low = head.lower()
    if "cf-mitigated: challenge" in low:
        return "cloudflare-challenge"
    if "cf-mitigated" in low:
        return "cloudflare-challenge"
    m = re.search(r"^HTTP/\S+\s+(\d+)", head, re.M)
    code = m.group(1) if m else "?"
    if code in ("403", "401"):
        for line in head.lower().splitlines():
            if "server:" in line and "cloudflare" in line:
                return "cloudflare-challenge"
        return "robots-403"
    if code in ("503", "429"):
        return "cloudflare-challenge" if "cloudflare" in head.lower() else f"http-{code}"
    return "open"


def fingerprint(url: str) -> dict:
    """Combine robots + wall probes into one tech layer."""
    out = probe_robots(url)
    out["wall"] = probe_wall(url)
    if out["robots_status"] in ("robots-403",):
        out["wall"] = "robots-block"
    if out["robots_cf_managed"] == "Y":
        out["wall"] = "cf-managed-block"
    return out


# ---------------- aggregates ----------------

def cat_counts(rows: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in rows:
        if r["status"] != "ok":
            continue
        for part in r["issue_messages"].split(" | "):
            if part.startswith("[") and "]" in part:
                cat = part[1: part.index("]")]
                counts[cat] = counts.get(cat, 0) + 1
    return counts


def crawler_counts(rows: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in rows:
        if r["status"] != "ok":
            continue
        for c in r["ai_crawlers_blocked"].split("; "):
            if c:
                counts[c] = counts.get(c, 0) + 1
    return counts


def invisible_images(row: dict) -> int:
    if row["status"] != "ok":
        return 0
    total = 0
    for part in row["issue_messages"].split(" | "):
        m = IMG_RE.search(part)
        if m:
            total += int(m.group(1))
    return total


def md_cell(s: str, limit: int) -> str:
    s = s.replace("|", "/").replace("\n", " ")
    return s if len(s) <= limit else s[: limit - 1] + "…"


def group_summary(rows: list[dict]) -> str:
    """Per-group MD summary: n, ok, walls, robots-blocks, avg scores, images."""
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(r.get("group") or "ungrouped", []).append(r)
    out = ["", "## Group summary", "",
           "| Group | n | ok | walls | robots-403 | cf-managed | avg AI | images |",
           "|---|---|---|---|---|---|---|---|"]
    for g in sorted(groups):
        gr = groups[g]
        ok = [r for r in gr if r["status"] == "ok"]
        walls = sum(1 for r in gr if r.get("wall") in
                    ("cloudflare-challenge", "robots-block", "cf-managed-block"))
        r403 = sum(1 for r in gr if "403" in r.get("wall", ""))
        cfm = sum(1 for r in gr if r.get("robots_cf_managed") == "Y")
        ai_avg = ""
        if ok:
            vals = [int(x) for x in (r["ai_readiness"] for r in ok) if x != ""]
            ai_avg = round(sum(vals) / len(vals)) if vals else ""
        imgs = sum(invisible_images(r) for r in ok)
        out.append(
            f"| {g} | {len(gr)} | {len(ok)} | {walls} | {r403} | {cfm} | "
            f"{ai_avg} | {imgs} |"
        )
    return "\n".join(out)


def main() -> int:
    p = argparse.ArgumentParser(description="ReportReady batch audit runner (extended)")
    p.add_argument("urls_file", help="text file, one URL per line (# = comment; optional '|group' or TAB label)")
    p.add_argument("--batch", default=None, help="batch name for the output files")
    p.add_argument("--pause", type=float, default=1.5, help="pause between requests, seconds (default 1.5)")
    p.add_argument("--timeout", type=int, default=60, help="per-request timeout, seconds (default 60)")
    args = p.parse_args()

    if not os.path.exists(args.urls_file):
        print(f"error: no such file: {args.urls_file}", file=sys.stderr)
        return 2
    entries = load_entries(args.urls_file)
    if not entries:
        print("error: no URLs found", file=sys.stderr)
        return 2

    batch = args.batch or os.path.splitext(os.path.basename(args.urls_file))[0]
    date = datetime.date.today().isoformat()
    stem = os.path.join(OUT_DIR, f"{batch.replace(os.sep, '-')}-{date}")
    if os.path.exists(stem + ".csv"):
        stem += "-" + datetime.datetime.now().strftime("%H%M%S")
    csv_path, md_path = stem + ".csv", stem + ".md"

    print(f"auditing {len(entries)} URLs via {API} (pause={args.pause}s, timeout={args.timeout}s)")
    rows: list[dict] = []
    for i, e in enumerate(entries, 1):
        url = e["url"]
        try:
            row = audit_one(url, args.timeout)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                json.JSONDecodeError, OSError) as exc:
            row = {
                "url": url, "status": "error", "seo": "", "performance": "",
                "accessibility": "", "ai_readiness": "", "ai_crawlers_blocked": "",
                "issues_count": "", "issue_messages": "", "error": str(exc)[:200],
            }
        row["group"] = e["group"]
        row.update(fingerprint(url))
        # Honesty rule: a server error on the audit API for the URL itself is a
        # wall signal (a crawler could not read the page). If the audit failed
        # AND the redirect/browser probe looks fine, mark it as a wall anyway —
        # never report an errored audit as "open / clean".
        if row["status"] == "error" and row.get("wall") == "open":
            row["wall"] = "cloudflare-challenge"
        rows.append(row)
        line = f"[{i}/{len(entries)}] {row['status'].upper():5} {url}"
        if row["status"] == "ok":
            line += (f" AI={row['ai_readiness']} SEO={row['seo']} "
                     f"Perf={row['performance']} Acc={row['accessibility']}")
            wall = row.get("wall") or ""
            if wall != "open":
                line += f" WALL={wall}"
        print(line)
        if i < len(entries):
            time.sleep(args.pause)

    os.makedirs(OUT_DIR, exist_ok=True)
    fields = ["url", "group", "status", "seo", "performance", "accessibility",
              "ai_readiness", "ai_crawlers_blocked", "issues_count", "issue_messages",
              "robots_status", "robots_cf_managed", "ai_robots_blocked", "wall", "error"]
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write("| URL | Group | SEO | Perf | Acc | AI | Crawlers blocked | Robots | Wall | Issues |\n")
        fh.write("|---|---|---|---|---|---|---|---|---|---|\n")
        for r in rows:
            issues = ""
            if r["status"] == "ok":
                if r.get("issues_count"):
                    issues = f"{r['issues_count']} - {md_cell(r.get('issue_messages', ''), CAT_MSGS)}"
            else:
                issues = md_cell("error: " + r.get("error", ""), CAT_MSGS)
            robots = md_cell(
                (r.get("robots_status", "") or "") +
                (" [CF-managed]" if r.get("robots_cf_managed") == "Y" else "") +
                (" | " + md_cell(r.get("ai_robots_blocked", "") or "", 60) if r.get("ai_robots_blocked") else ""),
                90,
            )
            fh.write(
                f"| {md_cell(r['url'], 55)} | {md_cell(r.get('group',''), 14)} "
                f"| {r.get('ai_readiness','')} | {r.get('performance','')} "
                f"| {r.get('accessibility','')} | {r.get('seo','')} "
                f"| {md_cell(r.get('ai_crawlers_blocked',''), 40)} | {robots} "
                f"| {md_cell(r.get('wall',''), 22)} | {issues} |\n"
            )
        fh.write(group_summary(rows))
        fh.write(
            f"\n\ngenerated {datetime.datetime.now().isoformat()} | "
            f"total={len(rows)} ok={sum(r['status']=='ok' for r in rows)} "
            f"errors={sum(r['status']!='ok' for r in rows)}\n"
        )

    print("---")
    okn = sum(1 for r in rows if r["status"] == "ok")
    errn = len(rows) - okn
    print(f"TOTAL {len(rows)} | ok {okn} | errors {errn}")
    for r in rows:
        if r["status"] != "ok":
            print(f"  error: {r['url']} -> {r['error']}")
    counts = cat_counts(rows)
    if counts:
        print("Issues by category:")
        for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"  {k}: {v}")
    crawlers = crawler_counts(rows)
    if crawlers:
        print("AI crawlers blocked (sites):")
        for k, v in sorted(crawlers.items(), key=lambda kv: -kv[1]):
            print(f"  {k}: {v}")
    walls = [r for r in rows if r.get("wall") and r["wall"] != "open"]
    if walls:
        print("Walls:")
        for r in walls:
            print(f"  {r['url']} -> {r['wall']}")
    print(f"wrote: {csv_path}")
    print(f"wrote: {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())