This document defines the visual standards and interactive behaviors for our suite of personal applications. The goal is to establish a unified, highly consistent design language inspired by modern, light-mode terminal interfaces (TUI) and tools like Golang's `bubbletea` or Neovim, while maintaining standard touch-friendly mobile usability.

---

## 1. Core Philosophy

* **Light Mode by Default:** Crisp, high-contrast, paper-like readability inspired by the "One Light" and "GitHub Light" color schemes.
* **Text-Tool-Informed, Not Terminal-Emulated:** Borrow monospace typography, concise labels, syntax color, and disciplined alignment. Do not recreate editor chrome: decorative command prompts, mode/status lines, window frames, or terminal output are not general-purpose page furniture.
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

---

## 5. UI Components

These interface elements are shared across all current and future apps in the series.

### A. Navigation (The Tabline)
* **Desktop:** Displayed at the top as quiet inline labels on one continuous header canvas. Show the active destination with weight and a thin bottom rule, not a filled tab block. Brackets and file-like suffixes are optional naming details, not a requirement for every surface.
* **Mobile:** The exact same top tabline is kept, but configured as a horizontally scrollable container with hidden scrollbars, making it highly swipe-and-tap friendly.

```
[ bookmarks.db ] [ settings.json ]
```

### B. Interactive Form Elements
Forms use traditional HTML controls but styled to fit the TUI aesthetic.

* **Text Inputs / Textareas:** Left-padded, styled with a thin border. Focused inputs display a solid block cursor character (`█`) or vertical line cursor.
* **Checkboxes:** Styled visually to mimic text brackets:
  * Unchecked: `[ ] Task item`
  * Checked: `[x] Task item`
* **Radio Options:** Styled to resemble terminal choices:
  * Unselected: `( ) Option`
  * Selected: `(*) Option`

### C. Active States (The "Block Cursor")
Hover and active selection states do not use subtle shadow shifts. Instead, they leverage the "Block Cursor" effect:
* When an item is selected or hovered, its background switches to a solid block highlight (`var(--syntax-bg-active)`), and the text changes color accordingly to maintain clear contrast.

```
  Normal Row:     Link Name  [3 comments]
  Active Row:    ▒ Link Name  [3 comments] ▒
```

### D. Mobile Touch Considerations
* While the visual density remains high, the actual interactive hit-boxes (buttons, tabs, list item links) must have vertical padding ensuring a minimum hit-target of **`44px`** to maintain mobile usability.

### E. Keyboard Shortcuts (Vim Normal Mode)
For desktop viewports, normal-mode navigation provides rapid keyboard-centric workflow. Normal mode binds are inactive when typing in active inputs or textareas.
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
