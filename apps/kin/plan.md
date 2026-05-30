## Technical Stack Overview
* **Frontend:** SolidJS, Vite, CSS variables mapped to terminal-inspired tokens.
* **Database:** SQLite running in-browser via WebAssembly, utilizing the Origin Private File System (OPFS) for persistent, high-performance local storage.
* **Service Worker:** Standard Vite PWA plugin for asset caching and offline availability.

---

### Phase 1: Database Setup & OPFS Integration

To run SQLite in the browser with persistence, we utilize OPFS. A key development hurdle is that OPFS requires strict browser security headers.

#### 1. Vite & Dev Server Configuration
Configure Vite to emit the necessary headers in development:
* `Cross-Origin-Opener-Policy: same-origin`
* `Cross-Origin-Embedder-Policy: require-corp`
*(Without these, the browser will block access to the multi-threaded SQLite WASM engine.)*

#### 2. Database Initialization Flow
On app load:
1. Locate or create the database file (e.g., `kin.sqlite`) inside the Origin Private File System.
2. Run a `PRAGMA user_version` check.
3. If the version is `0`, execute the initial DDL schema (Tables: `contacts`, `relationships`, `notes`) and set `user_version = 1`.
4. If a schema change is introduced in a future version of the app, check this version number and run programmatic migration queries.

#### 3. Database Schema (SQL)
The schema contains three lightweight tables:
* `contacts`: Holds name, optional location, parsed birthday, phone, and email.
* `relationships`: Holds `contact_id_a`, `contact_id_b`, and `role`. A unique index on `(contact_id_a, contact_id_b)` prevents duplicate entries.
* `notes`: Holds the actual text content, a `tags` search column, and an `is_pinned` integer flag.

---

### Phase 2: Core Business Logic & State

To keep SolidJS snappy, database operations can run inside a Web Worker. The main thread sends requests and receives results, preventing UI stuttering during heavy queries.

#### 1. Signal & State Architecture
Manage active state at the top level of your SolidJS app:
* `currentTab`: `'people' | 'settings'`
* `selectedContactId`: `string | null`
* `searchQuery`: `string` (used to filter the contacts list)

#### 2. Tag Parsing Pipeline
When writing or editing a note:
1. Run a regex search in JS to capture words starting with `#`.
2. Convert all captured tags to lowercase and remove duplicates.
3. Construct a space-padded string formatted as ` tag1 tag2 ` (including leading and trailing spaces).
4. Save this string to the `tags` column in the database.

#### 3. Symmetrical Relationship Resolver
When querying the relationships for a specific contact:
1. Query rows in the `relationships` table where `contact_id_a` matches the current contact *or* `contact_id_b` matches.
2. In the UI translation layer, map asymmetric roles. If Alice is `contact_id_b` and the row records Bob as the `parent` of Alice (`contact_id_a`), the UI maps Bob's relationship text to `Child` on Alice's page.

---

### Phase 3: Component Structure & UI Flow

We map these visual guidelines strictly to standard HTML components styled with System Monospace typography and layout lines rather than complete border boxes [design.md].

#### 1. High-Level Navigation: The Tabline
* A sticky horizontal block at the top containing `[ 1: People ]` and `[ 2: Settings ]`.
* Tapping a tab updates the `currentTab` signal.

#### 2. View 1: People Directory (Main Tab)
* **Search Bar:** A standard input box with a custom border and a solid block focus state.
* **Inline Add Contact Form:**
  * Displays a simple `[+] Add Person` text action at the bottom of the list.
  * Clicking it expands an inline single-field text input: `❯ Name: [___________]`. 
  * Pressing Enter triggers database insert with only the name filled in, closing the drawer and allowing further editing in the details view.
* **Contacts List:**
  * Renders a list of contacts filtering matches from the `searchQuery` signal.
  * If the search query starts with `#`, the SQL query shifts to search matches in the `tags` column of the `notes` table instead of names.
  * Clicking a contact sets the `selectedContactId` signal, which triggers the detail view slide-in.

#### 3. View 2: Contact Details (Slide-in Detail View)
* **Header / Metadata Panel:**
  * Displays the name, location, and contact information.
  * Displays relationships mapped bidirectionally.
  * Edit button: Switches metadata text into standard TUI-styled input fields for quick corrections (e.g. updating location or adding a birthday).
* **The Single Unified Feed:**
  * Uses a single query pulling notes ordered by `is_pinned DESC, created_at DESC`.
  * Renders each note item sequentially, showing its date and content.
  * Items with `is_pinned = 1` are highlighted with a distinct background block cursor state or a prefixed `[PIN]` tag.
  * Note texts are parsed to wrap inline `#tags` in styled spans conforming to `--syntax-keyword`.
* **Add Note Form:**
  * A text area block with a checkbox labeled `[ ] Pin to top`.
  * On submit, triggers the tag parsing script, saves to database, and clears the input, refetching the feed reactively.

#### 4. View 3: Settings Tab
* Renders a flat, terminal-inspired list of key-value parameters.
* **Free Export/Import Block:**
  * *Export:* Reads the binary SQLite file out of OPFS using the Web File System API, wrapping it in a downloadable Blob file.
  * *Import:* A traditional file uploader component. When a `.sqlite` file is selected, it overwrites the existing OPFS file and reloads the page.
* **Sync Block:** Placeholder triggers for paid cloud-sync endpoints (integrated as tildom hooks).

---

### Phase 4: Styling & UX Details

To adhere strictly to your `DESIGN.md` document, ensure the CSS classes implement these exact constraints:

* **No Rounded Corners:** Set `border-radius: 0px` globally.
* **High Contrast:** Canvas uses `--bg-canvas` (`#fafafa`), interactive items use `--syntax-string` or `--syntax-keyword`.
* **Hit-Targets:** Keep touch heights for list items and edit tabs at a minimum of `44px` on mobile, even though standard text scale remains dense.
* **Left Guide Rails:** The list of timeline entries in the detail view should not use nested card borders. Apply a clean `border-left: 2px solid var(--border-color)` to visually anchor the stream.

---

### Phase 5: Sequential Development Order (The Roadmap)

1. **Vite Template Setup:** Configure SolidJS, the CSS variables, and the PWA manifest in Vite. Set server headers for OPFS development.
2. **SQLite Worker Shell:** Write the helper scripts to connect SolidJS to the SQLite WASM library inside the browser worker thread.
3. **Database Migration Logic:** Create the initial tables and test persistence across page refreshes.
4. **Basic Directory UI:** Build the main search bar, list renderer, and inline "Quick Add" contact form.
5. **Feed & Note Taking:** Implement the single feed logic on the detail view. Integrate the client-side tag parsing and pinning logic.
6. **Relationships Hook:** Build the bidirectional schema queries and render links between contacts.
7. **Export & Import Tools:** Implement raw file export from OPFS to a local storage file for backup. Ensure data restores without corrupting active memory.
