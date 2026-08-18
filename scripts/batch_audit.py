#!/usr/bin/env python3
"""
ReportReady batch audit runner (internal tool).

Audits a list of URLs through the production audit API
(https://getreportready.com/api/audit) in a bounded-concurrency batch and
writes a clean summary: CSV + Markdown table.

Usage:
    python3 scripts/batch_audit.py urls.txt
    python3 scripts/batch_audit.py --input urls.txt --workers 4 --outdir out
    python3 scripts/batch_audit.py --urls "example.com" "getreportready.com"

Input file: one URL per line. Blank lines and lines starting with # are
ignored. Schemeless URLs get https:// prepended.

Output: <outdir>/audit_results.csv and <outdir>/audit_results.md
(print a Markdown table to stdout as the batch completes).
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

DEFAULT_API = "https://getreportready.com/api/audit"
SCORE_KEYS = ("ai_readiness", "seo", "performance", "accessibility")


def normalize_url(raw: str) -> str | None:
    """Trim, skip blanks/comments, prefix https:// when no scheme given."""
    url = raw.strip()
    if not url or url.startswith("#"):
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def load_urls(path: str | None, inline: list[str]) -> list[str]:
    urls: list[str] = []
    if path:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                u = normalize_url(line)
                if u:
                    urls.append(u)
    for item in inline:
        u = normalize_url(item)
        if u:
            urls.append(u)
    # Dedupe preserving order
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def audit_one(api: str, url: str, timeout: int, retries: int) -> dict:
    """POST one URL to the audit API. Returns a result row dict."""
    row = {"url": url, "status": "ok", "error": ""}
    for attempt in range(retries + 1):
        try:
            body = json.dumps({"url": url}).encode("utf-8")
            req = urllib.request.Request(
                api, data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if resp.status != 200 or "scores" not in payload:
                raise RuntimeError(payload.get("error") or f"HTTP {resp.status}")
            scores = payload.get("scores", {})
            row["ai_readiness"] = scores.get("aiReadiness", 0)
            row["seo"] = scores.get("seo", 0)
            row["performance"] = scores.get("performance", 0)
            row["accessibility"] = scores.get("accessibility", 0)
            row["crawlers_blocked"] = "|".join(payload.get("aiCrawlersBlocked", []))
            issues = payload.get("issues", [])
            if issues:
                row["issues"] = f"[{len(issues)}] " + " | ".join(
                    (m.get("message", "")[:200] for m in issues)
                )
            else:
                row["issues"] = "0"
            row["timestamp"] = payload.get("timestamp", "")
            return row
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError,
                json.JSONDecodeError, TimeoutError) as exc:
            last = str(exc)
            if attempt < retries:
                time.sleep(3 * (attempt + 1))
            else:
                row["status"] = "error"
                row["error"] = last[:300]
    return row


def require_https(api: str) -> str:
    return api if api.startswith("http") else "https://" + api


def md_cell(s: str) -> str:
    """Escape markdown-table-breaking pipes in a cell."""
    return str(s).replace("|", "/")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", nargs="?", help="text file with one URL per line")
    p.add_argument("--urls", nargs="*", default=[], help="inline URLs to audit")
    p.add_argument("--api", default=DEFAULT_API, help="audit API base URL")
    p.add_argument("--workers", type=int, default=2, help="concurrent audits (default 2)")
    p.add_argument("--timeout", type=int, default=90, help="per-request timeout s (default 90)")
    p.add_argument("--retries", type=int, default=2, help="retries per URL on failure")
    p.add_argument("--outdir", default="audit-out", help="output directory (default audit-out)")
    args = p.parse_args()

    if not args.input and not args.urls:
        print("error: pass a URL file or --urls", file=sys.stderr)
        return 2
    try:
        urls = load_urls(args.input, args.urls)
    except OSError as e:
        print(f"error: cannot read input: {e}", file=sys.stderr)
        return 2
    if not urls:
        print("error: no URLs to audit", file=sys.stderr)
        return 2

    api = require_https(args.api)
    print(f"auditing {len(urls)} URLs -> {api} (workers={args.workers})", file=sys.stderr)

    rows = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futs = {pool.submit(audit_one, api, u, args.timeout, args.retries): u for u in urls}
        for fut in as_completed(futs):
            row = fut.result()
            rows.append(row)
            done = len(rows)
            mark = "ok" if row["status"] == "ok" else "ERR"
            print(f"[{done}/{len(urls)}] {mark} {row['url']} "
                  f"AI={row.get('ai_readiness', '-')} "
                  f"SEO={row.get('seo', '-')} "
                  f"Perf={row.get('performance', '-')} "
                  f"Acc={row.get('accessibility', '-')} "
                  f"{('blocked:' + row['crawlers_blocked']) if row.get('crawlers_blocked') else ''}",
                  file=sys.stderr)

    # Order back to input order
    order = {u: i for i, u in enumerate(urls)}
    rows.sort(key=lambda r: order.get(r["url"], 0))

    os.makedirs(args.outdir, exist_ok=True)
    csv_path = os.path.join(args.outdir, "audit-results.csv")
    md_path = os.path.join(args.outdir, "audit-results.md")

    headers = ["url"] + list(SCORE_KEYS) + ["crawlers_blocked", "issues", "status", "error"]
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write("| URL | AI Readiness | SEO | Perf | Acc | Crawlers blocked | Issues | Status |\n")
        fh.write("|---|---|---|---|---|---|---|---|\n")
        for r in rows:
            if r["status"] == "ok":
                status = "ok"
            else:
                status = f"error: {r['error'][:80]}"
            fh.write(
                f"| {md_cell(r['url'])} | {md_cell(r.get('ai_readiness', ''))} | {md_cell(r.get('seo', ''))} "
                f"| {md_cell(r.get('performance', ''))} | {md_cell(r.get('accessibility', ''))} "
                f"| {md_cell(r.get('crawlers_blocked', ''))} | {md_cell(r.get('issues', ''))} | {md_cell(status)} |\n"
            )

    print(f"\nwrote {csv_path} and {md_path}", file=sys.stderr)
    print("---")
    with open(md_path, encoding="utf-8") as fh:
        print(fh.read())
    ok = sum(1 for r in rows if r["status"] == "ok")
    print(f"---\n{ok}/{len(rows)} audits succeeded")
    return 0


if __name__ == "__main__":
    sys.exit(main())