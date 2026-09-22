import { FsEngine } from './engines/fs-engine.js';
import { SqliteEngine } from './engines/sqlite-engine.js';
import { MysqlEngine } from './engines/mysql-engine.js';
import { PgEngine } from './engines/postgres-engine.js';
import { ChatRepo } from './repositories/chat-repo.js';
import { SettingsRepo } from './repositories/settings-repo.js';
import { PresetRepo } from './repositories/preset-repo.js';
import { WorldInfoRepo } from './repositories/world-info-repo.js';
import { NamedDocRepo } from './repositories/named-doc-repo.js';
import { GroupRepo } from './repositories/group-repo.js';
import { StatsRepo } from './repositories/stats-repo.js';
import {
    AssetStore,
    KnowledgeRepo,
    PackageRepo,
    SavePointRepo,
    SessionRepo,
    WorldRepo,
} from '../native/repositories/index.js';

export { setReadOnly, isReadOnly, withReadOnlyBypass } from './read-only-mode.js';

let _engine = null;
let _chatRepo = null;
let _settingsRepo = null;
let _presetRepo = null;
let _worldInfoRepo = null;
let _namedDocRepo = null;
let _groupRepo = null;
let _statsRepo = null;
let _packageRepo = null;
let _worldRepo = null;
let _knowledgeRepo = null;
let _sessionRepo = null;
let _savePointRepo = null;
let _assetStore = null;

export function initStorage({
    mode = 'fs',
    directoriesByHandle,
    mysql,
    postgres,
    acquireTimeoutMs,
    retries,
} = {}) {
    if (mode === 'fs') {
        _engine = new FsEngine({ directoriesByHandle });
    } else if (mode === 'sqlite') {
        _engine = new SqliteEngine({ directoriesByHandle });
    } else if (mode === 'mysql') {
        if (!mysql || typeof mysql.url !== 'string' || !mysql.url) {
            throw new Error('initStorage: mode=mysql requires storage.mysql.url in config');
        }
        _engine = new MysqlEngine({
            url: mysql.url,
            poolSize: mysql.poolSize,
            acquireTimeoutMs,
            retries,
        });
    } else if (mode === 'postgres') {
        if (!postgres || typeof postgres.url !== 'string' || !postgres.url) {
            throw new Error('initStorage: mode=postgres requires storage.postgres.url in config');
        }
        _engine = new PgEngine({
            url: postgres.url,
            poolSize: postgres.poolSize,
            acquireTimeoutMs,
            retries,
        });
    } else {
        throw new Error(`initStorage: unknown storage mode "${mode}" (expected 'fs', 'sqlite', 'mysql', or 'postgres')`);
    }
    _chatRepo = new ChatRepo({ engine: _engine });
    _settingsRepo = new SettingsRepo({ engine: _engine });
    _presetRepo = new PresetRepo({ engine: _engine });
    _worldInfoRepo = new WorldInfoRepo({ engine: _engine });
    _namedDocRepo = new NamedDocRepo({ engine: _engine });
    _groupRepo = new GroupRepo({ engine: _engine });
    _statsRepo = new StatsRepo({ engine: _engine });
    _packageRepo = new PackageRepo({ engine: _engine });
    _worldRepo = new WorldRepo({ engine: _engine });
    _knowledgeRepo = new KnowledgeRepo({ engine: _engine });
    _sessionRepo = new SessionRepo({ engine: _engine });
    _savePointRepo = new SavePointRepo({ engine: _engine });
    _assetStore = new AssetStore({ engine: _engine, directoriesByHandle });
}

export function getChatRepo() {
    if (!_chatRepo) throw new Error('storage not initialized; call initStorage() first');
    return _chatRepo;
}

export function getSettingsRepo() {
    if (!_settingsRepo) throw new Error('storage not initialized; call initStorage() first');
    return _settingsRepo;
}

export function getPresetRepo() {
    if (!_presetRepo) throw new Error('storage not initialized; call initStorage() first');
    return _presetRepo;
}

export function getWorldInfoRepo() {
    if (!_worldInfoRepo) throw new Error('storage not initialized; call initStorage() first');
    return _worldInfoRepo;
}

export function getNamedDocRepo() {
    if (!_namedDocRepo) throw new Error('storage not initialized; call initStorage() first');
    return _namedDocRepo;
}

export function getGroupRepo() {
    if (!_groupRepo) throw new Error('storage not initialized; call initStorage() first');
    return _groupRepo;
}

export function getStatsRepo() {
    if (!_statsRepo) throw new Error('storage not initialized; call initStorage() first');
    return _statsRepo;
}

export function getStorageEngine() {
    if (!_engine) throw new Error('storage not initialized; call initStorage() first');
    return _engine;
}

export function getPackageRepo() {
    if (!_packageRepo) throw new Error('storage not initialized; call initStorage() first');
    return _packageRepo;
}

export function getWorldRepo() {
    if (!_worldRepo) throw new Error('storage not initialized; call initStorage() first');
    return _worldRepo;
}

export function getKnowledgeRepo() {
    if (!_knowledgeRepo) throw new Error('storage not initialized; call initStorage() first');
    return _knowledgeRepo;
}

export function getSessionRepo() {
    if (!_sessionRepo) throw new Error('storage not initialized; call initStorage() first');
    return _sessionRepo;
}

export function getSavePointRepo() {
    if (!_savePointRepo) throw new Error('storage not initialized; call initStorage() first');
    return _savePointRepo;
}

export function getAssetStore() {
    if (!_assetStore) throw new Error('storage not initialized; call initStorage() first');
    return _assetStore;
}
