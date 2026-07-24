import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { initDb } from "./lib/db";
import { streamChat } from "./lib/chat";
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
  writeMemoryFile,
  writeChatDraft,
  writeSettings,
} from "./lib/store";
import type { Chat, MemoryFile, Message, SearchResult, Settings, Surface } from "./lib/types";

const compactDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `today · ${time(timestamp)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / 1_440)}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const time = (timestamp: number) =>
  new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(timestamp);

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
  const [error, setError] = createSignal("");
  const [toast, setToast] = createSignal("");
  let searchInput: HTMLInputElement | undefined;
  let renameDialog: HTMLDialogElement | undefined;
  let deleteDialog: HTMLDialogElement | undefined;
  let pairDialog: HTMLDialogElement | undefined;
  let renameInput: HTMLInputElement | undefined;
  let composerInput: HTMLTextAreaElement | undefined;

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
    composerInput.style.height = "0";
    composerInput.style.height = `${Math.min(composerInput.scrollHeight, window.innerHeight * .3)}px`;
  };

  const send = async () => {
    const body = draft().trim();
    const preferences = settings();
    if (!body || !activeChatId() || !preferences || sending()) return;
    setSending(true);
    setDraft("");
    queueMicrotask(() => resizeComposer());
    await writeChatDraft(activeChatId(), "");
    const chatId = activeChatId();
    let userMessage: Message | undefined;
    const pendingId = crypto.randomUUID();
    try {
      userMessage = await addMessage(chatId, "user", body);
      const requestMessages = [...messages(), userMessage];
      setMessages([...requestMessages, {
        id: pendingId,
        chatId,
        role: "assistant",
        body: "",
        createdAt: Date.now(),
      }]);
      let replyBody = "";
      const memoryWrites = await streamChat(requestMessages, memoryFiles(), preferences, (text) => {
        replyBody += text;
        setMessages((current) => current.map((message) =>
          message.id === pendingId ? { ...message, body: replyBody } : message
        ));
      });
      if (!replyBody.trim()) throw new Error("Hey returned an empty response.");
      const reply = await addMessage(chatId, "assistant", replyBody);
      setMessages((current) => current.map((message) => message.id === pendingId ? reply : message));
      await Promise.all(memoryWrites.map((write) => writeMemoryFile({ path: write.path }, write.content)));
      if (memoryWrites.length) setMemoryFiles(await listMemoryFiles());
      await refreshChats(chatId);
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      if (!userMessage) {
        setDraft(body);
        await writeChatDraft(chatId, body);
      }
      showToast(cause instanceof Error ? cause.message : String(cause));
    } finally {
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
      <header class="topbar">
        <button class="wordmark" type="button" onClick={() => setSurface("chats")}>tildom</button>
        <nav aria-label="Primary">
          <button classList={{ active: surface() === "chats" }} onClick={() => setSurface("chats")}>[ chats.db ]</button>
          <button classList={{ active: surface() === "memory" }} onClick={() => setSurface("memory")}>[ memory/ ]</button>
          <button classList={{ active: surface() === "settings" }} onClick={() => setSurface("settings")}>[ settings.json ]</button>
        </nav>
        <div class="global-search" data-open={mobileSearchOpen() || undefined} role="search">
          <button
            class="search-toggle"
            type="button"
            aria-label={mobileSearchOpen() ? "Close search" : "Search chats and memory"}
            aria-expanded={mobileSearchOpen()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const open = !mobileSearchOpen();
              setMobileSearchOpen(open);
              if (open) queueMicrotask(() => searchInput?.focus());
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={mobileSearchOpen() ? "M6 6l12 12M18 6 6 18" : "m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"} />
            </svg>
          </button>
          <input
            ref={searchInput}
            type="search"
            value={search()}
            placeholder="search chats and memory"
            aria-label="Search chats and memory"
            onInput={(event) => setSearch(event.currentTarget.value)}
            onBlur={() => !search() && setMobileSearchOpen(false)}
          />
        </div>
      </header>

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
              <section class="chat-layout" classList={{ "mobile-chat-open": mobileChatOpen() }}>
                <aside class="chat-ledger" aria-label="Conversations">
                  <div class="rail-actions">
                    <button
                      class="new-chat"
                      type="button"
                      onClick={async () => {
                        const id = await createChat();
                        await refreshChats(id);
                        setMobileChatOpen(true);
                      }}
                    >+ new chat</button>
                  </div>
                  <Show when={chats().length} fallback={<p class="empty">No conversations yet.</p>}>
                    <For each={chats()}>{(chat, index) =>
                      <button
                        class="chat-row"
                        classList={{ active: chat.id === activeChatId() }}
                        onClick={() => void openChat(chat.id)}
                      >
                        <span class="line-number">{String(index() + 1).padStart(2, "0")}</span>
                        <strong>{chat.title}</strong>
                        <time title={new Date(chat.updatedAt).toLocaleString()}>{compactDate(chat.updatedAt)}</time>
                      </button>
                    }</For>
                  </Show>
                </aside>

                <section class="conversation" aria-label={activeChat()?.title || "Conversation"}>
                  <header class="conversation-header">
                    <button class="mobile-back" type="button" aria-label="Back to chats" onClick={() => setMobileChatOpen(false)}>←</button>
                    <h1>{activeChat()?.title || "New conversation"}</h1>
                    <div class="conversation-actions">
                      <button
                        type="button"
                        aria-label="Chat actions"
                        aria-expanded={chatMenuOpen()}
                        onClick={() => setChatMenuOpen((open) => !open)}
                      >···</button>
                      <Show when={chatMenuOpen()}>
                        <div class="conversation-menu">
                          <button type="button" onClick={beginRename}>rename</button>
                          <button
                            type="button"
                            class="danger-link"
                            onClick={() => {
                              setChatMenuOpen(false);
                              deleteDialog?.showModal();
                            }}
                          >delete</button>
                        </div>
                      </Show>
                    </div>
                  </header>

                  <div class="transcript" aria-live="polite">
                    <Show when={messages().length} fallback={
                      <div class="empty-chat">
                        <strong>This conversation is empty.</strong>
                        <p>You can start with what happened, what feels difficult, or simply say hello.</p>
                      </div>
                    }>
                      <For each={messages()}>{(message) =>
                        <article class={`message ${message.role}`}>
                          <header><span>{message.role === "user" ? "you" : "hey"}</span><time>{time(message.createdAt)}</time></header>
                          <Show
                            when={message.body}
                            fallback={<p>thinking<span aria-hidden="true">…</span></p>}
                          >
                            <For each={message.body.split("\n\n")}>{(paragraph) => <p>{paragraph}</p>}</For>
                          </Show>
                        </article>
                      }</For>
                    </Show>
                  </div>

                  <form class="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
                    <label class="visually-hidden" for="message">Write a message</label>
                    <div>
                      <textarea
                        ref={composerInput}
                        id="message"
                        value={draft()}
                        placeholder="Write a message…"
                        rows="1"
                        onInput={(event) => {
                          const body = event.currentTarget.value;
                          setDraft(body);
                          resizeComposer();
                          if (activeChatId()) void writeChatDraft(activeChatId(), body);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void send();
                          }
                        }}
                      />
                      <button type="submit" disabled={!draft().trim() || sending()}>send ↵</button>
                    </div>
                  </form>
                </section>
              </section>
            </Show>

            <Show when={!search().trim() && surface() === "memory"}>
              <section class="memory-layout" classList={{ "mobile-memory-open": mobileMemoryOpen() }}>
                <aside class="file-list">
                  <For each={memoryGroups()}>{([directory, files]) =>
                    <section class="file-group">
                      <p>{directory ? `▾ ${directory}/` : "memory/"}</p>
                      <For each={files}>{(file) =>
                        <button
                          class="file-row"
                          classList={{ active: file.path === activeMemoryPath() }}
                          onClick={() => void openMemory(file.path)}
                        >
                          <span aria-hidden="true">·</span>
                          <span>{directory ? file.path.slice(directory.length + 1) : file.path}</span>
                        </button>
                      }</For>
                    </section>
                  }</For>
                </aside>
                <section class="memory-editor">
                  <div class="editor-heading">
                    <button class="mobile-back" type="button" aria-label="Back to memory files" onClick={() => setMobileMemoryOpen(false)}>←</button>
                    <h1>{activeMemory()?.path}</h1>
                  </div>
                  <textarea
                    aria-label={`Edit ${activeMemory()?.path || "memory file"}`}
                    value={memoryDraft()}
                    onInput={(event) => setMemoryDraft(event.currentTarget.value)}
                  />
                  <footer>
                    <button
                      class="button primary"
                      disabled={!activeMemory() || memoryDraft() === activeMemory()?.content}
                      onClick={() => void saveMemory()}
                    >save file</button>
                  </footer>
                </section>
              </section>
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

                <section class="settings-section">
                  <h2>Sync</h2>
                  <p>Not connected. Data stays local.</p>
                  <div class="button-row">
                    <button class="button" type="button" onClick={() => pairDialog?.showModal()}>pair another device</button>
                  </div>
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
          <header><h2 id="pair-title">Pair another device</h2></header>
          <p>Open Hey on the other device and enter this one-time code. It expires in ten minutes.</p>
          <output class="pair-code" aria-label="Pairing code">HE7K–4M2Q</output>
          <footer>
            <button class="button" value="cancel">close</button>
            <button
              class="button primary"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText("HE7K-4M2Q");
                showToast("Pairing code copied");
              }}
            >copy code</button>
          </footer>
        </form>
      </dialog>

      <Show when={toast()}><div class="toast" role="status">{toast()}</div></Show>
    </div>
  );
}
