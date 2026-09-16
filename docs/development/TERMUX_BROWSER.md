# Termux backend + browser run mode

This is the preferred Android development/use path when the bundled WebView APK is not required.
Termux owns the Node.js backend; Chrome/Edge talks to Luker over Android loopback.

```text
Termux / Node.js
      |
      | http://127.0.0.1:8000
      v
Chrome / Edge
```

The server remains loopback-only by default. Do not pass `--listen` unless LAN access is an intentional separate feature.
CSRF protection remains enabled.

## One-time install

Install Termux from a maintained source, then in Termux:

```bash
pkg update -y
pkg install -y git

git clone -b feat/termux-browser --single-branch \
  https://github.com/ZZZdragondYNGPHX/Luker.git
cd Luker
bash scripts/termux/setup.sh
```

`setup.sh` installs the missing Node.js/npm pieces plus native-addon build tools, runs `npm ci --omit=dev`, initializes config, verifies `better-sqlite3`, and installs the `luker-termux` command into `$PREFIX/bin`. If Termux already has a suitable Node.js (>=20), the installer keeps it instead of forcing a conflicting Node package switch.

Luker currently requires Node.js 20 or newer. The installer points node-gyp at Termux's local patched Node headers so Android native addons are built against the Termux runtime rather than desktop Node headers.

## Everyday use

Start the backend and open the browser:

```bash
luker-termux start
```

Default address:

```text
http://127.0.0.1:8000
```

Other useful commands:

```bash
luker-termux status
luker-termux logs
luker-termux logs -f
luker-termux doctor
luker-termux restart
luker-termux stop
luker-termux update
```

`luker-termux update` only performs a fast-forward update of the branch that is currently checked out. It refuses to update a dirty worktree, refreshes production dependencies, and restarts Luker only if it had been running.

## Port override

If port 8000 is already used:

```bash
export LUKER_TERMUX_PORT=8001
luker-termux start
```

Then use `http://127.0.0.1:8001`.

## Background survival

The runner uses `nohup`, so switching from Termux to the browser does not intentionally stop the Node process. Android/OEM battery management can still kill Termux in the background.

Optional wake lock:

```bash
export LUKER_TERMUX_WAKE_LOCK=1
luker-termux restart
```

This is intentionally opt-in because it can increase battery use. If Android still kills Termux, exempt Termux from battery optimization for long sessions.

## Browser shortcut

After Luker opens successfully in Chrome/Edge, use the browser's **Add to Home screen / Install app** action if desired. This gives a near-app launch surface without coupling the Node backend to Android WebView lifecycle.

## Diagnostics

If startup fails, the runner prints the last server log lines instead of leaving a blank WebView. The full log is stored at:

```text
~/.local/state/luker-termux/server.log
```

Run:

```bash
luker-termux doctor
luker-termux logs
```

The doctor checks Termux detection, Node >= 20, npm/git/curl, installed dependencies, and an in-memory `better-sqlite3` query.

## Security boundary

This mode intentionally keeps Luker on `127.0.0.1` and keeps CSRF enabled. The phone browser can access the loopback server, but devices on the LAN cannot. LAN exposure should be designed separately with authentication and explicit network policy rather than piggybacking on this mobile path.

## Persistence

This mode uses Luker's normal standalone paths (`config.yaml`, `data/`, plugins/extensions paths) inside the repository checkout. Those user/runtime paths are already ignored by Git in this fork, so normal `git pull --ff-only` updates do not intentionally replace them.

## Validation boundary

The scripts can be syntax-checked and their command/state logic can be tested off-device. The remaining environment-specific coverage gap is the first real Termux `npm ci`/native-addon compile on Android/ARM64 and long-session OEM background survival. Those are not prerequisites for committing this isolated feature, but failures should be diagnosed from `luker-termux doctor` and `luker-termux logs` rather than by changing the WebView APK.
