import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { initDb } from "./lib/db";
import { generateChatTitle, streamChat } from "./lib/chat";
import { buildPairingUrl, clearPairingHash, parsePairingSecret } from "@tildom/sync-client";
import {
  createSyncVault,
  disconnectSync,
  initializeSync,
  joinSyncVault,
  refreshSyncState,
  syncNow,
  syncSignals,
} from "./lib/syncClient";
import { getSyncConfig } from "./lib/syncState";
import {
  addMessage,
  createChat,
  deleteChat,
  listChats,
  listMemoryFiles,
  listMessages,
  readChatDraft,
  readSettings,
  renameChat,
  titleChat,
  updateMessage,
  writeMemoryFile,
  writeChatDraft,
  writeSettings,
} from "./lib/store";
import type { Chat, MemoryFile, Message, SearchResult, Settings, Surface } from "./lib/types";
import { pwaInstall } from "./lib/pwaInstall";
import AppHeader from "./components/AppHeader";
import ChatWorkspace from "./components/ChatWorkspace";
import MemoryWorkspace from "./components/MemoryWorkspace";
import { compactDate } from "./lib/presentation";

const time = (timestamp: number) => new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(timestamp);

const searchTerms = (query: string): string[] => query.toLowerCase().match(/[\p{L}\p{N}_/-]+/gu) ?? [];

const Highlight = (props: { text: string; query: string }) => {
  const terms = searchTerms(props.query).sort((left, right) => right.length - left.length);
  if (!terms.length) return props.text;
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return <For each={props.text.split(new RegExp(`(${pattern})`, "gi"))}>{(part) =>
    terms.includes(part.toLowerCase()) ? <mark>{part}</mark> : part
  }</For>;
};

export default function App() {
  const [surface, setSurface] = createSignal<Surface>("chats");
  const [chats, setChats] = createSignal<Chat[]>([]);
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [memoryFiles, setMemoryFiles] = createSignal<MemoryFile[]>([]);
  const [settings, setSettings] = createSignal<Settings>();
  const [activeChatId, setActiveChatId] = createSignal("");
  const [activeMemoryPath, setActiveMemoryPath] = createSignal("");
  const [memoryDraft, setMemoryDraft] = createSignal("");
  const [draft, setDraft] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [mobileSearchOpen, setMobileSearchOpen] = createSignal(false);
  const [mobileChatOpen, setMobileChatOpen] = createSignal(false);
  const [mobileMemoryOpen, setMobileMemoryOpen] = createSignal(false);
  const [chatMenuOpen, setChatMenuOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [sending, setSending] = createSignal(false);
  const [editingMessage, setEditingMessage] = createSignal<Message>();
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [syncBusy, setSyncBusy] = createSignal(false);
  const [syncError, setSyncError] = createSignal("");
  const [pairUrl, setPairUrl] = createSignal("");
  const [joinSecret, setJoinSecret] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const [toast, setToast] = createSignal("");
  let renameDialog: HTMLDialogElement | undefined;
  let deleteDialog: HTMLDialogElement | undefined;
  let pairDialog: HTMLDialogElement | undefined;
  let renameInput: HTMLInputElement | undefined;
  let composerInput: HTMLTextAreaElement | undefined;
  let transcript: HTMLDivElement | undefined;
  let generation: AbortController | undefined;

  const activeChat = createMemo(() => chats().find((chat) => chat.id === activeChatId()));
  const activeMemory = createMemo(() => memoryFiles().find((file) => file.path === activeMemoryPath()));
  const memoryGroups = createMemo(() => {
    const groups = new Map<string, MemoryFile[]>();
    for (const file of memoryFiles()) {
      const slash = file.path.indexOf("/");
      const directory = slash === -1 ? "" : file.path.slice(0, slash);
      groups.set(directory, [...(groups.get(directory) ?? []), file]);
    }
    return [...groups.entries()];
  });

  const results = createMemo<SearchResult[]>(() => {
    const needle = search().trim().toLowerCase();
    if (!needle) return [];
    const chatResults: SearchResult[] = chats()
      .filter((chat) => chat.title.toLowerCase().includes(needle))
      .map((chat) => ({ kind: "chat", id: chat.id, title: chat.title, detail: compactDate(chat.updatedAt) }));
    const memoryResults: SearchResult[] = memoryFiles()
      .filter((file) => `${file.path} ${file.content}`.toLowerCase().includes(needle))
      .map((file) => ({
        kind: "memory",
        id: file.path,
        title: file.path,
        detail: file.content.replace(/^#\s+.*\n+/, "").replace(/\s+/g, " ").slice(0, 120),
      }));
    return [...chatResults, ...memoryResults];
  });

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const refreshChats = async (preferredId?: string) => {
    const nextChats = await listChats();
    setChats(nextChats);
    const id = preferredId || activeChatId() || nextChats[0]?.id || "";
    setActiveChatId(id);
    setMessages(id ? await listMessages(id) : []);
  };

  const openChat = async (id: string) => {
    setActiveChatId(id);
    setMessages(await listMessages(id));
    setDraft(await readChatDraft(id));
    queueMicrotask(() => resizeComposer());
    queueMicrotask(() => scrollToBottom());
    setMobileChatOpen(true);
    setSearch("");
    setMobileSearchOpen(false);
  };

  const openMemory = async (path: string) => {
    const file = memoryFiles().find((candidate) => candidate.path === path);
    if (!file) return;
    setSurface("memory");
    setActiveMemoryPath(path);
    setMemoryDraft(file.content);
    setMobileMemoryOpen(true);
    setSearch("");
    setMobileSearchOpen(false);
  };

  onMount(async () => {
    pwaInstall.initialize();
    try {
      await initDb();
      const [files, preferences] = await Promise.all([listMemoryFiles(), readSettings()]);
      setMemoryFiles(files);
      setSettings(preferences);
      const firstMemoryPath = files[0]?.path || "";
      setActiveMemoryPath(firstMemoryPath);
      setMemoryDraft(files[0]?.content || "");
      await refreshChats();
      if (activeChatId()) setDraft(await readChatDraft(activeChatId()));
      await refreshSyncState();
      await refreshPairUrl();
      const secret = parsePairingSecret(window.location.hash);
      if (secret) {
        setJoinSecret(secret);
        queueMicrotask(() => pairDialog?.showModal());
      }
      window.setTimeout(() => void initializeSync(), 1_000);
      queueMicrotask(() => resizeComposer());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  });

  createEffect(() => {
    const file = activeMemory();
    if (file) setMemoryDraft(file.content);
  });

  const resizeComposer = () => {
    if (!composerInput) return;
    composerInput.style.height = draft() ? "0" : "";
    if (!draft()) return;
    composerInput.style.height = `${Math.min(composerInput.scrollHeight, window.innerHeight * .3)}px`;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    transcript?.scrollTo({ top: transcript.scrollHeight, behavior });
    setIsAtBottom(true);
  };

  const stop = () => generation?.abort();

  const beginMessageEdit = (message: Message) => {
    setEditingMessage(message);
    setDraft(message.body);
    queueMicrotask(() => {
      resizeComposer();
      composerInput?.focus();
      composerInput?.setSelectionRange(message.body.length, message.body.length);
    });
  };

  const send = async () => {
    const body = draft().trim();
    const preferences = settings();
    if (!body || !activeChatId() || !preferences || sending()) return;
    const editedMessage = editingMessage();
    setSending(true);
    setEditingMessage(undefined);
    setDraft("");
    queueMicrotask(() => resizeComposer());
    queueMicrotask(() => scrollToBottom());
    await writeChatDraft(activeChatId(), "");
    const chatId = activeChatId();
    let userMessage: Message | undefined;
    let replyBody = "";
    let renderFrame = 0;
    const pendingId = crypto.randomUUID();
    try {
      const isFirstUserMessage = !messages().some((message) => message.role === "user");
      userMessage = editedMessage
        ? await updateMessage(editedMessage, body)
        : await addMessage(chatId, "user", body);
      if (isFirstUserMessage) {
        void generateChatTitle(body)
          .then(async (title) => {
            await titleChat(chatId, title);
            setChats(await listChats());
          })
          .catch(() => {});
      }
      const requestMessages = editedMessage
        ? messages().map((message) => message.id === editedMessage.id ? userMessage! : message)
        : [...messages(), userMessage];
      setMessages([...requestMessages, {
        id: pendingId,
        chatId,
        role: "assistant",
        body: "",
        createdAt: Date.now(),
      }]);
      queueMicrotask(() => scrollToBottom());
      generation = new AbortController();
      const memoryWrites = await streamChat(requestMessages, memoryFiles(), preferences, (text) => {
        replyBody += text;
        if (renderFrame) return;
        renderFrame = requestAnimationFrame(() => {
          renderFrame = 0;
          setMessages((current) => current.map((message) =>
            message.id === pendingId ? { ...message, body: replyBody } : message
          ));
          if (isAtBottom()) scrollToBottom();
        });
      }, generation.signal);
      if (renderFrame) cancelAnimationFrame(renderFrame);
      if (!replyBody.trim()) throw new Error("Hey returned an empty response.");
      const reply = await addMessage(chatId, "assistant", replyBody);
      setMessages((current) => current.map((message) => message.id === pendingId ? reply : message));
      await Promise.all(memoryWrites.map((write) => writeMemoryFile({ path: write.path }, write.content)));
      if (memoryWrites.length) setMemoryFiles(await listMemoryFiles());
      await refreshChats(chatId);
    } catch (cause) {
      const wasStopped = generation?.signal.aborted === true;
      if (wasStopped && replyBody.trim()) {
        const reply = await addMessage(chatId, "assistant", replyBody);
        setMessages((current) => current.map((message) => message.id === pendingId ? reply : message));
        await refreshChats(chatId);
      } else {
        setMessages((current) => current.filter((message) => message.id !== pendingId));
      }
      if (!userMessage) {
        setDraft(body);
        await writeChatDraft(chatId, body);
      }
      if (!wasStopped) showToast(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (renderFrame) cancelAnimationFrame(renderFrame);
      generation = undefined;
      setSending(false);
    }
  };

  const saveMemory = async () => {
    const file = activeMemory();
    if (!file || memoryDraft() === file.content) return;
    await writeMemoryFile(file, memoryDraft());
    const files = await listMemoryFiles();
    setMemoryFiles(files);
    showToast("Memory saved");
  };

  const savePreferences = async (next: Settings) => {
    setSettings(next);
    await writeSettings(next);
    showToast("Settings saved");
  };

  const refreshPairUrl = async () => {
    const config = await getSyncConfig();
    setPairUrl(config ? buildPairingUrl(window.location.origin, config.secret) : "");
  };

  const runSync = async (action: () => Promise<unknown>) => {
    setSyncBusy(true);
    setSyncError("");
    try {
      await action();
      await refreshSyncState();
      await refreshPairUrl();
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : "Sync failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const joinPair = () => runSync(async () => {
    const secret = joinSecret();
    if (!secret) throw new Error("Missing pairing secret");
    clearPairingHash();
    await joinSyncVault(secret);
    setJoinSecret(null);
    pairDialog?.close();
    showToast("Device paired");
  });

  const beginRename = () => {
    if (!activeChat()) return;
    setChatMenuOpen(false);
    renameDialog?.showModal();
    queueMicrotask(() => {
      if (renameInput) {
        renameInput.value = activeChat()!.title;
        renameInput.select();
      }
    });
  };

  const submitRename = async (event: SubmitEvent) => {
    event.preventDefault();
    const title = renameInput?.value.trim();
    if (!title || !activeChatId()) return;
    await renameChat(activeChatId(), title);
    await refreshChats(activeChatId());
    renameDialog?.close();
  };

  const confirmDelete = async () => {
    const id = activeChatId();
    if (!id) return;
    await deleteChat(id);
    setActiveChatId("");
    setMobileChatOpen(false);
    await refreshChats();
    deleteDialog?.close();
    showToast("Conversation deleted");
  };

  const selectResult = (result: SearchResult) => {
    if (result.kind === "chat") void openChat(result.id);
    else void openMemory(result.id);
  };

  return (
    <div class="app-shell">
      <AppHeader {...{ surface, setSurface, search, setSearch, mobileSearchOpen, setMobileSearchOpen }} />

      <main>
        <Show when={!loading()} fallback={<div class="state">opening hey.sqlite3…</div>}>
          <Show when={!error()} fallback={
            <section class="state error-state">
              <h1>Hey couldn’t open its local database.</h1>
              <p>{error()}</p>
              <button class="button" onClick={() => location.reload()}>retry</button>
            </section>
          }>
            <Show when={search().trim()}>
              <section class="search-results" aria-label="Search results">
                <p class="feed-note">Search results for <b>{search()}</b>. <button onClick={() => setSearch("")}>clear</button></p>
                <Show when={results().length} fallback={<p class="feed-note">No local matches.</p>}>
                  <ol class="result-list">
                    <For each={results()}>{(result) =>
                      <li>
                        <button class="result-row" onClick={() => selectResult(result)}>
                          <span class="result-title"><Highlight text={result.title} query={search()} /></span>
                          <span class="result-kind">[ {result.kind} ]</span>
                          <Show when={result.detail}><span class="result-detail"><Highlight text={result.detail} query={search()} /></span></Show>
                        </button>
                      </li>
                    }</For>
                  </ol>
                </Show>
              </section>
            </Show>

            <Show when={!search().trim() && surface() === "chats"}>
              <ChatWorkspace
                chats={chats} activeChat={activeChat} activeChatId={activeChatId} messages={messages} draft={draft} setDraft={setDraft}
                sending={sending} editingMessage={editingMessage} mobileOpen={mobileChatOpen} setMobileOpen={setMobileChatOpen}
                menuOpen={chatMenuOpen} setMenuOpen={setChatMenuOpen} atBottom={isAtBottom} setAtBottom={setIsAtBottom}
                openChat={openChat} createChat={async () => { const id = await createChat(); await refreshChats(id); setMobileChatOpen(true); }}
                editMessage={beginMessageEdit} send={send} stop={stop} scrollToBottom={scrollToBottom} openRename={beginRename}
                openDelete={() => { setChatMenuOpen(false); deleteDialog?.showModal(); }} resizeComposer={resizeComposer}
                bindTranscript={(element) => { transcript = element; }} bindComposer={(element) => { composerInput = element; }}
              />
            </Show>

            <Show when={!search().trim() && surface() === "memory"}>
              <MemoryWorkspace groups={memoryGroups} active={activeMemory} activePath={activeMemoryPath} draft={memoryDraft} setDraft={setMemoryDraft} mobileOpen={mobileMemoryOpen} setMobileOpen={setMobileMemoryOpen} openFile={openMemory} save={saveMemory} />
            </Show>

            <Show when={!search().trim() && surface() === "settings" && settings()}>
              {(preferences) => <section class="settings">
                <section class="settings-section">
                  <h1>Agent</h1>
                  <label class="setting-line">
                    <span>tone</span>
                    <select
                      value={preferences().tone}
                      onChange={(event) => void savePreferences({ ...preferences(), tone: event.currentTarget.value as Settings["tone"] })}
                    >
                      <option value="gentle">gentle</option>
                      <option value="balanced">balanced</option>
                      <option value="direct">direct</option>
                    </select>
                  </label>
                  <label class="setting-line">
                    <span>response length</span>
                    <select
                      value={preferences().responseLength}
                      onChange={(event) => void savePreferences({ ...preferences(), responseLength: event.currentTarget.value as Settings["responseLength"] })}
                    >
                      <option value="short">short</option>
                      <option value="balanced">balanced</option>
                      <option value="detailed">detailed</option>
                    </select>
                  </label>
                  <label class="instructions">
                    <span>instructions</span>
                    <textarea
                      rows="4"
                      value={preferences().instructions}
                      onChange={(event) => void savePreferences({ ...preferences(), instructions: event.currentTarget.value })}
                    />
                  </label>
                </section>

                <section class="settings-section">
                  <h2>Memory</h2>
                  <label class="checkbox-line">
                    <input
                      type="checkbox"
                      checked={preferences().memoryEnabled}
                      onChange={(event) => void savePreferences({ ...preferences(), memoryEnabled: event.currentTarget.checked })}
                    />
                    <span>[{preferences().memoryEnabled ? "x" : " "}] use memory</span>
                  </label>
                </section>

                <section class="settings-section">
                  <h2>Keyboard</h2>
                  <label class="checkbox-line">
                    <input
                      type="checkbox"
                      checked={preferences().vimEnabled}
                      onChange={(event) => void savePreferences({ ...preferences(), vimEnabled: event.currentTarget.checked })}
                    />
                    <span>[{preferences().vimEnabled ? "x" : " "}] enable Vim keys</span>
                  </label>
                </section>

                <Show when={pwaInstall.available() || pwaInstall.needsSafariInstructions()}>
                  <section class="settings-section">
                    <h2>Install</h2>
                    <Show when={pwaInstall.available()}>
                      <button class="button" type="button" onClick={() => void pwaInstall.prompt()}>install hey</button>
                    </Show>
                    <Show when={!pwaInstall.available() && pwaInstall.needsSafariInstructions()}>
                      <p>In Safari, use Share → Add to Home Screen.</p>
                    </Show>
                  </section>
                </Show>

                <section class="settings-section">
                  <h2>Sync</h2>
                  <p>{syncSignals.isPaired() ? syncSignals.statusText() : "Not connected. Data stays local."}</p>
                  <div class="button-row">
                    <Show
                      when={syncSignals.isPaired()}
                      fallback={
                        <button
                          class="button"
                          type="button"
                          disabled={syncBusy()}
                          onClick={() => pairDialog?.showModal()}
                        >create sync vault</button>
                      }
                    >
                      <button class="button" type="button" disabled={syncBusy()} onClick={() => void runSync(syncNow)}>sync now</button>
                      <button class="button" type="button" disabled={syncBusy()} onClick={() => pairDialog?.showModal()}>pair another device</button>
                    </Show>
                  </div>
                  <Show when={syncError()}><p class="sync-error" role="alert">{syncError()}</p></Show>
                </section>
              </section>}
            </Show>
          </Show>
        </Show>
      </main>

      <dialog ref={renameDialog} aria-labelledby="rename-title">
        <form method="dialog" onSubmit={submitRename}>
          <header><h2 id="rename-title">Rename chat</h2></header>
          <label for="rename-input">name</label>
          <input ref={renameInput} id="rename-input" required />
          <footer>
            <button class="button" type="button" onClick={() => renameDialog?.close()}>cancel</button>
            <button class="button primary" type="submit">rename</button>
          </footer>
        </form>
      </dialog>

      <dialog ref={deleteDialog} aria-labelledby="delete-title">
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); void confirmDelete(); }}>
          <header><h2 id="delete-title">Delete this chat?</h2></header>
          <p>“{activeChat()?.title}” and its messages will be permanently removed from this device.</p>
          <footer>
            <button class="button" type="button" onClick={() => deleteDialog?.close()}>cancel</button>
            <button class="button danger" type="submit">delete chat</button>
          </footer>
        </form>
      </dialog>

      <dialog ref={pairDialog} aria-labelledby="pair-title">
        <form method="dialog">
          <header><h2 id="pair-title">{joinSecret() ? "Join sync vault" : "Sync"}</h2></header>
          <Show when={joinSecret()}>
            <p>Pairing replaces this device with the latest encrypted snapshot from the vault.</p>
          </Show>
          <Show when={!joinSecret() && !syncSignals.isPaired()}>
            <p>Create an encrypted vault for chats, settings, and memory.</p>
          </Show>
          <Show when={!joinSecret() && syncSignals.isPaired()}>
            <p>Open this link on the other device.</p>
            <input class="pair-link" aria-label="Pairing link" readOnly value={pairUrl()} />
          </Show>
          <Show when={syncError()}><p class="sync-error" role="alert">{syncError()}</p></Show>
          <footer>
            <button class="button" value="cancel" disabled={syncBusy()}>cancel</button>
            <Show when={joinSecret()}>
              <button class="button primary" type="button" disabled={syncBusy()} onClick={() => void joinPair()}>
                {syncBusy() ? "pairing…" : "join vault"}
              </button>
            </Show>
            <Show when={!joinSecret() && !syncSignals.isPaired()}>
              <button class="button primary" type="button" disabled={syncBusy()} onClick={() => void runSync(createSyncVault)}>
                {syncBusy() ? "creating…" : "create vault"}
              </button>
            </Show>
            <Show when={!joinSecret() && syncSignals.isPaired()}>
              <button
                class="button danger"
                type="button"
                disabled={syncBusy()}
                onClick={() => void runSync(async () => {
                  await disconnectSync();
                  pairDialog?.close();
                })}
              >disconnect</button>
              <button
                class="button primary"
                type="button"
                disabled={syncBusy() || !pairUrl()}
                onClick={() => void navigator.clipboard.writeText(pairUrl()).then(() => showToast("Pairing link copied"))}
              >copy link</button>
            </Show>
          </footer>
        </form>
      </dialog>

      <Show when={toast()}><div class="toast" role="status">{toast()}</div></Show>
    </div>
  );
}
