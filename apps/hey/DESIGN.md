# Hey Design

Hey extends the established Tildom product interface. Root `DESIGN.md` and `@tildom/ui` remain the
visual authority; this file records only Hey-specific composition and interaction decisions.

## Suite Shell

- Use the current suite header: red `tildom` wordmark, flat bracketed navigation, and top-right
  global search.
- Buffers are `[ chats.db ]`, `[ memory/ ]`, and `[ settings.json ]`.
- Global search covers conversation titles and memory content. On mobile it uses the suite's
  48px search-toggle row behavior.
- The app canvas is `--bg-canvas`; `--bg-surface` is reserved for controls and bounded working
  areas rather than used as a full-page white panel.
- Do not add a Neovim-style statusline. Vim support is an optional preference, not a persistent
  mode display.

## Conversation

- Desktop uses a compact conversation ledger beside a transcript capped near 74ch.
- Mobile uses route-like list and transcript screens rather than a squeezed two-column layout.
- Messages are transcript blocks, never rounded chat bubbles.
- User messages use `--highlight-blue` for the role label and guide rail.
- Hey messages use `--syntax-keyword` for the role label and guide rail.
- These two transcript accents are the only intentionally paired high-chroma treatment.
- The composer is anchored below the transcript and preserves drafts per conversation.
- Do not show context attribution, retrieval steps, tool calls, or automatic memory-write events
  in the ordinary transcript.

## Memory

- Memory is a small, user-readable virtual filesystem rather than a database inspector or IDE.
- Search and direct file editing are first-class.
- The memory surface shows current state only; it does not keep or expose revision history.
- Paths and Markdown provide structure; raw internal records, hashes, and extraction jobs stay
  hidden.

## Settings and Protected Actions

- Follow neighboring Mark/Kin settings: thin section rules, muted 11px section labels, bracket
  checkboxes, restrained descriptions, and standard square buttons.
- Include tone, response length, custom instructions, memory behavior, optional Vim keys, encrypted
  sync status, and device pairing.
- Rename, delete, pairing, and destructive data actions use the native `<dialog>` element styled in
  the Tildom vocabulary. Do not use browser `prompt()` or `confirm()`.

## Responsive and Accessibility

- Interactive targets remain at least 44px; the suite header remains 48px per row.
- Dialogs trap focus natively and retain explicit labels, cancel actions, and destructive wording.
- Motion is limited to state transitions such as search expansion, buffer switching, streaming,
  and toast feedback, with reduced-motion support.
- Keyboard navigation never fires while the user is typing. The HTML prototype exposes the Vim
  preference without implementing the final shortcut system.
