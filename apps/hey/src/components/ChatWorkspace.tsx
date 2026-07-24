import { For, Show, type Accessor, type Setter } from "solid-js";
import { renderMarkdownishToHtml } from "@tildom/markdownish";
import { writeChatDraft } from "../lib/store";
import type { Chat, Message } from "../lib/types";
import { compactDate, formatTime } from "../lib/presentation";

type Props = {
  chats: Accessor<Chat[]>; activeChat: Accessor<Chat | undefined>; activeChatId: Accessor<string>; messages: Accessor<Message[]>;
  draft: Accessor<string>; setDraft: Setter<string>; sending: Accessor<boolean>; editingMessage: Accessor<Message | undefined>;
  mobileOpen: Accessor<boolean>; setMobileOpen: Setter<boolean>; menuOpen: Accessor<boolean>; setMenuOpen: Setter<boolean>;
  atBottom: Accessor<boolean>; setAtBottom: Setter<boolean>; openChat: (id: string) => Promise<void>; createChat: () => Promise<void>;
  editMessage: (message: Message) => void; send: () => Promise<void>; stop: () => void; scrollToBottom: (behavior?: ScrollBehavior) => void;
  openRename: () => void; openDelete: () => void; resizeComposer: () => void; bindTranscript: (element: HTMLDivElement) => void; bindComposer: (element: HTMLTextAreaElement) => void;
};

export default function ChatWorkspace(props: Props) {
  return <section class="chat-layout" classList={{ "mobile-chat-open": props.mobileOpen() }}>
    <aside class="chat-ledger" aria-label="Conversations">
      <div class="rail-actions"><button class="new-chat" type="button" onClick={() => void props.createChat()}>+ new chat</button></div>
      <Show when={props.chats().length} fallback={<p class="empty">No conversations yet.</p>}>
        <For each={props.chats()}>{(chat, index) => <button class="chat-row" classList={{ active: chat.id === props.activeChatId() }} onClick={() => void props.openChat(chat.id)}><span class="line-number">{String(index() + 1).padStart(2, "0")}</span><strong>{chat.title}</strong><time title={new Date(chat.updatedAt).toLocaleString()}>{compactDate(chat.updatedAt)}</time></button>}</For>
      </Show>
    </aside>
    <section class="conversation" aria-label={props.activeChat()?.title || "Conversation"}>
      <header class="conversation-header"><button class="mobile-back" type="button" aria-label="Back to chats" onClick={() => props.setMobileOpen(false)}>←</button><h1>{props.activeChat()?.title || "New conversation"}</h1><div class="conversation-actions"><button type="button" aria-label="Chat actions" aria-expanded={props.menuOpen()} onClick={() => props.setMenuOpen(open => !open)}>···</button><Show when={props.menuOpen()}><div class="conversation-menu"><button type="button" onClick={props.openRename}>rename</button><button type="button" class="danger-link" onClick={props.openDelete}>delete</button></div></Show></div></header>
      <div ref={props.bindTranscript} class="transcript" aria-live="polite" onScroll={(event) => { const element = event.currentTarget; props.setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 24); }}>
        <Show when={props.messages().length} fallback={<div class="empty-chat"><strong>This conversation is empty.</strong><p>You can start with what happened, what feels difficult, or simply say hello.</p></div>}>
          <For each={props.messages()}>{(message, index) => <article class={`message ${message.role}`}><header><span>{message.role === "user" ? "you" : "hey"}</span><time>{formatTime(message.createdAt)}</time><Show when={message.role === "user" && index() === props.messages().length - 1 && !props.sending()}><button type="button" onClick={() => props.editMessage(message)}>edit</button></Show></header><Show when={message.body} fallback={<p>thinking<span aria-hidden="true">…</span></p>}><div class="markdownish" innerHTML={renderMarkdownishToHtml(message.body, { streaming: props.sending() && index() === props.messages().length - 1 })} /></Show></article>}</For>
        </Show>
      </div>
      <Show when={!props.atBottom()}><button type="button" class="scroll-bottom" aria-label="Scroll to latest message" onClick={() => props.scrollToBottom("smooth")}>↓</button></Show>
      <form class="composer" onSubmit={(event) => { event.preventDefault(); void props.send(); }}><label class="visually-hidden" for="message">Write a message</label><div><textarea ref={props.bindComposer} id="message" value={props.draft()} placeholder="Write a message…" rows="1" onInput={(event) => { const body = event.currentTarget.value; props.setDraft(body); props.resizeComposer(); if (props.activeChatId()) void writeChatDraft(props.activeChatId(), body); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void props.send(); } }} /><Show when={props.sending()} fallback={<button type="submit" disabled={!props.draft().trim()}>{props.editingMessage() ? "send edit ↵" : "send ↵"}</button>}><button type="button" onClick={props.stop}>stop ■</button></Show></div></form>
    </section>
  </section>;
}
