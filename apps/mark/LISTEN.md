# Article listening prototype

Open a captured English article's reader and press the floating play button.
First use downloads Phonon 31M's q8 weights (about 65 MB), voice and runtime files.
Model files come from Hugging Face; article text stays on the device. The official
`phonon-tts` runtime prefers WebGPU and falls back to CPU. No hosted generation, word alignment, playback-speed setting, or OS background service is included.

PCM is raw audio. The worker writes it progressively to OPFS and supplies a small
playback buffer to Web Audio. Listening starts before the article is fully generated;
new audio is encoded into a single 96 kbps mono MP3 at the same time. A subtle ring
indicates generation, and sentence highlighting follows the playback clock. Pausing
stops listening while generation continues for as long as the reader stays open.

Each completed sentence is flushed to disk before its checkpoint is committed.
Leaving the reader stops generation. Reopening resumes from completed checkpoints;
a partially generated sentence may be repeated. Playback position is saved on pause,
when leaving, and every five seconds. After a crash, up to five seconds of listening
position may be lost. Model, voice, segmentation and source text are part of the cache
identity, so changed text gets a separate recording.

While incomplete, a recording has temporary PCM checkpoints plus a partial MP3.
If interrupted, the worker rebuilds the MP3 encoder from saved PCM and generates only
the remaining sentences. PCM uses about 5.8 MB per minute temporarily, but is written
to disk rather than retained in memory. After completion, leaving or reopening the
reader removes the temporary PCM; subsequent playback uses only MP3 and sentence
metadata. Incomplete checkpoints remain available for resuming. Browser eviction can
remove local data. Audio stays outside database snapshots and exports; completed recordings use the separate encrypted sync described below. Checkpoints remain local.

Earlier Kokoro and full-article Phonon caches are left intact; the new checkpoint
format has a separate identity and does not automatically migrate or delete them.

## Verification

Run `pnpm typecheck:mark`, `pnpm test:mark`, and `pnpm build:mark` from the root.
Browser checks should use the production build and actual WebGPU when available:

- Start a long article: playback and highlighting begin before all sentences finish.
- Pause: playback stops while checkpoint count continues increasing.
- Leave/reopen: playback position resumes and completed PCM/checkpoints are unchanged.
- Finish: the output is a mono 24 kHz, 96 kbps MP3; reload and play offline.
- Check keyboard focus, a 390px mobile viewport, reduced motion, and a real phone.

A desktop production test played while only 122 of 321 sentences were checkpointed.
After leaving at 309 completed sentences, reopening preserved every completed timing
and the saved audio prefix, resumed playback at sentence 18, and finished the remaining
12 sentences. These checks do not establish performance or background behavior on
Android/iOS, where browsers may suspend the page.

## Reader controls

Click a sentence (or focus its passage action and press Enter/Space) to start there.
Click the title to restart. Existing links and text selection keep their normal behavior.
Prepared passages seek immediately; an unprepared passage waits for its audio while
sequential generation continues. The active sentence scrolls into a comfortable reading
area only when needed. Highlight backgrounds sweep into the next sentence; reduced-motion preferences
disable both animated highlighting and smooth follow scrolling.

Reader scroll position is saved separately from playback position, even without listening,
and restored on reopening. Raw Markdown-style markers remain visible. Emphasis markers
share their sentence highlight rather than leaving unhighlighted gaps.

## Completed audio sync

When Mark sync is paired, completed recordings upload in the background after generation, on app startup, on reconnect, and on manual sync. Existing completed recordings are included; caches for deleted or changed articles are skipped. Each recording uses a separate encrypted vault through the existing snapshot service, derived from the Mark pairing secret and recording key. Audio stays out of bookmark database snapshots. Duplicate generation on another device keeps the first uploaded complete copy.

Pressing play checks for a completed remote recording before loading Phonon. The MP3 is downloaded in full, validated with its sentence timings, and saved to OPFS for offline playback. A failed download falls back to local generation; transfer failures appear in the existing sync status. Starting playback midway still generates the full article in order and waits for the selected sentence when necessary.

Only the completed MP3 and sentence end timings are transferred. Partial PCM, generation checkpoints, scroll, and listening position remain local. Disconnecting sync stops pending uploads; local listening continues. Automatic uploads resume while the app is open, rather than relying on service worker background transfers.

The server's existing upload size limit applies (25 MiB by default, roughly 36 minutes at 96 kbps). Larger recordings remain local and report a sync error. Audio uses separate per-recording vaults. Deleting an article removes its local MP3, partial PCM, sentence metadata, and local reading/listening positions. While paired, remote payload deletion is queued even on a device that never downloaded the audio. Offline deletions retry on reconnect; imported bookmark deletions also prune local recordings. A recording shared by another saved article is retained. Remote deletion requires the updated sync service with authenticated `DELETE /v1/apps/{appId}/vaults/{vaultId}/snapshots`; the service retains only the small vault ownership record.


## System media controls

Listening registers article metadata and play/pause, stop, backward/forward skip (10 seconds by default), and seek actions with the browser's Media Session API. Seeking is clamped to generated audio and keeps paused playback paused. Position follows the same clock used for highlighting. Leaving the reader clears the session and handlers.

Progressive PCM is routed through a native audio element using a Web Audio media-stream destination so it can participate in native media playback handling. Completed MP3s use the existing native audio element. Browsers without Media Session keep the floating player and direct Web Audio playback; individually unsupported actions are ignored. This does not prevent a mobile browser from suspending generation or the page in the background.

Desktop Chromium checks covered the real audio stream, metadata, play/pause, scrub/skip, and session cleanup. Android/iOS lock-screen widget appearance and screen-off behavior still require physical-device checks.
