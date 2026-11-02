# Source and runtime packages

Studio provides two separate exports:

- `.atria`: the existing v2 runtime container, protected by default and playable
  without a password. Contains compiled frontend output, required authority/game
  modules, dependency snapshots and runtime assets. Does not contain the editable
  project manifest or unrelated author files. Import into the game library, not
  Studio.
- `.atriasource`: editable project files and a project-owned snapshot of the exact
  dependency closure. Import in Studio to create a separate project ID while
  retaining the package identity for future releases. Does not include Git
  history, player saves or account settings. Source export is independent of
  runtime compilation, so unfinished frontend source can still be backed up.

Source export optionally encrypts the ZIP payload using AES-256-GCM. The v1 source
header uses an independent password-derived key: asynchronous scrypt with
`N=32768`, `r=8`, `p=3`, a random 16-byte salt and a random 12-byte nonce. The header
is authenticated as AAD. No password or player-accessible source key is saved.
Wrong passwords and damaged ciphertext fail before project creation. A forgotten
password cannot be recovered; authors must retain their working project and/or
another accessible backup. Unencrypted source packages provide no confidentiality.

Source archives use Studio's existing buffered budgets: 512 MiB archive, 1 GiB
expanded content and 32 MiB per file. Large runtime media's streaming capacity
does not imply an unlimited source editor or source export.

Runtime package and storage protection deters direct file editing, not a local
owner who modifies the player or extracts decrypted runtime data. No author
signature or DRM is claimed. AES-GCM detects corrupted ciphertext; the portable
runtime key does not establish publisher identity. Runtime data can be recovered
by a determined user; separate password-protected author source is not unlocked
by playback. Encryption is content-lossless, not zero-cost. See
[media capacity](native-media-capacity.md) for encrypted backing and range reads.
