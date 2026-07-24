# Mark

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who save articles, links, notes, and online discussions for later use. They value fast
capture and search, readable text, offline access, and ownership of a personal reference library.

## Product Purpose

Mark is a local-first bookmark, note, discussion, and reading manager. It preserves useful web
material in a browser-local library so people can find, read, and annotate it later, including when
offline content has been captured.

## Positioning

Mark treats the local SQLite library—not a hosted account—as the product's source of truth. It
combines bookmarks, captured reading content, notes, and discussions in one portable data path,
with server features and encrypted sync remaining optional.

## Operating Context

Users quickly save URLs, search or browse their library, open a saved item's details, read captured
content, and add notes or comments. They use both phones and desktop browsers. Metadata fetching
requires a network; saved local records and captures remain available without one.

## Capabilities and Constraints

- Save, search, edit, and delete bookmarks in browser SQLite/OPFS.
- Store notes, discussions, and offline HTML captures with saved items.
- Fetch network metadata when available without making it a prerequisite for local use.
- Export, import, and optionally synchronize an encrypted local vault.
- Keep local product data accessible when sync or auxiliary services are unavailable.
- Maintain readable content presentation and efficient keyboard and touch interaction.

## Brand Commitments

Mark belongs to the Tildom family and uses concise, direct language that prioritizes saved content
over product chrome. Visual and interaction commitments are recorded in the root `DESIGN.md`.

## Evidence on Hand

The runnable client, server integration, tests, and reading functionality live in `apps/mark`.
Architecture and deployment evidence is documented in the root project files. The repository
contains no customer testimonials, adoption benchmarks, publisher partnerships, or reading-outcome
claims; future work must not fabricate them.

## Product Principles

1. **The library remains yours:** saved material stays locally accessible and portable.
2. **Capture quickly, recover reliably:** saving and later finding an item are equally important.
3. **Reading outranks chrome:** content and annotations receive the user's attention.
4. **Network enrichment stays optional:** metadata and sync extend rather than gate the library.
5. **Dense can still be readable:** speed and information density must preserve comprehension.

## Accessibility & Inclusion

Support semantic reading structure, clear focus and contrast, keyboard navigation, mobile touch
targets, and reduced motion. All essential actions must remain available without memorized
shortcuts.
