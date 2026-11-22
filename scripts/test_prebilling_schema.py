"""Offline SQLite proof for the prebilling D1 schema; no live accounts or payments."""
from pathlib import Path
import sqlite3
import unittest

SCHEMA=Path(__file__).resolve().parents[1]/"migrations"/"0001_prebilling.sql"

def db():
    con=sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA.read_text(encoding="utf-8"))
    return con

def account(con,id):
    con.execute("INSERT INTO accounts(id,display_name,created_at_ms) VALUES(?,?,?)",
                (id,"Educator "+id,1_000_000))

def reserve(con,account_id,key,period="2026-11"):
    con.execute("INSERT OR IGNORE INTO usage_events(idempotency_key,account_id,period_utc,occurred_at_ms,operation) VALUES(?,?,?,?,?)",
                (key,account_id,period,1_000_500,"document-processing"))

class TestPrebillingSchema(unittest.TestCase):
    def test_schema_integrity_and_foreign_keys(self):
        con=db()
        self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0],"ok")
        self.assertEqual(con.execute("PRAGMA foreign_keys").fetchone()[0],1)
        self.assertRaises(sqlite3.IntegrityError,
                          con.execute,"INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES('token','missing',1,2)")
        self.assertRaises(sqlite3.IntegrityError,
                          con.execute,"INSERT INTO accounts(id,display_name,created_at_ms) VALUES('blank','',1)")

    def test_atomic_quota_and_idempotent_retries(self):
        con=db()
        account(con,"a")
        con.execute("INSERT INTO usage_periods(account_id,period_utc,quota,used) VALUES('a','2026-11',2,0)")
        reserve(con,"a","event-1")
        reserve(con,"a","event-1")
        reserve(con,"a","event-2")
        self.assertEqual(con.execute("SELECT used FROM usage_periods WHERE account_id='a'").fetchone()[0],2)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM usage_events").fetchone()[0],2)
        with self.assertRaisesRegex(sqlite3.IntegrityError,"Monthly quota exhausted"):
            reserve(con,"a","event-3")
        reserve(con,"a","event-1")  # A retry is not a third charge.
        self.assertEqual(con.execute("SELECT used FROM usage_periods WHERE account_id='a'").fetchone()[0],2)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM usage_events").fetchone()[0],2)

    def test_period_and_account_isolation(self):
        con=db()
        account(con,"a")
        account(con,"b")
        for owner,period,limit in (("a","2026-11",1),("b","2026-11",1),("a","2026-12",2)):
            con.execute("INSERT INTO usage_periods(account_id,period_utc,quota,used) VALUES(?,?,?,0)",(owner,period,limit))
        reserve(con,"a","one")
        reserve(con,"b","two")
        reserve(con,"a","three","2026-12")
        self.assertEqual(con.execute("SELECT SUM(used) FROM usage_periods").fetchone()[0],3)
        self.assertRaises(sqlite3.IntegrityError,reserve,con,"a","four","2026-11")
        with self.assertRaises(sqlite3.IntegrityError):
            reserve(con,"b","five","2026-12")

    def test_deletion_cascades_credentials_sessions_and_usage(self):
        con=db()
        account(con,"a")
        con.execute("INSERT INTO passkey_credentials(credential_id,account_id,cose_public_key,sign_count,created_at_ms) VALUES(?,?,?,?,?)",("key","a",bytes([1,2]),0,100))
        con.execute("INSERT INTO sessions(token_hash,account_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?)",("hashed-not-raw","a",1,1000))
        con.execute("INSERT INTO usage_periods(account_id,period_utc,quota,used) VALUES(?,?,?,0)",("a","2026-11",2))
        reserve(con,"a","event-1")
        con.execute("DELETE FROM accounts WHERE id='a'")
        for table in ("passkey_credentials","sessions","usage_periods","usage_events"):
            self.assertEqual(con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0],0)

    def test_organization_membership_roles_and_webhook_dedupe(self):
        con=db()
        account(con,"owner")
        account(con,"faculty")
        con.execute("INSERT INTO organizations(id,display_name,created_by,created_at_ms) VALUES('uni','University','owner',100)")
        con.execute("INSERT INTO organization_members VALUES('uni','owner','owner',100)")
        con.execute("INSERT INTO organization_members VALUES('uni','faculty','editor',100)")
        with self.assertRaises(sqlite3.IntegrityError):
            con.execute("INSERT INTO organization_members VALUES('uni','faculty','superadmin',100)")
        con.execute("INSERT INTO payment_event_receipts(provider,provider_event_id,verified_at_ms) VALUES('provider','evt_123',100)")
        with self.assertRaises(sqlite3.IntegrityError):
            con.execute("INSERT INTO payment_event_receipts(provider,provider_event_id,verified_at_ms) VALUES('provider','evt_123',101)")

if __name__=="__main__":
    unittest.main()
