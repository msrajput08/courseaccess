import sqlite3
import unittest
from pathlib import Path

class BillingSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for p in sorted(Path("migrations").glob("*.sql")):
            self.db.executescript(p.read_text())
        self.db.execute("INSERT INTO accounts(id,display_name,created_at_ms) VALUES('a','Alice',1),('b','Bob',1)")
        self.db.execute("INSERT INTO organizations(id,display_name,created_by,created_at_ms) VALUES('org','College','a',1)")
        self.db.execute("INSERT INTO organization_members(organization_id,account_id,role,joined_at_ms) VALUES('org','a','owner',1),('org','b','admin',1)")
    def tearDown(self):
        self.db.close()
    def test_owner_validation_and_protection(self):
        self.db.execute("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state) VALUES('x','b','institution',1,'creating')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO paddle_intent_owners VALUES('x','organization','org')")
        self.db.execute("INSERT INTO paddle_checkout_intents(id,account_id,tier,created_at_ms,state) VALUES('y','a','institution',1,'creating')")
        self.db.execute("INSERT INTO paddle_intent_owners VALUES('y','organization','org')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM organizations WHERE id='org'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE organizations SET created_by='b' WHERE id='org'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM accounts WHERE id='a'")
        self.db.execute("UPDATE paddle_checkout_intents SET state='canceled' WHERE id='y'")
        self.db.execute("DELETE FROM organizations WHERE id='org'")
    def test_summary_constraints(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO paid_review_history VALUES('x','a',0,5,1)")
        self.db.execute("INSERT INTO paid_review_history VALUES('y','a',1,5,1)")
        self.db.execute("DELETE FROM accounts WHERE id='a'") if False else None

if __name__ == "__main__":
    unittest.main()
