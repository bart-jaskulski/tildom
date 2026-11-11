import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Pause, Play } from "lucide-solid";
import { LISTEN_SAMPLE_RATE as rate, recordingKey } from "~/lib/listenRecording";
import { listenMediaSession } from "~/lib/listenMediaSession";
import { sentenceAtSample } from "~/lib/listenText";
import { flushCompletedAudio, setAudioSyncError } from "~/lib/listenSyncQueue";
import styles from "./ArticleListen.module.css";

export default function ArticleListen(props: { sentences: string[]; language?: string | null; onSentence: (index: number) => void; onSeekReady?: (seek: (index: number) => void) => void; onRestoreScroll?: (scrollY: number) => void }) {
  const [playing, setPlaying] = createSignal(false);
  const [preparing, setPreparing] = createSignal(false);
  const [generating, setGenerating] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [error, setError] = createSignal("");
  const [ready, setReady] = createSignal(false);
  let worker: Worker | undefined;
  let context: AudioContext | undefined;
  let audio: HTMLAudioElement | undefined;
  let streamAudio: HTMLAudioElement | undefined;
  let streamOutput: MediaStreamAudioDestinationNode | undefined;
  let audioUrl = "";
  let key = "";
  let position = 0;
  let available = 0;
  let ends: number[] = [];
  let complete = false;
  let cursor = 0;
  let scheduledAt = 0;
  let baseSample = 0;
  let baseTime = 0;
  let requestId = 0;
  let pendingRead = false;
  let checkingRemote = false;
  let playbackRequest = 0;
  let pendingSentence: number | null = null;
  let viewY = window.scrollY;
  const sources = new Set<AudioBufferSourceNode>();

  const currentSample = () => audio
    ? Math.floor(audio.currentTime * rate)
    : playing() && context
      ? Math.min(cursor, baseSample + Math.max(0, context.currentTime - baseTime) * rate)
      : position;

  const stopSources = () => {
    for (const source of sources) { source.onended = null; source.stop(); }
    sources.clear();
    cursor = Math.floor(position);
    scheduledAt = 0;
    pendingRead = false;
    requestId++;
  };

  const pause = () => {
    playbackRequest++;
    pendingSentence = null;
    position = Math.floor(currentSample());
    setPlaying(false);
    setPreparing(false);
    audio?.pause();
    streamAudio?.pause();
    stopSources();
    media.update(false, available / rate);
    void context?.suspend().catch(() => undefined);
    worker?.postMessage({ type: "position", position });
  };

  const finish = () => {
    playbackRequest++;
    setPlaying(false);
    position = 0;
    stopSources();
    setPreparing(false);
    streamAudio?.pause();
    media.update(false, available / rate);
    void context?.suspend().catch(() => undefined);
    props.onSentence(-1);
    worker?.postMessage({ type: "position", position: 0 });
  };

  const pump = () => {
    if (!playing() || !context || audio || checkingRemote || pendingRead || pendingSentence !== null || cursor >= available || (!complete && available - cursor < rate / 2) || scheduledAt - context.currentTime > 3) return;
    pendingRead = true;
    worker?.postMessage({ type: "read", start: cursor, requestId: ++requestId });
  };

  const useSavedAudio = (file: Blob) => {
    if (streamAudio) { streamAudio.onpause = null; streamAudio.pause(); }
    audioUrl = URL.createObjectURL(file);
    audio = new Audio(audioUrl);
    audio.currentTime = position / rate;
    audio.onended = finish;
    audio.onpause = () => { if (playing() && !audio?.ended) pause(); };
    audio.onerror = () => { pause(); setError("Saved audio could not be played."); };
  };

  const requestGeneration = () => {
    if (generating()) return;
    checkingRemote = true;
    setGenerating(true);
    worker?.postMessage({ type: "generate" });
  };

  const openWorker = () => {
    setReady(false);
    const instance = new Worker(new URL("../lib/listen.worker.ts", import.meta.url), { type: "module" });
    worker = instance;
    instance.onerror = () => {
      if (worker !== instance) return;
      pause();
      setGenerating(false);
      setPreparing(false);
      setReady(false);
      setError("Audio could not start. Press play to try again.");
    };
    instance.onmessage = ({ data }) => {
      if (data.type === "closed") { instance.terminate(); return; }
      if (worker !== instance) return;
      if (data.type === "ready") {
        ends = data.ends;
        available = data.available ?? ends.at(-1) ?? 0;
        complete = data.complete;
        setProgress(ends.length / props.sentences.length * 100);
        position = Math.min(Math.max(0, Number(data.position) || 0), available);
        if (complete && position >= available) position = 0;
        cursor = position;
        if (data.audio) useSavedAudio(data.audio);
        if (complete) void flushCompletedAudio();
        setReady(true);
        setPreparing(false);
        if (!playing() && Number.isFinite(data.scrollY) && data.scrollY !== null) {
          viewY = data.scrollY;
          props.onRestoreScroll?.(viewY);
        }
        if (playing()) start();
      }
      if (data.type === "sync-error") setAudioSyncError(data.error);
      if (data.type === "generating") { checkingRemote = false; pump(); }
      if (data.type === "remote") {
        position = Math.min(position, data.available);
        stopSources();
        void context?.suspend().catch(() => undefined);
        ends = data.ends;
        available = data.available;
        complete = true;
        checkingRemote = false;
        setGenerating(false);
        setProgress(100);
        useSavedAudio(data.audio);
        if (playing()) start();
      }
      if (data.type === "available" || data.type === "complete") {
        checkingRemote = false;
        available = data.available;
        ends = data.ends;
        complete = data.type === "complete";
        setProgress(ends.length / props.sentences.length * 100);
        if (complete) { setGenerating(false); void flushCompletedAudio(); }
        if (playing() && pendingSentence !== null && pendingSentence <= ends.length) start();
        else pump();
      }
      if (data.type === "pcm") {
        if (data.requestId !== requestId) return;
        pendingRead = false;
        if (!playing() || !context || !data.samples.length) return;
        const samples = data.samples as Float32Array<ArrayBuffer>;
        const buffer = context.createBuffer(1, samples.length, rate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(streamOutput ?? context.destination);
        const at = Math.max(scheduledAt, context.currentTime + 0.025);
        if (scheduledAt < context.currentTime) { baseSample = cursor; baseTime = at; }
        source.start(at);
        sources.add(source);
        source.onended = () => { sources.delete(source); pump(); };
        cursor += samples.length;
        scheduledAt = at + samples.length / rate;
        setPreparing(false);
        pump();
      }
      if (data.type === "error") {
        pause();
        available = ends.at(-1) ?? 0;
        position = Math.min(position, available);
        setGenerating(false);
        checkingRemote = false;
        setPreparing(false);
        setError(data.error);
      }
    };
    instance.postMessage({ type: "open", key, sentences: props.sentences });
  };

  const start = () => {
    if (pendingSentence !== null) {
      if (pendingSentence > ends.length) {
        setPreparing(true);
        requestGeneration();
        return;
      }
      position = pendingSentence === 0 ? 0 : ends[pendingSentence - 1];
      pendingSentence = null;
    }
    if (audio) {
      setPreparing(false);
      audio.currentTime = position / rate;
      const request = playbackRequest;
      void audio.play().catch(() => {
        if (request !== playbackRequest || !playing()) return;
        pause();
        setError("Playback could not start. Press play to try again.");
      });
    } else {
      if (!complete) {
        requestGeneration();
      }
      setPreparing(position >= available);
      cursor = position;
      scheduledAt = 0;
      baseSample = position;
      baseTime = context!.currentTime;
      pump();
    }
  };

  const play = () => {
    if (props.language && !props.language.toLowerCase().startsWith("en")) {
      setError("Article listening currently supports English.");
      return;
    }
    setError("");
    const request = ++playbackRequest;
    try {
      if (!audio) {
        context ??= new AudioContext({ sampleRate: rate });
        if (navigator.mediaSession && context.createMediaStreamDestination && !streamAudio) {
          streamOutput = context.createMediaStreamDestination();
          streamAudio = new Audio();
          streamAudio.srcObject = streamOutput.stream;
          streamAudio.onpause = () => { if (playing()) pause(); };
        }
        void streamAudio?.play().catch(() => {
          if (request !== playbackRequest || !playing()) return;
          pause();
          setError("Audio could not start. Press play to try again.");
        });
        void context.resume().catch(() => {
          if (request !== playbackRequest || !playing()) return;
          pause();
          setError("Audio could not start. Press play to try again.");
        });
      }
      setPlaying(true);
      media.activate();
      media.update(true, available / rate);
      setPreparing(pendingSentence !== null || (!audio && position >= available));
      if (ready()) start();
      else if (key) { worker?.terminate(); openWorker(); }
    } catch { setPlaying(false); setError("This browser could not start audio playback."); }
  };

  const toggle = () => { if (playing()) pause(); else play(); };
  const seek = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= props.sentences.length) return;
    pause();
    pendingSentence = index;
    props.onSentence(index);
    play();
  };
  const seekTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const resume = playing();
    pause();
    position = Math.max(0, Math.min(available, Math.floor(seconds * rate)));
    if (audio) audio.currentTime = position / rate;
    props.onSentence(sentenceAtSample(ends, position));
    worker?.postMessage({ type: "position", position });
    media.update(false, available / rate);
    if (resume) play();
  };
  const media = listenMediaSession({ title: () => props.sentences[0], play, pause, seek: seekTime, position: () => currentSample() / rate });
  props.onSeekReady?.(seek);

  createEffect(() => {
    const sentences = props.sentences;
    key = "";
    position = 0;
    available = 0;
    ends = [];
    complete = false;
    cursor = 0;
    pendingSentence = null;
    viewY = window.scrollY;
    setReady(false);
    setPreparing(false);
    setGenerating(false);
    setProgress(0);
    setError("");
    let current = true;
    void recordingKey(sentences).then((value) => {
      if (!current) return;
      key = value;
      openWorker();
    }).catch(() => setError("Device storage could not be opened."));
    let mediaSecond = -1;
    const tick = setInterval(() => {
      if (!playing()) return;
      if (pendingSentence !== null) return;
      const sample = currentSample();
      if (Math.floor(sample / rate) !== mediaSecond) {
        mediaSecond = Math.floor(sample / rate);
        media.update(true, available / rate);
      }
      if (!audio && complete && sample >= available && !sources.size) { finish(); return; }
      if (!audio && !sources.size) { setPreparing(true); pump(); return; }
      const index = sentenceAtSample(ends, sample);
      props.onSentence(index < 0 && !complete ? Math.min(ends.length, sentences.length - 1) : index);
      pump();
    }, 100);
    let scrollSave: ReturnType<typeof setTimeout> | undefined;
    const rememberScroll = () => {
      viewY = window.scrollY;
      clearTimeout(scrollSave);
      scrollSave = setTimeout(() => {
        if (ready()) worker?.postMessage({ type: "scroll", scrollY: viewY });
      }, 250);
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    const savePosition = setInterval(() => {
      if (playing()) worker?.postMessage({ type: "position", position: Math.floor(currentSample()) });
    }, 5000);
    onCleanup(() => {
      current = false;
      playbackRequest++;
      position = Math.floor(currentSample());
      setPlaying(false);
      stopSources();
      audio?.pause();
      audio = undefined;
      if (streamAudio) { streamAudio.onpause = null; streamAudio.pause(); streamAudio.srcObject = null; }
      streamOutput?.stream.getTracks().forEach((track) => track.stop());
      streamAudio = undefined;
      streamOutput = undefined;
      media.dispose();
      URL.revokeObjectURL(audioUrl);
      audioUrl = "";
      void context?.close();
      context = undefined;
      const instance = worker;
      worker = undefined;
      instance?.postMessage({ type: "close", position, scrollY: viewY });
      setTimeout(() => instance?.terminate(), 2000);
      window.removeEventListener("scroll", rememberScroll);
      clearTimeout(scrollSave);
      clearInterval(tick);
      clearInterval(savePosition);
      props.onSentence(-1);
    });
  });

  return (
    <div class={styles.controls}>
      <Show when={error()}><p class={styles.error} role="alert">{error()}</p></Show>
      <button class={styles.play} type="button" onClick={toggle} disabled={!ready() && !error()}
        aria-label={playing() ? "Pause article" : error() ? "Retry article audio" : "Play article"}
        aria-pressed={playing()} aria-describedby="article-audio-status">
        <svg class={styles.ring} viewBox="0 0 56 56" aria-hidden="true">
          <circle class={styles.surface} cx="28" cy="28" r="26" />
          <Show when={generating() || preparing()}>
            <circle classList={{ [styles.activity]: true, [styles.indeterminate]: progress() === 0 }}
              cx="28" cy="28" r="24" pathLength="100" stroke-dasharray={`${progress() || 24} 100`} />
          </Show>
        </svg>
        <Show when={playing()} fallback={<Play size={18} fill="currentColor" aria-hidden="true" />}>
          <Show
            when={!preparing()}
            fallback={
              <span class={styles.dots} aria-hidden="true">
                <span class={styles.dot} />
                <span class={styles.dot} />
                <span class={styles.dot} />
              </span>
            }
          >
            <Pause size={18} fill="currentColor" aria-hidden="true" />
          </Show>
        </Show>
      </button>
      <span id="article-audio-status" class={styles.srOnly} role="status">
        {preparing() && playing() ? "Preparing article audio" : playing() ? "Playing article" : generating() ? "Playback paused. Audio is still being prepared." : "Article audio"}
      </span>
    </div>
  );
}
