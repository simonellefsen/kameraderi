# Concept: portable backup and restore

Kameraderi has no account or server, so a portable local file is the only way to move a coaching
library between browsers or recover it after browser storage is evicted. The backup is a versioned
JSON file that includes the library's records and the downscaled photo Blobs encoded as base64.
It uses no network or third-party service.

## Contents and privacy boundary

A backup contains camera bodies, lenses, gear profiles, tasks, submissions, evaluations, coaching
sessions, pending offline evaluations, thumbnails, and stored photo copies. It also preserves the
non-secret Settings choices such as locale, provider/model selection, skill level, and active rig.

**API keys are never exported.** On restore, any API keys already stored on the receiving device
are retained. The user must add a key separately on a new device. AI caches and token-meter events
are intentionally excluded: they are expendable, can contain stale provider output, and should not
inflate a recovery file.

## Restore semantics

Importing a backup replaces the local coaching library after a clear confirmation. The operation is
atomic across the included IndexedDB tables: a malformed or unsupported file is rejected before
any data is changed. After restore, the curated catalog migration runs again so a backup from an
older app version gains new catalog entries without overwriting user-owned gear.

The active in-progress session is not restored from localStorage. The user begins a fresh session
after restore; completed history is retained in IndexedDB.

## Limits

Base64 makes each stored image roughly one third larger in the file and creates a temporary memory
spike while exporting/importing. This first, dependency-free JSON format is suitable for a normal
mobile library; very large libraries should use the Storage recovery control first. A future ZIP
format can reduce file size without changing the archive's logical schema.
