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

`setup.sh` installs the missing Node.js/npm pieces plus native-addon build tools, runs `npm ci --omit=dev`, initializes config, repairs/verifies the Android `better-sqlite3` native binding when necessary, and installs the `luker-termux` command into `$PREFIX/bin`. If Termux already has a suitable Node.js (>=20), the installer keeps it instead of forcing a conflicting Node package switch.

Luker currently requires Node.js 20 or newer. `better-sqlite3@12.10.0` itself supports Node 20/22/23/24/25/26, so Termux Node 25 is acceptable for this branch. The Android-specific failure is instead in the native gyp path: generic node-gyp headers can reference `android_ndk_path`, while Termux uses its own bionic/clang toolchain. The repair script applies the minimal compatibility variables/clang warning flag only to the installed `node_modules/better-sqlite3` copy and then explicitly builds it against Termux's local Node headers. `package.json` and `package-lock.json` remain unchanged.

The repair is intentionally regenerated after every `npm ci`; it does not rely on a third-party prebuilt native binary.

## Recovering an interrupted first setup

If setup stopped at `better-sqlite3` before `luker-termux` was installed, update the feature branch and simply run setup again:

```bash
cd ~/Luker
git pull --ff-only
bash scripts/termux/setup.sh
```

`luker-termux: command not found` is expected after an interrupted setup because the wrapper is only written after dependency verification succeeds.

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

`luker-termux update` only performs a fast-forward update of the branch that is currently checked out. It refuses to update a dirty worktree, refreshes production dependencies, reapplies the Termux native SQLite repair, and restarts Luker only if it had been running.

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

For native SQLite-only troubleshooting, run:

```bash
bash scripts/termux/fix-better-sqlite3.sh
```

That command prints the real node-gyp/clang build output instead of reporting a misleading successful `npm rebuild` with no `.node` binding.

## Security boundary

This mode intentionally keeps Luker on `127.0.0.1` and keeps CSRF enabled. The phone browser can access the loopback server, but devices on the LAN cannot. LAN exposure should be designed separately with authentication and explicit network policy rather than piggybacking on this mobile path.

## Persistence

This mode uses Luker's normal standalone paths (`config.yaml`, `data/`, plugins/extensions paths) inside the repository checkout. Those user/runtime paths are already ignored by Git in this fork, so normal `git pull --ff-only` updates do not intentionally replace them.

## Validation boundary

Shell syntax and repository-side command/state logic can be checked off-device. The first real Android/ARM64 test exposed the native `better-sqlite3` binding failure described above; the feature now contains an explicit source-build repair for that path. A successful build on at least one real device is still required before claiming Android native-addon acceptance. Long-session OEM background survival also remains device-specific.
