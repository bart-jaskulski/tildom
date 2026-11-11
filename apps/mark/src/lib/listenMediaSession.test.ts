import { afterEach, expect, it, vi } from "vitest";
import { listenMediaSession } from "./listenMediaSession";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("exposes playback, skip, and scrub controls with clamped position and clears them on close", () => {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = { metadata: null as unknown, playbackState: "none", setPositionState: vi.fn(),
    setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => handlers.set(action, handler) };
  vi.stubGlobal("navigator", { mediaSession: session });
  vi.stubGlobal("MediaMetadata", class { constructor(public value: MediaMetadataInit) {} });
  const play = vi.fn(), pause = vi.fn(), seek = vi.fn();
  let position = 20;
  const media = listenMediaSession({ title: () => "An article", play, pause, seek, position: () => position });
  media.activate();
  media.update(true, 60);
  expect(session.metadata).toMatchObject({ value: { title: "An article" } });
  expect(session.playbackState).toBe("playing");
  handlers.get("pause")!({ action: "pause" });
  handlers.get("play")!({ action: "play" });
  handlers.get("seekbackward")!({ action: "seekbackward" });
  expect(seek).toHaveBeenLastCalledWith(10);
  handlers.get("seekforward")!({ action: "seekforward", seekOffset: 15 });
  expect(seek).toHaveBeenLastCalledWith(35);
  handlers.get("seekto")!({ action: "seekto", seekTime: 45 });
  expect(seek).toHaveBeenLastCalledWith(45);
  expect(play).toHaveBeenCalledOnce();
  expect(pause).toHaveBeenCalledOnce();
  position = 70;
  media.update(false, 60);
  expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 60, playbackRate: 1, position: 60 });
  expect(session.playbackState).toBe("paused");
  media.dispose();
  expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
  expect(session.metadata).toBeNull();
  expect(session.playbackState).toBe("none");
});

it("keeps playback usable without Media Session or with unsupported seek actions", () => {
  vi.stubGlobal("navigator", {});
  const controls = { title: () => "Article", play: vi.fn(), pause: vi.fn(), seek: vi.fn(), position: () => 0 };
  const missing = listenMediaSession(controls);
  expect(() => { missing.activate(); missing.update(true, 0); missing.dispose(); }).not.toThrow();
  vi.stubGlobal("navigator", { mediaSession: { setActionHandler: () => { throw new DOMException("Unsupported", "NotSupportedError"); } } });
  const partial = listenMediaSession(controls);
  expect(() => { partial.activate(); partial.update(false, 0); partial.dispose(); }).not.toThrow();
});
