-- Preserve JSON content exactly across all engines. MySQL binary JSON converts
-- some IEEE-754 doubles to a different decimal on output, invalidating Native
-- integrity hashes and GC timestamps. JSON functions (including chat integrity)
-- continue to operate on validated JSON text. Repeating each ALTER is safe.
ALTER TABLE native_resources MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE chats MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE chat_states MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE settings MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE presets MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE preset_states MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE worlds MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE named_docs MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE groups_table MODIFY COLUMN doc LONGTEXT NOT NULL;
ALTER TABLE stats MODIFY COLUMN doc LONGTEXT NOT NULL;
