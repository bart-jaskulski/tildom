# Do

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who need a low-friction way to capture and complete tasks, especially neurodivergent users
and anyone who benefits from breaking complex work into manageable steps.

## Product Purpose

Do is a local-first task manager for capturing, structuring, refining, and completing work. It
reduces the effort of turning an unclear or intimidating task into concrete next actions while
keeping ordinary task management available without a network.

## Positioning

Do makes AI assistance an optional task-breakdown capability inside a browser-local task manager,
not the storage layer or prerequisite for using the product. The user's task database remains
canonical even when model access or sync is unavailable.

## Operating Context

Users move between rapid task capture, list navigation, task detail, reordering, and completion on
desktop and mobile browsers. AI breakdown is used when a task needs help becoming actionable.
Settings contain optional sync, pairing, local data controls, and keyboard preferences.

## Capabilities and Constraints

- Store and manage tasks in browser SQLite/OPFS.
- Capture, edit, order, navigate, and complete tasks offline.
- Request AI-assisted task breakdown through the application server when configured and online.
- Optionally synchronize an encrypted local vault and pair devices.
- Keep model credentials server-side and degrade gracefully when network features are unavailable.
- Preserve keyboard-driven workflows without making shortcuts the only path to an action.

## Brand Commitments

Do belongs to the Tildom family and uses a calm, direct voice. It should help users regain clarity
without shaming unfinished work, overstating urgency, or turning implementation status into primary
product content. Visual and interaction commitments are recorded in the root `DESIGN.md`.

## Evidence on Hand

The runnable implementation, tests, and server integration live in `apps/do`. The repository
demonstrates local task persistence, AI integration, and workspace deployment. It contains no
customer testimonials, clinical claims, adoption benchmarks, or outcome studies; future work must
not fabricate them.

## Product Principles

1. **Capture before ceremony:** adding a task should take less effort than holding it in memory.
2. **Make the next step clearer:** structure exists to reduce overwhelm and support action.
3. **Local work survives network loss:** task access and ordinary management remain available.
4. **AI is assistance, not authority:** generated breakdowns remain optional and user-controlled.
5. **Keep the surface focused:** show only what supports the current task decision.

## Accessibility & Inclusion

Support full keyboard navigation, touch targets suitable for mobile use, clear contrast and focus,
minimal motion, and complete access without Vim-style commands. Use neutral, non-judgmental
language around delay, incompletion, and changing plans.
