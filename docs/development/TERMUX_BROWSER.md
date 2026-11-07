# Atria on Termux

The v0.5 toolbox manages one Atria installation on Android. The menu and
`atria-termux` CLI use the same readable script, process state and log. The backend
listens on `127.0.0.1`; open it in your Android browser. CSRF stays enabled.

## Install or upgrade

In Termux, open the toolbox:

```bash
pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/ZZZdragondYNGPHX/Atria/main/scripts/termux/atria_toolbox.sh | bash
```

Choose **1 — Open Atria**. It installs Atria if needed, completes unfinished
preparation, starts the server and opens the page. Choosing it again opens the
running instance. Choose **6 — Update Atria** to update the application and
toolbox together, or **9 — Repair** to reinstall runtime dependencies.
Existing `config.yaml`, including `dataRoot`, is retained.
The old `bash ~/atria_toolbox.sh` shortcut continues to open the new menu.
Secondary instances, tag/commit switching and shell-autostart configuration are
no longer managed; existing secondary directories are not deleted.

Installation clones only the latest `main` revision without tags or full history.
Updates fetch `main` and require a fast-forwardable main branch. Git retains
non-conflicting local files and rejects changes that would overwrite local work;
the toolbox never resets or stashes it. Production dependencies follow the lock file. Node must
meet `package.json`'s minimum (currently `>=22.2.0`) and the native dependencies'
compatibility requirements. With `isolated-vm 6.2.0`, the toolbox supports Node
22/24; Node 26 fails to compile this module because of V8 API changes.

The toolbox retains a compatible installed Node. Runtime preparation installs
Termux's `nodejs-lts` and `npm` when Node is absent or incompatible,
after stopping Atria and before installing dependencies. This replaces a
conflicting Termux `nodejs` package and changes the Node version used by other
Termux programs as well. The new runtime is checked again before proceeding;
native dependencies and caches are prepared for that runtime. A prepared startup
reuses the environment without network access. If the runtime changed or setup
was interrupted, opening Atria prepares it automatically. Diagnostics do not
change packages.

If an earlier setup failed under Node 26, update the checkout and prepare it again:

```bash
cd ~/Atria
git pull --ff-only
bash scripts/termux/setup.sh
```

For v0.4 menus, **6 → 2** updates to the new version. In v0.5, update is directly
on **6**. Updates run preparation from the updated checkout and reload the menu.

Setup verifies SQLite and the native computation module (`isolated-vm`), builds
missing bindings with Termux's local Node headers, and prepares the frontend cache.
Native compilation can take time and needs free RAM/storage. It is not repeated
on ordinary startup. Dependency preparation is reused when the lock file and Node
runtime are unchanged; **repair** explicitly reinstalls dependencies. Preparation
shows short progress messages and saves compiler/package output in
`~/.atria_toolbox/prepare.log`. Failures show the recent error and the log path.

For an interrupted setup or an existing source checkout:

```bash
cd ~/Atria
bash scripts/termux/setup.sh
```

## Daily use

```bash
atria-termux                 # menu
atria-termux start           # install/prepare if needed, start and open the page
atria-termux start --normal  # background without wake lock
atria-termux stop            # graceful shutdown
atria-termux restart         # preserve wake-lock mode
atria-termux status
atria-termux logs
atria-termux logs -f
atria-termux logs --setup    # installation and repair details
atria-termux debug           # attached logs; Ctrl+C stops the server
atria-termux doctor
atria-termux update
atria-termux repair
```

Updates, repairs, backups, successful restores and port changes restart a previously
running server with its previous wake-lock mode. A stopped instance stays stopped
until opened. If wake-lock tools are unavailable, startup continues in ordinary
background mode. Shutdown failure cancels subsequent writes. `stop --force` is an explicit
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
packages. Opening Atria repairs missing bindings; **repair** reinstalls dependencies
when a complete rebuild is needed.

Change the port in **8 — More → 2 — Port**, or with one command. The toolbox
validates the input before stopping anything and restarts a running instance:

```bash
atria-termux port 8001
```

`ATRIA_TERMUX_PORT` overrides the configured port for a command.
`ATRIA_TERMUX_OPEN_BROWSER=0` suppresses automatic browser opening.

## Data and backups

- New installations: `${XDG_DATA_HOME:-$HOME/.local/share}/atria/data`, outside
  the checkout and in Termux-private storage by default.
- Existing installations: the configured data path is retained, including shared
  storage. The toolbox does not move it automatically.
- Backups: `~/.atria_toolbox/backups`, with no shared-storage permission required.
  These survive Atria uninstall, but are inside Termux's app storage. To keep a
  copy outside Termux, export it or explicitly use an authorized shared directory
  via `ATRIA_TERMUX_BACKUP_DIR`.

```bash
atria-termux backup
atria-termux restore         # choose a backup from the list
```

**7 — Create backup** saves a backup directly. **8 — More → 1 — Restore** lists
current backups and any old files in `~/storage/shared/Atria/backups`; existing
archives are not moved. You can also pass an archive path to `restore`.

Backups stop the server before archiving local data, configuration, plugins,
third-party extensions, and any root secrets/environment files. Treat the archive
as private. Only `fs` and `sqlite` storage are supported; external databases require
their own backup tools.

Restore asks once before replacing data and rejects traversal paths, links,
special files and duplicate archive paths. It first saves a snapshot of current
data, stages the archive, then replaces targets.
Failed publication rolls back replaced targets. Current data/plugin paths and port
are retained; a successful restore resumes a previously running instance. A failed
restore stays stopped for inspection. Staging requires additional
private storage and space beside destination directories. Old archives with a
standard `data/` root are accepted; older custom-root layouts need manual import.

`atria-termux uninstall` backs up configuration/plugins and preserves external
data. An installation with data inside its checkout must first move that data
through Atria's data-management workflow. `uninstall --purge` additionally deletes
only recognized standard data directories after confirmation. Backups and
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
