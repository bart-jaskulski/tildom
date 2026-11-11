import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import ArticleListen from "./ArticleListen";

class SpeechWorker {
  static instance: SpeechWorker;
  static readyData: Record<string, unknown> | undefined;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: Array<{ type: string }> = [];
  constructor() { SpeechWorker.instance = this; }
  postMessage(message: { type: string }) {
    this.messages.push(message);
    if (message.type === "open") queueMicrotask(() => this.emit(SpeechWorker.readyData ?? { type: "ready", ends: [], position: 0, available: 0, complete: false }));
  }
  emit(data: unknown) { this.onmessage?.({ data }); }
  terminate() {}
}

class PlaybackContext {
  currentTime = 0;
  resume = async () => {};
  suspend = async () => {};
  close = async () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); SpeechWorker.readyData = undefined; });

it("pauses playback while sentence generation continues, without exposing technical controls", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("AudioContext", PlaybackContext);
  render(() => <ArticleListen sentences={["Title", "A sentence."]} onSentence={() => {}} />);
  const play = screen.getByRole("button", { name: "Play article" });
  await waitFor(() => expect(play).toBeEnabled());
  fireEvent.click(play);
  expect(screen.getByRole("button", { name: "Pause article" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Pause article" }));
  expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled();
  expect(SpeechWorker.instance.messages.some((message) => message.type === "close")).toBe(false);
  SpeechWorker.instance.emit({ type: "available", available: 24000, ends: [24000] });
  expect(screen.getByRole("button", { name: "Play article" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
});

it("seeks a completed recording to a selected sentence and can restart from the title", async () => {
  class SavedAudio {
    static instance: SavedAudio;
    currentTime = 0;
    paused = true;
    constructor() { SavedAudio.instance = this; }
    play = async () => { this.paused = false; };
    pause = () => { this.paused = true; };
  }
  const NativeURL = URL;
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL() { return "blob:article"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("Audio", SavedAudio);
  SpeechWorker.readyData = { type: "ready", audio: new Blob(), ends: [24000, 72000, 144000], complete: true, position: 48000, scrollY: 640 };
  let seek: ((index: number) => void) | undefined;
  const restoreScroll = vi.fn();
  render(() => <ArticleListen sentences={["Title", "First.", "Second."]} onSentence={() => {}}
    onSeekReady={(callback) => { seek = callback; }} onRestoreScroll={restoreScroll} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled());
  expect(restoreScroll).toHaveBeenCalledWith(640);
  seek!(2);
  expect(SavedAudio.instance.currentTime).toBe(3);
  expect(SavedAudio.instance.paused).toBe(false);
  seek!(0);
  expect(SavedAudio.instance.currentTime).toBe(0);
  expect(screen.getByRole("button", { name: "Pause article" })).toHaveAttribute("aria-pressed", "true");
});

it("waits for an unprepared passage and then reads from that sentence's boundary", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("AudioContext", PlaybackContext);
  let seek: ((index: number) => void) | undefined;
  render(() => <ArticleListen sentences={["Title", "First.", "Second."]} onSentence={() => {}}
    onSeekReady={(callback) => { seek = callback; }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled());
  seek!(2);
  const worker = SpeechWorker.instance;
  worker.emit({ type: "available", available: 48000, ends: [24000] });
  expect(worker.messages.filter((message) => message.type === "read")).toHaveLength(0);
  worker.emit({ type: "available", available: 96000, ends: [24000, 72000] });
  expect(worker.messages.find((message) => message.type === "read")).toMatchObject({ start: 72000 });
});

it("does not report an audio error when pause interrupts an unfinished play request", async () => {
  class DelayedAudio {
    currentTime = 0;
    rejectPlay?: (error: DOMException) => void;
    play = () => new Promise<void>((_, reject) => { this.rejectPlay = reject; });
    pause = () => { this.rejectPlay?.(new DOMException("Playback interrupted", "AbortError")); };
  }
  const NativeURL = URL;
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL() { return "blob:article"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("Audio", DelayedAudio);
  SpeechWorker.readyData = { type: "ready", audio: new Blob(), ends: [24000], complete: true, position: 0 };
  render(() => <ArticleListen sentences={["Title"]} onSentence={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Play article" }));
  fireEvent.click(screen.getByRole("button", { name: "Pause article" }));
  await Promise.resolve();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled();
});

it("plays a downloaded recording from the selected sentence without waiting for local generation", async () => {
  class SavedAudio {
    static instance: SavedAudio;
    currentTime = 0;
    play = async () => {};
    pause = () => {};
    constructor() { SavedAudio.instance = this; }
  }
  const NativeURL = URL;
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL() { return "blob:synced-article"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("AudioContext", PlaybackContext);
  vi.stubGlobal("Audio", SavedAudio);
  let seek: ((index: number) => void) | undefined;
  render(() => <ArticleListen sentences={["Title", "First sentence.", "Second sentence."]} onSentence={() => {}}
    onSeekReady={(callback) => { seek = callback; }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled());
  seek!(2);
  const worker = SpeechWorker.instance;
  worker.emit({ type: "remote", audio: new Blob(), ends: [24000, 72000, 96000], available: 96000 });
  expect(SavedAudio.instance.currentTime).toBe(3);
  expect(screen.getByRole("button", { name: "Pause article" })).toBeEnabled();
  expect(worker.messages.filter((message) => message.type === "read")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Pause article" }));
  expect(worker.messages.at(-1)).toMatchObject({ type: "position", position: 72000 });
});

it("handles system seeking without resuming paused playback and releases media controls on exit", async () => {
  class SavedAudio {
    static instance: SavedAudio;
    currentTime = 0;
    play = async () => {};
    pause = () => {};
    constructor() { SavedAudio.instance = this; }
  }
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = { playbackState: "none", setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => handlers.set(action, handler), setPositionState: vi.fn() };
  const NativeURL = URL;
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL() { return "blob:article"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("navigator", { mediaSession: session });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("Audio", SavedAudio);
  SpeechWorker.readyData = { type: "ready", audio: new Blob(), ends: [240000, 720000], complete: true, position: 0 };
  const { unmount } = render(() => <ArticleListen sentences={["Title", "Sentence."]} onSentence={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Play article" }));
  handlers.get("pause")!({ action: "pause" });
  handlers.get("seekto")!({ action: "seekto", seekTime: 12 });
  expect(SavedAudio.instance.currentTime).toBe(12);
  expect(SpeechWorker.instance.messages.at(-1)).toMatchObject({ type: "position", position: 288000 });
  expect(screen.getByRole("button", { name: "Play article" })).toBeEnabled();
  handlers.get("seekforward")!({ action: "seekforward", seekOffset: 100 });
  expect(SavedAudio.instance.currentTime).toBe(30);
  handlers.get("play")!({ action: "play" });
  expect(screen.getByRole("button", { name: "Pause article" })).toBeEnabled();
  unmount();
  expect(session.playbackState).toBe("none");
  expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
});

it("renders jumping dots while booting, transitions to pause when playing, and returns to play when paused", async () => {
  class StreamingContext {
    currentTime = 0;
    resume = async () => {};
    suspend = async () => {};
    close = async () => {};
    createBuffer = () => ({ copyToChannel: () => {} });
    createBufferSource = () => ({ connect: () => {}, start: () => {}, stop: () => {}, onended: null });
    destination = {};
  }
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", SpeechWorker);
  vi.stubGlobal("AudioContext", StreamingContext);

  render(() => <ArticleListen sentences={["Title", "First sentence."]} onSentence={() => {}} />);
  const playButton = screen.getByRole("button", { name: "Play article" });
  await waitFor(() => expect(playButton).toBeEnabled());

  expect(playButton.querySelector("svg path")).toBeInTheDocument();
  expect(playButton.querySelectorAll("span > span")).toHaveLength(0);

  fireEvent.click(playButton);

  const pauseButton = screen.getByRole("button", { name: "Pause article" });
  expect(pauseButton).toHaveAttribute("aria-pressed", "true");
  expect(pauseButton.querySelectorAll("span > span")).toHaveLength(3);
  expect(pauseButton.querySelector("svg rect")).toBeNull();

  SpeechWorker.instance.emit({ type: "available", available: 24000, ends: [24000] });

  const readMessage = SpeechWorker.instance.messages.find((m) => m.type === "read") as { requestId: number } | undefined;
  SpeechWorker.instance.emit({
    type: "pcm",
    samples: new Float32Array(24000),
    requestId: readMessage?.requestId ?? 1,
  });

  await waitFor(() => expect(pauseButton.querySelectorAll("span > span")).toHaveLength(0));
  expect(pauseButton.querySelectorAll("svg rect")).toHaveLength(2);

  fireEvent.click(pauseButton);
  const stoppedButton = screen.getByRole("button", { name: "Play article" });
  expect(stoppedButton).toBeEnabled();
  expect(stoppedButton.querySelectorAll("span > span")).toHaveLength(0);
  expect(stoppedButton.querySelector("svg path")).toBeInTheDocument();
});
