# Configuration

Atria's configuration file is `config.yaml` in the project root directory. On first launch, if the file doesn't exist, Atria will copy a default configuration from `default/config.yaml`.

## Core Settings

### Data Directory

```yaml
dataRoot: ./data
```

The root directory for all user data (character cards, chat logs, presets, world info, etc.). In multi-user mode, each user's data is stored in a `<dataRoot>/<username>/` subdirectory.

### Port Settings

```yaml
port: 8000
```

The port the server listens on. To allow LAN access, also set `listen` to `true`:

```yaml
listen: true
listenAddress:
  ipv4: 0.0.0.0
  ipv6: "[::]"
protocol:
  ipv4: true
  ipv6: false
```

### SSL/TLS

```yaml
ssl:
  enabled: false
  certPath: "./certs/cert.pem"
  keyPath: "./certs/privkey.pem"
  keyPassphrase: ""
```

To enable HTTPS, set `enabled` to `true` and provide the certificate and private key paths. If the private key is password-protected, fill in `keyPassphrase`.

### Proxy Settings

SillyTavern supports forwarding outbound requests (such as API calls) through HTTP, HTTPS, or SOCKS proxies, and Atria inherits this feature:

```yaml
requestProxy:
  enabled: false
  url: socks5://username:password@example.com:1080
  bypass:
    - localhost
    - 127.0.0.1
```

- `url`: Proxy server address, supporting `http://`, `https://`, `socks://`, `socks4://`, `socks4a://`, `socks5://`, `socks5h://`, and `pac+*://` protocols
- `bypass`: List of addresses that bypass the proxy

### CORS Proxy

```yaml
enableCorsProxy: false
```

When enabled, Atria provides a CORS proxy endpoint for frontend cross-origin request forwarding.

## Authentication and Multi-User

### Basic Authentication

```yaml
basicAuthMode: false
basicAuthUser:
  username: user
  password: password
```

When enabled, accessing Atria requires a username and password. Suitable for single-user scenarios.

### Multi-User Mode

```yaml
enableUserAccounts: true
enableDiscreetLogin: false
perUserBasicAuth: false
```

- `enableUserAccounts`: Enables the multi-user account system, giving each user an independent data directory
- `enableDiscreetLogin`: Enables discreet login mode
- `perUserBasicAuth`: Enables independent HTTP Basic authentication for each user

### Password Reset

If you forget a user's password, you can reset it via the command-line tool:

```bash
# Reset user password
node recover.js <username> <new-password>

# Example: reset default-user's password
node recover.js default-user myNewPassword

# Omit password to clear it
node recover.js default-user
```

::: tip
This command must be run from the Atria project root directory. The server does not need to be running.
:::

### SSO (Single Sign-On)

```yaml
sso:
  autheliaAuth: false
  authentikAuth: false
```

Atria supports single sign-on through reverse proxy authentication solutions like Authelia or Authentik. For detailed configuration, see [Authentication and Quotas](/improvements/auth-and-quota).

### Host Whitelist

```yaml
hostWhitelist:
  enabled: false
  scan: true
  hosts: []
```

Restricts which host addresses are allowed to access the server. When `scan` is enabled, it logs warnings about requests from untrusted hosts not in the whitelist, without blocking them (unless `enabled` is also set to `true`).

## Security Settings

### IP Whitelist

```yaml
whitelistMode: true
enableForwardedWhitelist: true
whitelist:
  - ::1
  - 127.0.0.1
whitelistDockerHosts: true
```

Whitelist mode is enabled by default, allowing only local access. To allow LAN access, add the corresponding IPs to the `whitelist` list, or disable `whitelistMode`.

::: warning Disabling the whitelist can cause the process to exit
If you set `whitelistMode: false`, Atria requires another protection layer. Otherwise it will detect an insecure setup at startup and terminate the process (in Docker, this manifests as the container restarting in a loop). To expose the server safely, do at least one of the following:

- Enable `basicAuthMode` and configure `basicAuthUser` — see [Authentication](/guide/authentication)
- Enable multi-user mode (`enableUserAccounts: true`) **and** set a password for every admin user via `node recover.js default-user <password>` — see [Authentication › Password Reset](/guide/authentication#password-reset).
- Set `securityOverride: true` (debugging only — **never** use this on a public network)
:::

### Session and CSRF

```yaml
sessionTimeout: -1
disableCsrfProtection: false
securityOverride: false
```

- `sessionTimeout`: Session timeout in seconds; `-1` means no timeout
- `disableCsrfProtection`: Disables CSRF protection (not recommended)
- `securityOverride`: Security override switch (for debugging only)

## Backup and Storage

- `throttleInterval`: Backup throttle interval in milliseconds to avoid excessive backups
- `maxTotalBackups`: Maximum number of chat backups; `-1` means unlimited

## Storage Backend

```yaml
storage:
  mode: fs
  mysql:
    url: mysql://user:pass@host:3306/atria
    poolSize: 10
  postgres:
    url: postgresql://user:pass@host:5432/atria
    poolSize: 10
```

Atria can persist user data through one of four backends. The `mode` key chooses which one; the matching sub-block is only consulted when its mode is selected.

- `fs` (default): one file per chat / preset / world / etc. under `<dataRoot>/<handle>/`. Recommended for single-user installs and the easiest backend to inspect by hand.
- `sqlite`: one self-contained `atria-storage.sqlite` file per user under `<dataRoot>/<handle>/`. Suits installs that want a single transactional file without operating a separate database service.
- `mysql`: one shared MySQL 8.0+ database; all users live in the same schema, keyed by a `handle` column. Suitable for multi-user deployments that already run MySQL.
- `postgres`: one shared PostgreSQL 14+ database; same shape as MySQL but using PostgreSQL.

Switching backends requires running the migration tool first; the admin panel exposes a Storage Backend tab that walks through `fs ↔ sqlite` migration with a permanent backup taken at `<dataRoot>/_storage-migrations/`. Switching to or from `mysql` / `postgres` is supported by setting `storage.mode` in `config.yaml` and restarting the server; the migration tool itself currently only routes between `fs` and `sqlite`, so moving an existing install to MySQL or PostgreSQL means either starting fresh or staging through SQLite.

A headless equivalent of the admin panel migration is available at `node scripts/storage-migrate.js --from fs --to sqlite` (and the reverse).

## Other Settings

```yaml
logging:
  enableAccessLog: true
  minLogLevel: 0

rateLimiting:
  preferRealIpHeader: false

thumbnails:
  enabled: true
  format: jpg
  quality: 95
```

- `logging`: Log configuration; `minLogLevel` controls the minimum log level
- `rateLimiting`: Rate limiting; `preferRealIpHeader` uses the real IP behind a reverse proxy
- `thumbnails`: Thumbnail generation configuration

## Plugin and Extension Paths

```yaml
serverPluginsPath: ./plugins
globalExtensionsPath: ./public/scripts/extensions/third-party
```

- `serverPluginsPath`: Server-side plugin directory
- `globalExtensionsPath`: Global frontend extension directory (where third-party extensions are installed)

## Native external services, speech and optional work

In **Runtime → Connections**, choose MCP or A2A and save the service endpoint. Remote services use HTTPS; literal loopback services can use HTTP. Public services can omit authentication. For authenticated services, select a stored Secret and choose authentication in the route.

In **Runtime → Routes**, configure the exact MCP tools/resources or A2A skills and enable a local work budget. In an active Native session, **Runtime → Diagnostics → External services** lets you select disclosed public content and run the configured service. Saved A2A task references can be queried again after a restart while their original source and configuration remain valid. Unknown sends are not automatically repeated.

For packages that declare an ExpressionPlan with disclosed Timeline messages, **Read aloud** appears on the assistant message. Choose a voice, generate the audio, then use the audio player's controls to play or stop it. Windows uses SAPI. Linux/Unix requires `espeak-ng` on the server's PATH; a custom installation can use `ATRIA_ESPEAK_EXECUTABLE` and `ATRIA_ESPEAK_DATA_PATH`. Missing providers retain the text view. Audio reports total duration, not phoneme timing.

The route's **Required work reserve** can retain request/token allowance before optional rerank, model tasks or Native background tasks run. Necessary narration keeps the ordinary admission path. Missing required-work bounds refuse the selected optional work; changing a policy preserves already incurred costs.

Authors can opt a `.a2ui.json` component into live public updates with `a2ui.stream: true`. The Host's `streamA2ui(instanceId, response.body, {signal, onAction})` consumes JSONL under the installed component/event policy; successful user actions still use the original Bridge. Invalid updates preserve the last valid view, and changed revisions or closed views stop further updates.
