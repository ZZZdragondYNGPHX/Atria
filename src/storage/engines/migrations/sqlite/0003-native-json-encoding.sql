-- Native docs now accept the existing ATRZ1 encoding as BLOBs. The version
-- fence prevents older hosts from treating compressed rows as JSON text.
-- This shrinking worklist avoids rescanning already encoded history.
CREATE INDEX IF NOT EXISTS native_resources_plain_json
    ON native_resources(handle) WHERE typeof(doc) = 'text';
