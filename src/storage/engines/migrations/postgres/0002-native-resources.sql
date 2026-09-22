CREATE TABLE IF NOT EXISTS native_resources (
    handle VARCHAR(128) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    resource_key VARCHAR(1024) NOT NULL,
    doc JSONB NOT NULL,
    integrity CHAR(64) NOT NULL,
    updated_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (handle, kind, resource_key)
);

CREATE INDEX IF NOT EXISTS native_resources_updated
    ON native_resources(handle, kind, updated_at DESC);
