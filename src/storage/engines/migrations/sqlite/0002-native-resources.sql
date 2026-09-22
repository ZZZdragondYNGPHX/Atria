CREATE TABLE IF NOT EXISTS native_resources (
    handle TEXT NOT NULL,
    kind TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    doc TEXT NOT NULL,
    integrity TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (handle, kind, resource_key)
);

CREATE INDEX IF NOT EXISTS native_resources_updated
    ON native_resources(handle, kind, updated_at DESC);
