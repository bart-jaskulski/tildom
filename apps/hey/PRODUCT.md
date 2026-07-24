# Hey

## Positioning

Hey is a local-first personal LLM conversation app with durable, inspectable memory. It is for one
person who wants ad hoc consultation, help thinking through difficult moments, and ordinary
conversation without repeatedly restating established context.

It is a conversation product, not an agent platform.

## Operating Context

The user may arrive curious, lonely, tired, emotionally activated, or unable to organize the next
step. The primary action must always remain starting or continuing a conversation. Configuration,
memory management, sync, and technical state stay available without crowding the transcript.

The app is used on phones and desktop browsers. Local chats, drafts, settings, and memories remain
available offline; model responses require connectivity.

## Product Principles

1. **Conversation first:** chat is the default surface and should not expose agent plumbing.
2. **Durable continuity:** memory should save future explanation and improve future responses.
3. **Quiet memory:** automatic memory writes do not annotate the transcript. The separate memory
   surface provides direct inspection and editing.
4. **Bounded disclosure:** only the active chat window, its summary, and locally retrieved relevant
   memory are sent for a turn.
5. **Local-first honesty:** the browser database is canonical. The backend is a turn-scoped
   execution environment.
6. **Warmth without manipulation:** Hey can feel familiar without claiming personhood, exclusive
   attachment, or replacement of human support.

## Primary Surfaces

- `chats.db`: global chat search, conversation list, transcript, composer, and chat management.
- `memory/`: virtual memory filesystem, search, and editing.
- `settings.json`: tone, response length, custom instructions, memory behavior, Vim-key preference,
  encrypted sync, device pairing, and local data controls.

## Product Boundaries

Out of scope: multiple agents, skills, MCP, BYOK, a tool marketplace, autonomous task execution,
voice, attachments, embeddings, vector databases, and offline model inference.

Chat and memory synchronization use one encrypted vault. The virtual memory filesystem is stored
inside SQLite so export, backup, pairing, and sync remain one portable data path.
