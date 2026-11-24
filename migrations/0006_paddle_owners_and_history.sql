CREATE TABLE IF NOT EXISTS paddle_intent_owners (
 intent_id TEXT PRIMARY KEY REFERENCES paddle_checkout_intents(id) ON DELETE CASCADE,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('account','organization')),
 owner_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paddle_intent_owner ON paddle_intent_owners(owner_kind,owner_id);
CREATE TRIGGER IF NOT EXISTS guard_paddle_intent_owner BEFORE INSERT ON paddle_intent_owners
BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM paddle_checkout_intents i WHERE i.id=NEW.intent_id AND
 ((NEW.owner_kind='account' AND i.tier='pro' AND i.account_id=NEW.owner_id)
 OR (NEW.owner_kind='organization' AND i.tier='institution' AND EXISTS(
 SELECT 1 FROM organization_members m WHERE m.organization_id=NEW.owner_id AND m.account_id=i.account_id AND m.role='owner')))
 ) THEN RAISE(ABORT,'Invalid billing owner') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM paddle_intent_owners o JOIN paddle_checkout_intents i ON i.id=o.intent_id
 WHERE o.owner_kind=NEW.owner_kind AND o.owner_id=NEW.owner_id AND i.state IN ('creating','ready','review'))
 OR EXISTS(SELECT 1 FROM subscriptions s WHERE s.owner_kind=NEW.owner_kind AND s.owner_id=NEW.owner_id AND s.provider='paddle' AND s.status IN ('active','trialing','past_due'))
 THEN RAISE(ABORT,'Existing billing obligation') END;
END;
CREATE TRIGGER IF NOT EXISTS guard_paid_account_delete BEFORE DELETE ON accounts
WHEN EXISTS(SELECT 1 FROM subscriptions WHERE owner_kind='account' AND owner_id=OLD.id AND provider='paddle' AND status IN ('active','trialing','past_due'))
OR EXISTS(SELECT 1 FROM paddle_checkout_intents WHERE account_id=OLD.id AND state IN ('creating','ready','review'))
BEGIN SELECT RAISE(ABORT,'Resolve billing before deleting account'); END;
CREATE TRIGGER IF NOT EXISTS guard_paid_org_delete BEFORE DELETE ON organizations
WHEN EXISTS(SELECT 1 FROM subscriptions WHERE owner_kind='organization' AND owner_id=OLD.id AND provider='paddle' AND status IN ('active','trialing','past_due'))
OR EXISTS(SELECT 1 FROM paddle_intent_owners o JOIN paddle_checkout_intents i ON i.id=o.intent_id WHERE o.owner_kind='organization' AND o.owner_id=OLD.id AND i.state IN ('creating','ready','review'))
BEGIN SELECT RAISE(ABORT,'Resolve institution billing before deletion'); END;
CREATE TRIGGER IF NOT EXISTS guard_paid_org_transfer BEFORE UPDATE OF created_by ON organizations
WHEN NEW.created_by<>OLD.created_by AND (EXISTS(SELECT 1 FROM subscriptions WHERE owner_kind='organization' AND owner_id=OLD.id AND provider='paddle' AND status IN ('active','trialing','past_due'))
OR EXISTS(SELECT 1 FROM paddle_intent_owners o JOIN paddle_checkout_intents i ON i.id=o.intent_id WHERE o.owner_kind='organization' AND o.owner_id=OLD.id AND i.state IN ('creating','ready','review')))
BEGIN SELECT RAISE(ABORT,'Resolve institution billing before ownership transfer'); END;
CREATE TABLE IF NOT EXISTS paid_review_history (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 page_count INTEGER NOT NULL CHECK(page_count BETWEEN 1 AND 10000),
 finding_count INTEGER NOT NULL CHECK(finding_count BETWEEN 0 AND 100000),
 created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paid_review_account ON paid_review_history(account_id,created_at_ms);
