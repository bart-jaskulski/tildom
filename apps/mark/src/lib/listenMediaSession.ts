export function listenMediaSession(controls: { title: () => string; play: () => void; pause: () => void; seek: (seconds: number) => void; position: () => number }) {
  const session = navigator.mediaSession;
  let active = false;
  const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
    play: controls.play,
    pause: controls.pause,
    stop: controls.pause,
    seekbackward: ({ seekOffset }) => controls.seek(controls.position() - (seekOffset ?? 10)),
    seekforward: ({ seekOffset }) => controls.seek(controls.position() + (seekOffset ?? 10)),
    seekto: ({ seekTime }) => { if (seekTime !== undefined) controls.seek(seekTime); },
  };
  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    // Browsers can implement Media Session while rejecting individual actions.
    try { session.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
  };
  return {
    activate() {
      if (!session || active) return;
      active = true;
      if (typeof MediaMetadata !== "undefined") session.metadata = new MediaMetadata({ title: controls.title(), album: "Mark" });
      for (const [action, handler] of Object.entries(handlers)) setHandler(action as MediaSessionAction, handler);
    },
    update(playing: boolean, duration: number) {
      if (!session || !active) return;
      session.playbackState = playing ? "playing" : "paused";
      if (session.setPositionState) {
        if (duration > 0) session.setPositionState({ duration, playbackRate: 1, position: Math.max(0, Math.min(duration, controls.position())) });
        else session.setPositionState();
      }
    },
    dispose() {
      if (!session || !active) return;
      for (const action of Object.keys(handlers)) setHandler(action as MediaSessionAction, null);
      session.playbackState = "none";
      session.metadata = null;
      session.setPositionState?.();
      active = false;
    },
  };
}
