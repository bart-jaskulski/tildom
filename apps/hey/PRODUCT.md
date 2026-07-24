# Hey

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person who wants ad hoc consultation, help thinking through difficult moments, and ordinary
conversation without repeatedly restating established context. The user may arrive curious,
lonely, tired, emotionally activated, or unable to organize the next step.

## Product Purpose

Hey is a local-first personal LLM conversation app with durable, inspectable memory. It supports
ongoing conversation while giving the user direct access to the context that creates continuity.
It is a conversation product, not an agent platform.

## Positioning

Hey combines locally canonical chats and editable memory with turn-scoped model execution. Only
the active chat context, its summary, and locally retrieved relevant memory are sent for a turn;
the backend does not become the durable home of the user's conversation history.

## Operating Context

The primary action is starting or continuing a conversation on a phone or desktop browser. Local
chats, drafts, settings, and memories remain available offline; model responses require
connectivity. Configuration, memory management, sync, and technical state stay available without
crowding the transcript.

## Capabilities and Constraints

- Store chats, drafts, settings, summaries, and a virtual memory filesystem in browser SQLite.
- Search, inspect, edit, and delete durable memories separately from the transcript.
- Stream model responses through Hey's backend using server-held model credentials.
- Send a turn-scoped chat and memory snapshot; commit memory tool writes back to the canonical
  local vault.
- Optionally synchronize the encrypted SQLite vault and pair devices.
- Keep chat and memory in one portable data path for export, backup, pairing, and sync.
- Out of scope: multiple agents, skills, MCP, BYOK, a tool marketplace, autonomous task execution,
  voice, attachments, embeddings, vector databases, and offline model inference.

## Brand Commitments

Hey belongs to the Tildom family. Its voice may be warm and familiar, but must not claim
personhood, exclusive attachment, or replacement of human support. Routine system activity,
context attribution, and agent plumbing stay out of the conversation. Visual and interaction
commitments are recorded in the root `DESIGN.md`.

## Evidence on Hand

The runnable client, model server, memory tools, sync integration, and tests live in `apps/hey`.
The implementation demonstrates local persistence and turn-scoped execution. The repository
contains no customer testimonials, therapeutic efficacy evidence, safety certification, adoption
benchmarks, or claims that Hey replaces professional or human support; future work must not
fabricate them.

## Product Principles

1. **Conversation first:** chat remains the default surface.
2. **Durable continuity:** memory should save future explanation and improve later responses.
3. **Quiet, inspectable memory:** automatic writes do not annotate the transcript; users can review
   and edit them separately.
4. **Bounded disclosure:** each model turn receives only the context needed for that turn.
5. **Local-first honesty:** the browser database is canonical and network limits remain visible.
6. **Warmth without manipulation:** familiarity cannot become dependency or false personhood.

## Accessibility & Inclusion

Keep the primary conversation path understandable and operable by keyboard and touch, with clear
focus, readable contrast, and reduced motion. Language must remain non-judgmental and must not
exploit distress, loneliness, disability, or emotional activation.
