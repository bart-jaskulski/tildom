# Tildom: Agent Onboarding & Context Guide

Welcome to the Tildom codebase. This document serves as the **immediate entry point and context anchor** for AI coding agents and developer assistants. It surfaces critical architectural, technological, and design rules that you must respect in every code modification, avoiding the need for deep, speculative file discovery.

Refer to the primary documentation files for complete specifications:
- [PROJECT.md](./PROJECT.md) — Architecture, monorepo layout, sync server specifications, and packaging roadmap.
- [README.md](./README.md) — Installation, validation scripts, build, and Docker deployment commands.
- [DESIGN.md](./DESIGN.md) — Visual standards, design tokens (semantic color palette), UI components, and keyboard controls.

---

## 1. Technical Stack & Architecture

- **Core Framework**: [SolidJS](https://www.solidjs.com/) with [Vite](https://vite.dev/) as the build tool.
- **Runtime & Package Manager**: **Node.js 22+** and **pnpm 11.10+**.
- **Data Layer (Local-First)**: Product data is stored locally in the browser using **SQLite + OPFS (Origin Private File System)**. 
  - *Offline is product behavior, not an enhancement.*
  - Local database schemas, contacts, bookmarks, and tasks are owned strictly by each respective application and are not shared directly.
- **Optional Services**: Server APIs (e.g. metadata fetching, optional sync, AI breakdown) are strictly auxiliary. No user data is sent plaintext to server environments unless explicitly demanded by a network-required feature.
- **CORS / Security Headers**: SQLite in-browser via OPFS requires secure headers. Deployments and local dev servers **must** provide:
  - `Cross-Origin-Opener-Policy: same-origin` (COOP)
  - `Cross-Origin-Embedder-Policy: require-corp` (COEP)

---

## 2. Monorepo Structure & Commands

Tildom is managed via a standard **pnpm workspace**.

### Workspace Layout
- `apps/` — Deployable frontend applications.
  - `apps/mark/` — Bookmark & note manager.
  - `apps/do/` — Task manager.
  - `apps/kin/` — Personal relationship manager.
- `services/` — Optional backend services.
  - `services/sync/` — Dumb, encrypted snapshot sync service (`sync.tildom.app`).
- `packages/` — Shared libraries, extracted **only under reuse pressure**.
  - Always consume internal workspace packages using the `"workspace:*"` protocol:
    ```json
    "dependencies": {
      "@tildom/ui": "workspace:*"
    }
  ```

### Development & Verification Commands
Always run these scripts from the **repository root**:
- **Launch Development Servers**:
  - `pnpm dev:mark` — Runs Mark (defaults to `http://localhost:5173`)
  - `pnpm dev:do` — Runs Do
  - `pnpm dev:kin` — Runs Kin
- **Typecheck & Tests**:
  - `pnpm typecheck` / `pnpm typecheck:mark`
  - `pnpm test` / `pnpm test:do`
  - `pnpm build` / `pnpm build:kin`
- **Docker Compose (Deployment)**:
  - `docker compose up --build` — Boots default Mark + sync deployment (`http://localhost:3000`, sync on `http://localhost:8787`)
  - `docker compose --profile apps up --build` — Boots optional applications including Do (`http://localhost:3001`)

---

## 3. Design System & CSS Tokens
Tildom implements a unique **TUI-inspired (Terminal User Interface) aesthetic** that looks structural and blocky like a terminal, but behaves like a highly polished, responsive modern web application.

### Visual Constraints
- **Light Mode Default**: Crisp, high-contrast, paper-like background. Avoid dark mode assumptions unless requested.
- **Typography**: Strict system monospace font stack. **Do not import external font files**.
  ```css
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  ```
- **Corners**: Flat `border-radius: 0px` globally. No rounded corners.
- **Layout Margins**: Maximum line-width of `120ch` for content containers to maintain optimal readability.
- **Layout Lines & Divider Rules**:
  - Do not wrap lists in heavy cards or full boxes.
  - Use **Vertical Guide Rails** (`border-left: 2px solid var(--border-color)`) to group list items or thread components (e.g. comments).
  - Use thin horizontal lines (`1px solid var(--border-color)`) for dividers.

### Design Tokens (CSS Variables)
Use these semantic variables to style interactive components and containers:

| CSS Variable | Purpose | Typical Value (One Light/GitHub Light Theme) |
| :--- | :--- | :--- |
| `--bg-canvas` | Main application background | `#fafafa` (soft off-white) |
| `--bg-surface` | Panels, cards, alternating table rows | `#ffffff` (pure white) |
| `--fg-default` | Core text content, active labels, icons | `#24292e` (near black) |
| `--fg-muted` | Descriptive text, metadata, counts, comments | `#6a737d` (medium gray) |
| `--syntax-keyword`| Highlights, primary actions, links, status | `#d73a49` (muted red/pink) or `#005cc5` (blue) |
| `--syntax-string` | Interactive elements, inputs, form text | `#032f62` (dark blue) |
| `--syntax-comment`| Auxiliary descriptions, syntax hints | `#6a737d` (gray) |
| `--syntax-error` | Validation errors, dangerous/delete buttons | `#d73a49` (red) |
| `--syntax-bg-active`| Selection active states, active tab background | `#e1e4e8` or `#dbedff` (soft gray/blue block) |
| `--border-color` | Layout dividers, tablines, rails | `#e1e4e8` (light gray) |

### Key UI Elements
1. **The Tabline**: Flat, Neovim-style top navigation blocks (e.g. `[ bookmarks.db ] [ settings.json ]`). Responsive horizontally scrolling container on mobile.
2. **The "Block Cursor" Selection**: Selection, hover, or active items use a solid background highlight block (`var(--syntax-bg-active)`) rather than shadows or depth transitions:
   ```
   Unselected:   Link Title
   Selected:    ▒ Link Title ▒
   ```
3. **Form Elements**: Styled to mimic terminal brackets:
   - Checkboxes: Unchecked: `[ ]`, Checked: `[x]`
   - Radio Options: Unselected: `( )`, Selected: `(*)`
4. **Mobile Target Sizing**: Maintain high information density, but ensure all interactive targets (buttons, links, form inputs) are wrapped in at least **`44px`** of touch-hit margin/padding to remain usable on mobile devices.
5. **Keyboard Shortcuts**: Respect Vim normal mode commands (e.g., `j`/`k` to navigate list buffers, `gg`/`G` to jump ends, `/` to focus search, `Esc` to exit insert modes). **Never let keyboard navigation trigger while a user is typing inside an input or textarea element.**

---

## 4. Coding & Maintenance Rules

When building or refactoring code, you must respect these guidelines:
1. **Surgical Scoping**: Keep your edits confined strictly to the app, package, or service that owns the behavior. Do not refactor unrelated files.
2. **No Speculative Abstraction**: Do not extract "common" components or logic across apps until at least *two* real-world use cases prove the abstraction's exact boundary.
3. **Local-First Precedence**: Ensure that SQLite/OPFS browser-side storage works completely offline. Any backend or sync features must degrade gracefully when offline or unconfigured.
4. **Self-Hosting Portability**: Do not couple features to third-party proprietary SaaS. Self-hostability using the root Docker Compose file must remain a first-class feature.
5. **Billing Isolation**: Billing, plans, and licensing restrictions live solely in hosted environment servers (`sync.tildom.app`), not inside local app execution logic.

## 5. Container Image Rules

When changing Dockerfiles, Compose files, or image publishing:

1. **One Deployable, One Image**: Do not build a single omnibus image. Mark and sync publish separately as `ghcr.io/bart-jaskulski/tildom/mark` and `ghcr.io/bart-jaskulski/tildom/sync`.
2. **Small Runtime Images**: Keep Dockerfiles multi-stage. Use pnpm 11, BuildKit cache mounts, `pnpm deploy --prod --legacy`, and a nonroot distroless Node 22 runtime unless a concrete dependency requires a fuller runtime.
3. **Workspace-Aware Builds**: Copy package manifests first for cacheable installs, then copy only the app/service and workspace packages required by that image.
4. **Runtime Storage**: Persist server-side data only for services that own server data. Mark product data is browser-local; sync storage belongs in a Docker volume.
5. **Deployment Separation**: Keep host-specific deployment compose files outside this application repository. This repo publishes images and local development compose only.
