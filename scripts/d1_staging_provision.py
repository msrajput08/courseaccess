#!/usr/bin/env python3
"""Reconcile ONLY the dedicated CourseAccess staging D1 database in Cloudflare.

This script does not change wrangler.jsonc, create a production database, deploy
a Worker, enable accounts, or touch existing customer records.
Run only with the separate, scoped CLOUDFLARE_D1_WRITE_TOKEN in GitHub Actions.
"""
import json
import os
from pathlib import Path
import re
import subprocess

NAME = "courseaccess-staging"
CONFIG = Path("wrangler.d1.staging.audit.jsonc")
EXPECTED = {
    "accounts", "passkey_credentials", "sessions", "auth_challenges",
    "organizations", "organization_members", "auth_rate_limits",
    "subscriptions", "usage_periods", "usage_events", "payment_event_receipts",
    "d1_migrations", "reserve_usage_before_insert", "reserve_usage_after_insert",
    "idx_organization_one_owner",
}


def wrangler(*argv: str) -> str:
    proc = subprocess.run(
        ["npx", "wrangler", "d1", *argv],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=os.environ.copy(), check=False, timeout=180,
    )
    if proc.returncode:
        # Never print token or the entire environment.
        message = (proc.stderr or proc.stdout).strip()[-1200:]
        raise RuntimeError(f"Wrangler D1 command failed: {argv[0]}: {message}")
    return proc.stdout.strip()


def databases() -> list[dict]:
    result = json.loads(wrangler("list", "--json"))
    if not isinstance(result, list):
        raise RuntimeError("Cloudflare D1 list response is not an array")
    return result


def rows(sql: str) -> list[dict]:
    result = json.loads(wrangler(
        "execute", "DB", "--remote", "--config", str(CONFIG), "--json",
        "--command", sql
    ))
    if not isinstance(result, list):
        raise RuntimeError("Unexpected Cloudflare D1 query structure")
    data = []
    for item in result:
        if not isinstance(item, dict) or item.get("success") is False:
            raise RuntimeError("Remote D1 verification query failed")
        entries = item.get("results")
        if not isinstance(entries, list):
            raise RuntimeError("D1 query did not return row results")
        data.extend(entries)
    return data


def main() -> None:
    if not os.getenv("CLOUDFLARE_API_TOKEN") or not os.getenv("CLOUDFLARE_ACCOUNT_ID"):
        raise RuntimeError("Missing scoped D1 Edit token or account ID")
    candidates = [db for db in databases() if db.get("name") == NAME]
    if len(candidates) > 1:
        raise RuntimeError("Duplicate staging databases: refusing ambiguous provisioning")
    if not candidates:
        print("Creating only the dedicated CourseAccess staging D1 database.")
        wrangler("create", NAME, "--update-config=false")
        candidates = [db for db in databases() if db.get("name") == NAME]
    if len(candidates) != 1:
        raise RuntimeError("Cloudflare D1 staging database was not found after creation")
    db_id = candidates[0].get("uuid") or candidates[0].get("id")
    if not isinstance(db_id, str) or not re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",db_id,re.I
    ):
        raise RuntimeError("Invalid Cloudflare staging database UUID")
    config = {
        "name": "courseaccess-d1-staging-audit",
        "main": "server/index.ts",
        "compatibility_date": "2026-11-20",
        "d1_databases": [{
            "binding": "DB", "database_name": NAME, "database_id": db_id,
            "migrations_dir": "migrations",
        }],
        "vars": {"COURSEACCESS_ACCOUNTS_ENABLED": "false"}
    }
    CONFIG.write_text(json.dumps(config, indent=2), encoding="utf-8")
    try:
        print("Verified a dedicated staging database; production Worker remains unchanged.")
        wrangler("migrations", "apply", "DB", "--remote", "--config", str(CONFIG))
        found = {str(row.get("name")) for row in rows(
            "SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger')"
        )}
        missing = EXPECTED - found
        if missing:
            raise RuntimeError("Missing required staging schema: " + ", ".join(sorted(missing)))
        if rows("PRAGMA foreign_key_check"):
            raise RuntimeError("Foreign key integrity violations in staging")
        count = rows("SELECT COUNT(*) AS n FROM d1_migrations")
        if not count or int(count[0].get("n", 0)) < 2:
            raise RuntimeError("Expected both prebilling D1 migrations to be tracked")
        print(f"Staging D1 schema verified: {len(EXPECTED)} required objects, 2+ migrations, no FK violations.")
        print("No production account activation, subscriptions, checkout, or Worker deployment.")
    finally:
        CONFIG.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
