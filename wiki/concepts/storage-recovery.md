# Concept: storage recovery

Kameraderi is local-first, so the browser's storage quota is also the user's photo archive. The
app stores only downscaled JPEGs and small thumbnails, but IndexedDB can still become pressured or
be evicted (especially on iOS). This feature makes the state visible and provides a narrow,
recoverable clean-up action.

## What the Settings panel shows

When the browser supports `navigator.storage.estimate()`, Settings shows the origin's estimated
used storage and quota. These numbers cover the whole Kameraderi origin, not only photo blobs, so
they are an estimate rather than an exact per-photo accounting. Unsupported browsers simply show
that storage details are unavailable.

## Free up space

The user chooses a fixed age threshold and confirms before any deletion. Kameraderi deletes only
photo Blob rows older than that threshold. It deliberately retains the submission, task,
evaluation, EXIF snapshot, and thumbnail, so History remains a useful learning record. Opening an
old full-resolution copy is not supported because originals were never stored; the source photo
remains in the user's camera roll.

No automatic deletion runs. A queued offline evaluation references a photo Blob and is therefore
protected from cleanup until it is evaluated or otherwise removed.

## What this does not solve

This is recovery, not backup. Browser quota estimates and persistence requests cannot guarantee
that iOS will retain data. A versioned export/import backup is the next resilience item and must
remain explicit about whether credentials are excluded.
