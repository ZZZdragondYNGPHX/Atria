CREATE TABLE IF NOT EXISTS native_resources (
    handle VARCHAR(128) NOT NULL,
    kind VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    resource_key VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    doc JSON NOT NULL,
    integrity CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (handle, kind, resource_key),
    INDEX native_resources_updated (handle, kind, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
