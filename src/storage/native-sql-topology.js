// Deployment boundary, not automatic proxy discovery. The operator must
// verify a direct, fixed-session endpoint to one writable primary, without
// routing/failover during this Host lifetime. Unknown is never inferred safe
// from a URL, local address, a successful ping or one advisory-lock result.
export const DIRECT_NATIVE_SQL_TOPOLOGY = 'direct_single_primary';
const unsupported = () => Object.assign(new Error('Native SQL Host requires a verified direct single-primary deployment'), { code: 'native_orchestration_sql_topology_unsupported' });

export function assertNativeSqlTopology(value) {
    if (value !== DIRECT_NATIVE_SQL_TOPOLOGY) throw unsupported();
}

export async function inspectMysqlNativeTopology(connection) {
    const [rows] = await connection.query('SHOW GLOBAL VARIABLES WHERE Variable_name IN (\'read_only\',\'super_read_only\',\'ndbcluster\',\'have_ndbcluster\',\'group_replication_single_primary_mode\',\'group_replication_group_name\',\'version_comment\')');
    const values = new Map(rows.map(row => [row.Variable_name?.toLowerCase(), row.Value]));
    const off = value => value === 'OFF' || value === '0';
    if (!off(values.get('read_only')) || !off(values.get('super_read_only'))
        || values.has('ndbcluster') && !off(values.get('ndbcluster'))
        || values.has('have_ndbcluster') && !['NO', 'DISABLED'].includes(values.get('have_ndbcluster'))
        || values.has('group_replication_single_primary_mode') && values.get('group_replication_single_primary_mode') !== 'ON'
        || values.get('group_replication_group_name')
        || /\bNDB\b|MySQL Cluster/i.test(values.get('version_comment') ?? '')) throw unsupported();
    return readMysqlNativeSession(connection);
}

export async function readMysqlNativeSession(connection) {
    const [rows] = await connection.query('SELECT DATABASE() AS databaseName, @@server_uuid AS serverId, CONNECTION_ID() AS sessionId');
    const row = rows[0];
    if (!row || typeof row.databaseName !== 'string' || !row.databaseName || typeof row.serverId !== 'string' || !row.serverId
        || !Number.isSafeInteger(Number(row.sessionId)) || Number(row.sessionId) < 1) throw unsupported();
    return { databaseName: row.databaseName, serverId: row.serverId, sessionId: Number(row.sessionId) };
}

export async function inspectPgNativeTopology(client) {
    const { rows } = await client.query('SELECT current_database() AS database_name, pg_backend_pid() AS session_id, pg_is_in_recovery() AS in_recovery, current_setting(\'transaction_read_only\') AS read_only');
    const row = rows[0];
    if (!row || typeof row.database_name !== 'string' || !row.database_name || !Number.isSafeInteger(row.session_id) || row.session_id < 1
        || row.in_recovery !== false || row.read_only !== 'off') throw unsupported();
    return { databaseName: row.database_name, sessionId: row.session_id };
}

export function assertNativeSqlSession(expected, actual) {
    if (Object.keys(expected).some(field => expected[field] !== actual[field])) throw unsupported();
}
