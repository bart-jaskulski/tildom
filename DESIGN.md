This document defines the visual standards and interactive behaviors for our suite of personal applications. The goal is to establish a unified, highly consistent design language inspired by modern, light-mode terminal interfaces (TUI) and tools like Golang's `bubbletea` or Neovim, while maintaining standard touch-friendly mobile usability.

---

## 1. Core Philosophy

* **Light Mode by Default:** Crisp, high-contrast, paper-like readability inspired by the "One Light" and "GitHub Light" color schemes.
* **Terminal-Inspired structure, Not Terminal-Emulated:** The layout looks structured and blocky like a terminal, but behaves like a modern web application. We use standard HTML input forms instead of rigid command lines.
* **Minimal Visual Taste:** Prefer the fewest visible elements that let the user complete the task. Do not add status panels, sidebars, hints, instructional copy, or metadata just because the system knows it; show those only when they are actionable or required for the current decision.
* **Progressive Enhancement:** Fully accessible on mobile via touch targets. Advanced desktop interactions (such as custom hotkeys or modes) are layered on top as progressive enhancements.
* **Dense but Readable:** High information density without visual clutter. 

---

## 2. Grid & Typography

To maintain a strict layout structure, we align elements to a simulated character-based grid.

### Grid Constraints
* **Max-Width:** Content-heavy containers must not exceed `120ch` (120 characters wide) to preserve optimal reading line-length.
* **Corners:** Strict `border-radius: 0px` across all apps. No rounded corners.
* **Spacing Scale:** Spacing is defined in standardized steps, utilizing `ch` (character width) for horizontal alignment and `rem` or `px` for vertical padding.

### Typography
The entire interface relies strictly on system monospaced fonts. We do not load external font files, keeping performance fast and dependencies minimal.

```css
font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
```

---

## 3. Design Tokens (Semantic Syntax Colors)

Color variables are mapped to syntax-highlighting terms rather than layout descriptions. This makes changing themes straightforward in the future.

| CSS Variable | Purpose | Typical Value (One Light/GitHub Light) |
| :--- | :--- | :--- |
| `--bg-canvas` | Main app background | `#fafafa` (soft off-white) |
| `--bg-surface`| Alternating rows, cards, panels | `#ffffff` (pure white) |
| `--fg-default` | Standard text, body copy, icons | `#24292e` (near black) |
| `--fg-muted` | Metadata, counts, comments | `#6a737d` (medium gray) |
| `--syntax-keyword` | Primary actions, links, status | `#d73a49` (muted red/pink) or `#005cc5` (blue) |
| `--syntax-string` | Interactive elements, input text | `#032f62` (dark blue) |
| `--syntax-comment` | Secondary descriptive text | `#6a737d` (gray) |
| `--syntax-error` | Validation errors, delete buttons | `#d73a49` (red) |
| `--syntax-bg-active`| Focused state, active selection | `#e1e4e8` or `#dbedff` (soft gray/blue block) |
| `--border-color` | Layout lines, structural divides | `#e1e4e8` (light gray) |

---

## 4. Structural Elements & Borders

To prevent layouts from looking claustrophobic, we use subtle layout lines instead of full boxes for every element.

```
┌──────────────────────────────────────────────────┐
│  Tab 1  │  Tab 2  │  Tab 3                       │
├──────────────────────────────────────────────────┤
│                                                  │
│  ❯ Search: [________________]                     │
│                                                  │
│  │ Item Title                                    │
│  │ Secondary info & comments (3)                 │
│  │                                               │
│  │ Active Item Title                             │
│  │ Detailed notes show up here                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Layout Rules
1. **Vertical Guide Rails (`border-left`):** For lists (bookmarks, tasks) and threaded discussions (comments), use a single left border (`border-left: 2px solid var(--border-color)`) instead of enclosing card containers. This visually anchors groups of text.
2. **Dividers:** Horizontal separation is handled with thin `1px solid var(--border-color)` lines.
3. **Double / Bold Borders for Focus:** Inputs or active focus areas switch to a thicker outline or highlight color to clearly guide user attention.
4. **No Decorative Sidebars:** Secondary columns must contain controls or content the user is likely to act on in the current flow. Avoid sidebars that only repeat technical status, shortcuts, or explanatory notes.

---

## 5. UI Components

These interface elements are shared across all current and future apps in the series.

### A. Application Header
* Every app begins with the red `tildom` wordmark, its tabline, and global search.
* Global search is a persistent control on desktop. On narrow mobile viewports, a search button opens the search field within the header without displacing the app identity or tabline.
* Search results may span the app's primary data surfaces, but each result must identify its source and lead directly to the matching item.
* The header uses the canvas background and thin dividers. It is not a floating card and does not cast a shadow.

### B. Navigation (The Tabline)
* **Desktop:** Displayed at the very top as flat, inline blocks mimicking Neovim tabs. Buffer extensions are encouraged (e.g., suffixing `.db`, `.json`, or `.conf`) to reinforce the text-editor look.
* **Mobile:** The exact same top tabline is kept, but configured as a horizontally scrollable container with hidden scrollbars, making it highly swipe-and-tap friendly.

```
[ bookmarks.db ] [ settings.json ]
```

### C. Interactive Form Elements
Forms use traditional HTML controls but styled to fit the TUI aesthetic.

* **Text Inputs / Textareas:** Left-padded, styled with a thin border. Focused inputs display a solid block cursor character (`█`) or vertical line cursor.
* **Checkboxes:** Styled visually to mimic text brackets:
  * Unchecked: `[ ] Task item`
  * Checked: `[x] Task item`
* **Radio Options:** Styled to resemble terminal choices:
  * Unselected: `( ) Option`
  * Selected: `(*) Option`

### D. Active States (The "Block Cursor")
Hover and active selection states do not use subtle shadow shifts. Instead, they leverage the "Block Cursor" effect:
* When an item is selected or hovered, its background switches to a solid block highlight (`var(--syntax-bg-active)`), and the text changes color accordingly to maintain clear contrast.

```
  Normal Row:     Link Name  [3 comments]
  Active Row:    ▒ Link Name  [3 comments] ▒
```

### E. Dialogs
* Confirmations, renaming, pairing, and other focused tasks use the native `<dialog>` element with an explicit heading and actions.
* Do not use browser-native `alert`, `confirm`, or `prompt` dialogs for product interactions.
* Dialogs retain square corners, a restrained width, clear focus treatment, and a visible cancel path.

### F. Mobile Touch Considerations
* While the visual density remains high, the actual interactive hit-boxes (buttons, tabs, list item links) must have vertical padding ensuring a minimum hit-target of **`44px`** to maintain mobile usability.

### G. Keyboard Shortcuts (Vim Normal Mode)
Apps may offer normal-mode navigation as a user setting for rapid keyboard-centric workflow. The setting must be visible in the app's configuration surface, and all functionality must remain available without it. Normal mode binds are inactive when typing in active inputs or textareas.
* **Navigation & Selections:** `j` / `k` (move active selection up/down), `gg` / `G` (jump to top/bottom).
* **Viewport Scrolling:** Jumping or navigating to an item must scroll and center the row (`block: "center"`) smoothly into view.
* **Tabs & History:** `gt` / `gT` (cycle buffers forward/backward), `h` / `l` (navigate browser history back/forth).
* **Buffer Actions:** `e` or `Enter` (open detail inspector buffer), `o` or `gx` (open external canonical URL in a new tab), `d` (trigger item delete).
* **Insert Modes:** `/` (focus and clear search input), `i` (focus entry textarea), `p` (focus and paste clipboard).
* **Write/Save:** `:w` (saves/submits note from Normal Mode if not typing).
* **Escape:** `Esc` exits insert mode (blurs active input). If in normal mode on a detail page, returns to list buffer `/`.

---

## 6. Layout Archetypes (App Structure)

Most apps in this suite share three main layout structures:

1. **The Entry List View (e.g., Bookmarks list, Tasks list):**
   * Top input/textarea for quick entry or search.
   * A vertical list of items utilizing left-side vertical guide rails.
   * A line-numbering gutter to the left of the guide rail (`2ch` margin-left offset for the entry container).
   * Action icons or count indicators aligned to the right.
2. **The Detail View (e.g., Bookmark comments, Task description):**
   * Clear title header at the top.
   * The core item metadata (root URL, date added) in a smaller, muted font (`var(--fg-muted)`).
   * Sequential feed of sub-items (such as notes/comments) grouped with vertical guide rails.
3. **The Settings/Configuration Panel:**
   * A clean list of options using key-value terminal formatting.
   * Simple inputs and toggle switches using brackets `[x]` / `[ ]` for checkboxes.
   * Vim keybindings, when supported, are exposed as an explicit option rather than assumed.
   * Sync status and device pairing live here when an app supports remote sync.
4. **The Conversation View (e.g., Hey):**
   * A chat list and transcript may use a split layout on desktop and a single focused surface on mobile.
   * Messages use vertical guide rails and open whitespace rather than bubbles or enclosing cards.
   * A small, consistent role color may distinguish participants when it improves scanning. Keep color localized to role labels and guide rails; the rest of the surface uses shared semantic tokens.
   * Routine system activity, internal context attribution, and implementation detail stay out of the transcript. Put inspectable supporting information in a dedicated surface.
