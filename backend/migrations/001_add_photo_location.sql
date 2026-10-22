-- Execute once, after review and backup, using backend/migrate.py --apply.
-- No table recreation, data deletion or update of existing records.
-- The runner wraps this entire file in a transaction.
SET LOCAL lock_timeout = '5s';
ALTER TABLE occurrences
    ADD COLUMN latitude DOUBLE PRECISION NULL,
    ADD COLUMN longitude DOUBLE PRECISION NULL,
    ADD COLUMN photo_path VARCHAR NULL;
