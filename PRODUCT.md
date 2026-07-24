# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Privacy-conscious individuals who want focused personal tools for organizing information, work,
relationships, and conversations. They value local ownership, offline access, keyboard speed,
high information density, and interfaces that remain practical on touch devices.

## Product Purpose

Tildom is a family of personal web applications: Mark for saved reading and notes, Do for tasks,
Kin for relationships, and Hey for conversations with durable memory. Success means each app is
useful on its own, keeps its canonical product data under the user's control, and remains available
offline wherever the feature itself does not require a network.

## Positioning

Tildom combines browser-local SQLite applications with independent deployment and explicit network
boundaries. Optional services extend local products with encrypted sync or network-required
features; they do not silently become the owner of the user's data or turn the suite into a
mandatory hosted platform.

## Operating Context

People use the apps on desktop and mobile browsers, often moving between quick capture, search,
focused review, and detailed editing. The suite supports keyboard-driven use while keeping core
actions accessible without memorized commands. It can be run from Tildom's hosted deployments or
self-hosted as separate applications and services.

## Capabilities and Constraints

- Mark saves bookmarks, notes, discussions, and offline reading captures.
- Do captures, structures, and completes tasks, with optional AI-assisted breakdown.
- Kin stores people, profile details, notes, and relationships.
- Hey stores conversations and inspectable memory, with network-required model responses.
- Product data is canonical in browser SQLite/OPFS. Offline-capable behavior must not depend on a
  configured server.
- Sync is optional and encrypts snapshots in the browser before upload.
- Network-required features must identify that boundary and preserve access to local data when
  unavailable.
- Each app owns its domain schema and behavior and remains independently deployable.
- Shared code is extracted only after real reuse establishes a stable boundary.

## Brand Commitments

The product family is named Tildom, with short application names Mark, Do, Kin, and Hey. Its voice
is calm, direct, personal without being intrusive, and free of unnecessary urgency. The established
identity and interaction language are recorded in `DESIGN.md`.

## Evidence on Hand

Runnable implementations exist in `apps/mark`, `apps/do`, `apps/kin`, and `apps/hey`. Architecture,
privacy boundaries, deployment direction, and self-hosting commitments are documented in
`PROJECT.md`, `README.md`, and the application documentation. The repository contains no customer
testimonials, adoption benchmarks, case studies, press claims, or pricing evidence; future work
must not fabricate them.

## Product Principles

1. **Local data has primacy:** local access and ownership are product behavior, not fallback modes.
2. **Network boundaries stay explicit:** remote computation and sync are optional, legible
   extensions.
3. **Each tool stays focused:** application domains and deployables remain independent.
4. **Fast without exclusion:** keyboard efficiency complements, rather than replaces, accessible
   touch and standard controls.
5. **Quiet by default:** surface information when it supports the user's current decision.

## Accessibility & Inclusion

Core actions must support keyboard and touch use, clear focus and semantic structure, readable
contrast, and reduced motion. Essential functionality cannot require memorized keyboard commands.
Product language must avoid shame, judgment, manipulation, and unnecessary urgency.
