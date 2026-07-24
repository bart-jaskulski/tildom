# Kin

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who want a private, lightweight way to remember personal details, shared history, and the
relationships between people in their lives without placing that information in a conventional
cloud contact platform.

## Product Purpose

Kin is a local-first personal relationship manager. It keeps people, contact details, notes, and
explicit relationships in a searchable browser-local directory so the user can preserve context
about the people they know.

## Positioning

Kin organizes relationship context—not just address-book fields—in a local SQLite database owned
by the user. Notes and links between people travel with the same portable vault, while remote sync
remains encrypted and optional.

## Operating Context

Users add people, search profile details and notes, review a person's timeline, record new context,
and connect related people. They use the directory on phone and desktop browsers. Local backup and
import support portability; optional encrypted sync and device pairing extend access across
devices.

## Capabilities and Constraints

- Store names, relationship labels, location, birthday, phone, and email in browser SQLite/OPFS.
- Add searchable, taggable, pinnable notes to a person's timeline.
- Represent direct relationships between people and resolve known inverse relationship labels.
- Search across people, profile fields, and note content.
- Export and import the local database and optionally synchronize an encrypted vault.
- Keep relationship data locally accessible when offline or when sync is unconfigured.

## Brand Commitments

Kin belongs to the Tildom family and uses calm, factual language. It should support remembering
people without scoring relationships, manufacturing urgency, or framing human connection as a
sales pipeline. Visual and interaction commitments are recorded in the root `DESIGN.md`.

## Evidence on Hand

The runnable implementation, schema, contact store, sync integration, and tests live in
`apps/kin`. `apps/kin/README.md` documents browser-local relationship data and backup/import. The
repository contains no customer testimonials, relationship-outcome claims, adoption benchmarks,
or evidence for automated reminders; future work must not fabricate them.

## Product Principles

1. **People are not leads:** relationship context must not become pipeline scoring or engagement
   pressure.
2. **Private by construction:** sensitive personal details remain browser-local by default.
3. **Context compounds:** notes and relationships should reduce repeated remembering effort.
4. **Portable, not captive:** backup, import, and optional encrypted sync preserve user control.
5. **Quietly useful:** surface stored context when it helps the current interaction.

## Accessibility & Inclusion

Support keyboard and touch operation, clear focus and contrast, readable text, and reduced motion.
Relationship labels must allow user-defined language and avoid assuming family structure, gender,
romantic status, or cultural norms.
