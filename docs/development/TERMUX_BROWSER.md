# Termux backend + browser run mode

This is the preferred Android development/use path when the bundled WebView APK is not required.
Termux owns the Node.js backend; Chrome/Edge talks to Atria over Android loopback.

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

git clone -b custom-release --single-branch \
  https://github.com/ZZZdragondYNGPHX/Atria.git
cd Atria
bash scripts/termux/setup.sh
```

 If Termux already has a suitable Node.js (>=20), the installer keeps it instead of forcing a conflicting Node package switch.

Atria currently requires Node.js 20 or newer. `better-sqlite3@12.10.0` itself supports Node 20/22/23/24/25/26, so Termux Node 25 is acceptable for this Android/Termux mode. The Android-specific failure is instead in the native gyp path: generic node-gyp headers can reference `android_ndk_path`, while Termux uses its own bionic/clang toolchain. The repair script applies the minimal compatibility variables/clang warning flag only to the installed `node_modules/better-sqlite3` copy and then explicitly builds it against Termux's local Node headers. `package.json` and `package-lock.json` remain unchanged.

The repair is intentionally regenerated after every `npm ci`; it does not rely on a third-party prebuilt native binary.

## Recovering an interrupted first setup

If setup stopped at `better-sqlite3` before `atria-termux` was installed, update `custom-release` and simply run setup again:

```bash
cd ~/Atria
git pull --ff-only
bash scripts/termux/setup.sh
```

## Everyday use

Start the backend and open the browser:

```bash
atria-termux start
```

Default address:

```text
http://127.0.0.1:8000
```

Other useful commands:

```bash
atria-termux status
atria-termux logs
atria-termux logs -f
atria-termux doctor
atria-termux restart
atria-termux stop
atria-termux update
```

 It refuses to update a dirty worktree, refreshes production dependencies, reapplies the Termux native SQLite repair, and restarts Atria only if it had been running.

## Port override

If port 8000 is already used:

```bash
export ATRIA_TERMUX_PORT=8001
atria-termux start
```

Then use `http://127.0.0.1:8001`.

## Background survival

The runner uses `nohup`, so switching from Termux to the browser does not intentionally stop the Node process. Android/OEM battery management can still kill Termux in the background.

Optional wake lock:

```bash
export ATRIA_TERMUX_WAKE_LOCK=1
atria-termux restart
```

This is intentionally opt-in because it can increase battery use. If Android still kills Termux, exempt Termux from battery optimization for long sessions.

## Browser shortcut

After Atria opens successfully in Chrome/Edge, use the browser's **Add to Home screen / Install app** action if desired. This gives a near-app launch surface without coupling the Node backend to Android WebView lifecycle.

## Diagnostics

If startup fails, the runner prints the last server log lines instead of leaving a blank WebView. The full log is stored at:

```text
~/.local/state/atria-termux/server.log
```

Run:

```bash
atria-termux doctor
atria-termux logs
```

For native SQLite-only troubleshooting, run:

```bash
bash scripts/termux/fix-better-sqlite3.sh
```

That command prints the real node-gyp/clang build output instead of reporting a misleading successful `npm rebuild` with no `.node` binding.

## Persistence

This mode uses Atria's normal standalone paths (`config.yaml`, `data/`, plugins/extensions paths) inside the repository checkout. Those user/runtime paths are already ignored by Git in this fork, so normal `git pull --ff-only` updates do not intentionally replace them.
