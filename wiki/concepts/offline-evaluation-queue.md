# Concept: offline evaluation queue

An evaluation is valuable enough to survive a temporary loss of connectivity, but Kameraderi has no
server or reliable background runtime to finish it elsewhere. The browser therefore keeps a pending
evaluation entirely on-device and resumes it only while the app is open.

## Lifecycle

1. The user submits a photo. EXIF is read from the original, then the normal downscaled JPEG and
   thumbnail are created and saved in IndexedDB.
2. If the browser is offline (or it goes offline before an evaluation can complete), Kameraderi
   persists the task, submission, an unfinished coaching session, and a `pendingEvaluations` row in
   one IndexedDB transaction. The row records the chosen provider and vision model, so changing the
   active provider later does not silently change the queued request.
3. On a later app launch and on the browser's `online` event, the queue retries entries oldest-first.
   It rebuilds the provider image payload from the already-stored downscaled JPEG; originals never
   leave the device.
4. A successful evaluation is stored normally, linked to its unfinished coaching session, and the
   queue row is deleted. A failed online attempt remains queued with a local diagnostic and retry
   count; it never blocks other pending entries.

## Boundaries

- This is **not background sync**. Mobile browsers, especially iOS, may suspend the app, so an
  evaluation runs only while Kameraderi is open and the browser reports connectivity.
- Queueing is for offline interruptions, not invalid API keys, unsupported vision providers, or
  malformed model output. Those remain immediate, actionable errors.
- The queue reuses the regular photo Blob store. It stores no duplicate image data and never stores
  the original file.
- Provider keys remain in the regular IndexedDB Settings record. The queue contains only a provider
  key and model id, never credentials.
