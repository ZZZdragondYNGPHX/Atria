# Atria on Termux

The v0.4 toolbox manages one Atria installation on Android. The menu and
`atria-termux` CLI use the same readable script, process state and log. The backend
listens on `127.0.0.1`; open it in your Android browser. CSRF stays enabled.

## Install or upgrade

In Termux, open the toolbox:

```bash
pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh | bash
```

Choose **6 → 1** for a new installation, or **6 → 2** to update an existing
`~/Atria` installation. Existing `config.yaml`, including `dataRoot`, is retained.
The old `bash ~/atria_toolbox.sh` shortcut continues to open the new menu.
Secondary instances, tag/commit switching and shell-autostart configuration are
no longer managed; existing secondary directories are not deleted.

Installation clones only the latest `main` revision without tags or full history.
Updates fetch `main` and require a clean, fast-forwardable main branch; local
changes are never reset. Production dependencies follow the lock file. Node
requirements come from the current `package.json` (currently `>=22.2.0`). A suitable
installed Node is retained; Node LTS is installed when Node is absent.

Setup verifies SQLite and the native computation module (`isolated-vm`), builds
missing bindings with Termux's local Node headers, and prepares the frontend cache.
Native compilation can take time and needs free RAM/storage. It is not repeated
on ordinary startup. Dependency preparation is reused when the lock file and Node
runtime are unchanged; **repair** explicitly reinstalls dependencies.

For an interrupted setup or an existing source checkout:

```bash
cd ~/Atria
bash scripts/termux/setup.sh
```

## Daily use

```bash
atria-termux                 # menu
atria-termux start           # background + wake lock + browser
atria-termux start --normal  # background without wake lock
atria-termux stop            # graceful shutdown
atria-termux restart         # preserve wake-lock mode
atria-termux status
atria-termux logs
atria-termux logs -f
atria-termux debug           # attached logs; Ctrl+C stops the server
atria-termux doctor
atria-termux update
atria-termux repair
```

Updates and backups restart a previously running server with its previous wake-lock
mode. Shutdown failure cancels subsequent writes. `stop --force` is an explicit
last resort. Commands that change the installation or its data are serialized.
The manager checks process ownership before sending signals, including when
adopting an older main-instance process. Android may still terminate Termux despite
a wake lock; battery restrictions remain under Android's control.

Startup reuses frontend and Node compilation caches. It checks storage and the
page bootstrap API after HTTP responds, so an HTML response alone is not reported
as successful initialization. Login-protected installations are reported as
requiring login; the toolbox does not bypass authentication.

Logs are in `~/.atria_toolbox/atria.log` and are replaced on each start. `doctor`
checks native modules and reports available startup timings. It does not install
packages. Missing bindings should be repaired with `atria-termux repair`.

Stop first to change the persisted port:

```bash
atria-termux stop
atria-termux port 8001
atria-termux start
```

`ATRIA_TERMUX_PORT` overrides the configured port for a command.
`ATRIA_TERMUX_OPEN_BROWSER=0` suppresses automatic browser opening.

## Data and backups

- New installations: `${XDG_DATA_HOME:-$HOME/.local/share}/atria/data`, outside
  the checkout and in Termux-private storage by default.
- Existing installations: the configured data path is retained, including shared
  storage. The toolbox does not move it automatically.
- Backups: `~/storage/shared/Atria/backups`. Run `termux-setup-storage` once to
  authorize shared storage, or set `ATRIA_TERMUX_BACKUP_DIR` to another directory.

```bash
termux-setup-storage
atria-termux backup
atria-termux restore "$HOME/storage/shared/Atria/backups/atria_backup_DATE_PID.tar.gz"
```

Backups stop the server before archiving local data, configuration, plugins,
third-party extensions, and any root secrets/environment files. Treat the archive
as private. Only `fs` and `sqlite` storage are supported; external databases require
their own backup tools.

Restore rejects traversal paths, links, special files and duplicate archive paths.
It first saves a snapshot of current data, stages the archive, then replaces targets.
Failed publication rolls back replaced targets. Current data/plugin paths and port
are retained; the service stays stopped after restore. Staging requires additional
private storage and space beside destination directories. Old archives with a
standard `data/` root are accepted; older custom-root layouts need manual import.

`atria-termux uninstall` backs up configuration/plugins and preserves external
data. An installation with data inside its checkout must first move that data
through Atria's data-management workflow. `uninstall --purge` additionally deletes
only recognized standard data directories after typed confirmation. Backups and
the toolbox remain. After reinstalling, restore the archive to recover the previous
configuration/plugins and data; a fresh install does not guess an old custom path.

## Implementation

`scripts/termux/atria_toolbox.sh` is the single menu/CLI implementation. `atria.sh`
and `setup.sh` are thin checkout entrypoints. `runtime-tools.js` handles YAML and
application checks; `fix-native.sh` handles native bindings; `data-archive.py`
handles offline archives. No generated compressed runtime or base64 distribution
is needed. `ATRIA_TERMUX_ROOT`, `ATRIA_TERMUX_STATE_DIR` and
`ATRIA_TERMUX_WEBPACK_CACHE_ROOT` override the checkout, manager state and frontend
cache locations when explicitly configured.
