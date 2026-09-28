import { For, Show, createSignal } from "solid-js";
import AppIcon, { type AppIconName } from "../AppIcon";
import Button, { type ButtonVariant } from "../components/Button";
import Badge from "../components/Badge";
import EmptyState from "../components/EmptyState";
import Input from "../components/Input";
import Textarea from "../components/Textarea";
import Checkbox from "../components/Checkbox";
import RadioButton from "../components/RadioButton";
import StatusBanner from "../components/StatusBanner";
import Search from "../components/Search";
import LoadingSkeleton from "../components/LoadingSkeleton";
import KeybindHelp from "../components/KeybindHelp";
import Tabline from "../components/Tabline";
import Dialog from "../components/Dialog";
import ConfirmDialog from "../components/ConfirmDialog";
import Popover from "../components/Popover";
import { showVimHelp } from "../keyboard";
import { VimNavigationProvider, useVimKeymaps } from "../VimNavigationProvider";
import styles from "./Showcase.module.css";

export interface ShowcaseProps {
  currentApp?: string; // e.g. "mark", "kin", "home"
  returnHref?: string;
  showReturnBar?: boolean;
}

const packageSnippet = `import "@tildom/ui/base.css";
import { Button, Input } from "@tildom/ui";

export function SearchForm() {
  return (
    <form role="search">
      <label>Search saved links <Input name="q" type="search" /></label>
      <Button type="submit">Search</Button>
    </form>
  );
}`;

function ShowcaseContent(props: ShowcaseProps) {
  const currentApp = () => (props.currentApp as AppIconName) ?? "mark";
  const [searchQuery, setSearchQuery] = createSignal("local");
  const mockSearchItems = [
    { id: "1", title: "Local-first software architecture guide", tag: "architecture" },
    { id: "2", title: "How I Design with AI - anti-slop principles", tag: "design" },
    { id: "3", title: "Bart Jaskulski (Kin Contact)", tag: "colleague" },
    { id: "4", title: "SQLite with OPFS in browser applications", tag: "sqlite" },
  ];
  const filteredSearchItems = () => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return mockSearchItems;
    return mockSearchItems.filter(
      (item) => item.title.toLowerCase().includes(q) || item.tag.toLowerCase().includes(q)
    );
  };

  // Interactive Button Playground state
  const [btnLabel, setBtnLabel] = createSignal("Save changes");
  const [btnVariant, setBtnVariant] = createSignal<ButtonVariant>("default");
  const [btnBracket, setBtnBracket] = createSignal(false);
  const [btnDisabled, setBtnDisabled] = createSignal(false);
  const [copyCodeStatus, setCopyCodeStatus] = createSignal<string | null>(null);

  // Form controls state
  const [checkboxState, setCheckboxState] = createSignal(true);
  const [radioState, setRadioState] = createSignal("option-a");


  // Skeleton state
  const [skeletonLines, setSkeletonLines] = createSignal(3);

  // Active list item state
  const [activeRow, setActiveRow] = createSignal<number>(1);

  // Dialog & Popover state
  const [showConfirm, setShowConfirm] = createSignal(false);
  const [confirmNotice, setConfirmNotice] = createSignal<string | null>(null);
  const [showModal, setShowModal] = createSignal(false);
  const [modalInputVal, setModalInputVal] = createSignal("");
  const [aiSnippetCopied, setAiSnippetCopied] = createSignal(false);
  const [demoNotice, setDemoNotice] = createSignal<string | null>(null);
  const [badgeNotice, setBadgeNotice] = createSignal<string | null>(null);

  // Register demo Vim keymaps on showcase page
  useVimKeymaps([
    { lhs: "?", callback: () => showVimHelp(), help: "show this keyboard shortcuts panel" },
    { lhs: "j", callback: () => setActiveRow((prev) => (prev < 2 ? prev + 1 : 0)), help: "select next row" },
    { lhs: "k", callback: () => setActiveRow((prev) => (prev > 0 ? prev - 1 : 2)), help: "select previous row" },
  ]);

  const colorTokens = [
    { token: "--bg-canvas", hex: "#fafafa", role: "Main canvas background" },
    { token: "--bg-surface", hex: "#ffffff", role: "Panels, inputs, active cards" },
    { token: "--fg-default", hex: "#24292e", role: "Primary monospace text & icons" },
    { token: "--fg-muted", hex: "#6a737d", role: "Secondary metadata & comments" },
    { token: "--syntax-keyword", hex: "#d73a49", role: "Actions, status, brand red" },
    { token: "--syntax-string", hex: "#032f62", role: "Key headings, input text" },
    { token: "--syntax-comment", hex: "#6a737d", role: "Tags, syntax hints" },
    { token: "--syntax-error", hex: "#d73a49", role: "Errors & danger actions" },
    { token: "--syntax-bg-active", hex: "#dbedff", role: "Block cursor & active selection" },
    { token: "--border-color", hex: "#e1e4e8", role: "Layout lines & rails" },
    { token: "--border-focus", hex: "#24292e", role: "Keyboard focus outline" },
    { token: "--highlight-blue", hex: "#005cc5", role: "Links and blue highlights" },
    { token: "--highlight-green", hex: "#22863a", role: "Green highlights" },
    { token: "--highlight-orange", hex: "#e36209", role: "Orange highlights" },
  ];

  const appIcons: AppIconName[] = ["mark", "kin", "do", "hey", "home"];

  // Generate live JSX snippet for button playground
  const generatedButtonCode = () => {
    const propsList: string[] = [];
    if (btnVariant() !== "default") propsList.push(`variant="${btnVariant()}"`);
    if (btnBracket()) propsList.push("bracket");
    if (btnDisabled()) propsList.push("disabled");
    const propsStr = propsList.length > 0 ? ` ${propsList.join(" ")}` : "";
    return `<Button${propsStr}>{${JSON.stringify(btnLabel())}}</Button>`;
  };

  const copyButtonCode = () => {
    void navigator.clipboard.writeText(generatedButtonCode());
    setCopyCodeStatus("copied!");
    setTimeout(() => setCopyCodeStatus(null), 2000);
  };

  const copyAiCheatsheet = () => {
    void navigator.clipboard.writeText(packageSnippet);
    setAiSnippetCopied(true);
    setTimeout(() => setAiSnippetCopied(false), 2000);
  };

  return (
    <div class={styles.showcase}>
      {/* Return header (only when standalone) */}
      <Show when={props.showReturnBar}>
        <div class={styles.returnBar}>
          <a href={props.returnHref ?? "/"} class={styles.returnLink}>
            ← return to {currentApp()}.tildom
          </a>
          <span class={styles.devBadge}>dev / showcase</span>
        </div>
      </Show>

      {/* Sticky Category Jump Navigation */}
      <nav class={styles.jumpNav} aria-label="Showcase Sections">
        <a href="#sec-foundations" class={styles.jumpLink}>Foundations</a>
        <a href="#sec-primitives" class={styles.jumpLink}>Controls</a>
        <a href="#sec-feedback" class={styles.jumpLink}>Feedback</a>
        <a href="#sec-patterns" class={styles.jumpLink}>Patterns</a>
        <a href="#sec-overlays" class={styles.jumpLink}>Overlays</a>
        <a href="#sec-guidelines" class={styles.jumpLink}>Guidelines</a>
        <a href="#sec-agent" class={styles.jumpLink}>Using the package</a>
      </nav>

      <main class={styles.shell}>
        {/* Intro */}
        <section class={styles.intro}>
          <h1 class={styles.introTitle}>Tildom UI showcase</h1>
          <p class={styles.introSubtitle}>
            Shared components, visual rules, and example patterns for Tildom apps. Use the live examples to inspect behavior; use the notes to decide what belongs in an app.
          </p>
        </section>

        {/* 1. Foundations & Tokens */}
        <section id="sec-foundations" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Foundations</h2>
            <span class={styles.sectionDesc}>Colors and rules from <code>base.css</code> and <code>DESIGN.md</code></span>
          </div>

          <div class={styles.grid}>
            {/* Color Swatches */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Semantic Color Palette (One Light / GitHub Light):</p>
              <div class={styles.swatchGrid}>
                <For each={colorTokens}>
                  {(color) => (
                    <div class={styles.swatchCard}>
                      <div class={styles.swatchColor} style={{ background: `var(${color.token}, ${color.hex})` }} />
                      <span class={styles.swatchToken}>{color.token}</span>
                      <span class={styles.swatchValue}>{color.hex}</span>
                      <span class={styles.swatchRole}>{color.role}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Geometry Rules */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Text-Tool Geometry & Invariants:</p>
              <div class={styles.formGrid}>
                <p class={styles.sectionDesc}>
                  • <strong>0px Corners:</strong> <code>border-radius: 0px</code> enforced globally. No rounded corners or pill shapes.<br />
                  • <strong>Vertical Guide Rails:</strong> Lists and callout containers use <code>border-left: 2px solid var(--border-color)</code>.<br />
                  • <strong>Dividers:</strong> Subtle horizontal rules use <code>1px solid var(--border-color)</code>.<br />
                  • <strong>Max Reading Width:</strong> Dense working content constrained to <code>120ch</code> soft maximum.<br />
                  • <strong>Mobile Touch Targets:</strong> Give touch actions at least <code>44px</code> of hit area.
                </p>
              </div>
            </div>

            {/* Icon Family */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Suite Icon Family (64x64 Block Glyphs):</p>
              <div class={styles.iconGallery}>
                <For each={appIcons}>
                  {(name) => (
                    <div class={styles.iconCard}>
                      <AppIcon app={name} style={{ width: "40px", height: "40px" }} />
                      <span class={styles.iconLabel}>{name}.tildom</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Primitives & Form Controls */}
        <section id="sec-primitives" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Controls and inputs</h2>
            <span class={styles.sectionDesc}>Exported components for actions and forms</span>
          </div>

          <div class={styles.grid}>
            {/* Interactive Button Workbench */}
            <div class={styles.workbench}>
              <div class={styles.workbenchPreview}>
                <Button
                  variant={btnVariant()}
                  bracket={btnBracket()}
                  disabled={btnDisabled()}
                  onClick={() => setDemoNotice("Button action triggered in the showcase.")}
                >
                  {btnLabel()}
                </Button>
              </div>

              <div class={styles.workbenchControls}>
                <div class={styles.controlGroup} role="group" aria-label="Button variant">
                  <span class={styles.controlLabel}>Variant:</span>
                  {(["default", "text", "danger"] as ButtonVariant[]).map((v) => (
                    <Button
                      variant={btnVariant() === v ? "default" : "text"}
                      aria-pressed={btnVariant() === v}
                      onClick={() => setBtnVariant(v)}
                    >
                      {v}
                    </Button>
                  ))}
                </div>

                <div class={styles.controlGroup}>
                  <Checkbox
                    checked={btnBracket()}
                    onChange={setBtnBracket}
                    label="bracket"
                  />
                  <Checkbox
                    checked={btnDisabled()}
                    onChange={setBtnDisabled}
                    label="disabled"
                  />
                </div>

                <label class={styles.controlGroup}>
                  <span class={styles.controlLabel}>Label:</span>
                  <Input
                    value={btnLabel()}
                    onInput={(e) => setBtnLabel(e.currentTarget.value)}
                    style={{ "max-width": "18ch" }}
                  />
                </label>
              </div>

              <div class={styles.codeBar}>
                <code class={styles.codeText}>{generatedButtonCode()}</code>
                <button type="button" class={styles.copyBtn} onClick={copyButtonCode}>
                  {copyCodeStatus() ?? "[ copy jsx ]"}
                </button>
              </div>
              <p class={styles.usageNote}>Use <code>Button</code> for actions. Choose <code>default</code>, <code>text</code>, or <code>danger</code>; use <code>bracket</code> only when the label needs brackets.</p>
              <Show when={demoNotice()}><p class={styles.usageNote} role="status">{demoNotice()}</p></Show>
            </div>

            {/* Badges & Monospace Tags */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Monospace Badges & Chips (<code>&lt;Badge /&gt;</code>):</p>
              <div class={styles.componentRow}>
                <Badge variant="bracket">colleague</Badge>
                <Badge variant="tag" href="#sec-primitives">design</Badge>
                <Badge variant="tag" href="#sec-primitives">architecture</Badge>
                <Badge variant="subtle">Due: tomorrow</Badge>
                <Badge variant="active" onClick={() => setBadgeNotice("Badge action triggered in the showcase.")}>dev / showcase</Badge>
                <Badge variant="keyword">CRITICAL</Badge>
              </div>
              <p class={styles.sectionDesc}>
                Use <code>Badge</code> for compact metadata. Add <code>href</code> or <code>onClick</code> only when the label performs an action.
              </p>
              <Show when={badgeNotice()}><p class={styles.usageNote} role="status">{badgeNotice()}</p></Show>
            </div>

            {/* Inputs & Auto-resizing Textareas */}
            <div class={`${styles.grid} ${styles.twoCol}`}>
              <div class={styles.componentBox}>
                <p class={styles.componentBoxLabel}>Inputs & Textarea:</p>
                <div class={styles.formGrid}>
                  <label class={styles.formLabel}>
                    Single-line Monospace Input:
                    <Input placeholder="Enter URL or contact name..." value="https://tildom.app" />
                  </label>
                  <label class={styles.formLabel}>
                    Auto-resizing Textarea (type to test expansion):
                    <Textarea
                      autoResize
                      rows={2}
                      placeholder="Write a note... expands automatically as lines are typed"
                      value={"Local-first note line 1\nNote line 2"}
                    />
                  </label>
                </div>
                <p class={styles.usageNote}>Use <code>Input</code> for one line and <code>Textarea autoResize</code> for longer text. Keep visible labels in the form; placeholders are examples.</p>
              </div>

              {/* Checkboxes & Radios */}
              <div class={styles.componentBox}>
                <p class={styles.componentBoxLabel}>Terminal Brackets Selection:</p>
                <div class={styles.formGrid}>
                  <Checkbox
                    checked={checkboxState()}
                    onChange={setCheckboxState}
                    label="Enable local OPFS vault"
                  />
                  <Checkbox
                    checked={false}
                    disabled
                    onChange={() => {}}
                    label="Disabled feature [ ]"
                  />

                  <p class={styles.componentBoxLabel} style={{ "margin-top": "0.75rem" }}>Radio Group:</p>
                  <RadioButton
                    name="storage-option"
                    checked={radioState() === "option-a"}
                    onChange={() => setRadioState("option-a")}
                    label="Option A: In-memory browser SQLite"
                  />
                  <RadioButton
                    name="storage-option"
                    checked={radioState() === "option-b"}
                    onChange={() => setRadioState("option-b")}
                    label="Option B: Encrypted snapshot sync"
                  />
                </div>
                <p class={styles.usageNote}>Use <code>Checkbox</code> for independent choices. Give related <code>RadioButton</code> options the same native <code>name</code> in real forms.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Feedback & States */}
        <section id="sec-feedback" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Feedback and content states</h2>
            <span class={styles.sectionDesc}>Status, errors, loading, search matches, and empty results</span>
          </div>

          <div class={styles.grid}>
            {/* Status Banners */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>StatusBanner (Guide Rail Callouts):</p>
              <div class={styles.grid}>
                <StatusBanner type="status">
                  Database snapshot exported successfully. Local OPFS sync vault clean.
                </StatusBanner>
                <StatusBanner type="error">
                  Sync connection interrupted: Unable to reach sync.tildom.app. Offline mode active.
                </StatusBanner>
              </div>
              <p class={styles.usageNote}>Use <code>StatusBanner type="status"</code> for progress or success and <code>type="error"</code> for a recoverable error. The component announces each with the appropriate live region role.</p>
            </div>

            {/* Skeletons & Empty State */}
            <div class={`${styles.grid} ${styles.twoCol}`}>
              <div class={styles.componentBox}>
                <div style={{ display: "flex", "justify-content": "space-between", "align-items": "baseline" }}>
                  <p class={styles.componentBoxLabel}>LoadingSkeleton:</p>
                  <Button variant="text" onClick={() => setSkeletonLines(prev => (prev === 3 ? 4 : 3))}>
                    Toggle lines ({skeletonLines()})
                  </Button>
                </div>
                <LoadingSkeleton lines={skeletonLines()} />
              </div>

              <div class={styles.componentBox}>
                <p class={styles.componentBoxLabel}>EmptyState (Quiet Monospace Fallback):</p>
                <EmptyState
                  message="No entries recorded yet."
                  hint="Create a new entry or import from existing backup."
                  action={
                    <Button variant="text">
                      [ + new entry ]
                    </Button>
                  }
                />
              </div>
            </div>

            {/* Unified Search Showcase */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Search Suite (&lt;Search&gt;, &lt;Search.Input&gt;, &lt;Search.Highlight&gt;):</p>
              <Search query={searchQuery} onSearch={setSearchQuery}>
                <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "0.75rem", border: "1px solid var(--border-color, #e1e4e8)", background: "var(--bg-canvas)" }}>
                  <span style={{ "padding-left": "1ch", "font-size": "12px", color: "var(--fg-muted)" }}>[ search buffer ]</span>
                  <Search.Input placeholder="Search mock database..." />
                </div>

                <Show
                  when={filteredSearchItems().length > 0}
                  fallback={
                    <EmptyState
                      message="No local matches."
                      hint={`No items matched "${searchQuery()}".`}
                      action={
                        <Button variant="text" onClick={() => setSearchQuery("")}>
                          [ clear search ]
                        </Button>
                      }
                    />
                  }
                >
                  <div class={styles.listRail}>
                    <For each={filteredSearchItems()}>
                      {(item) => (
                        <div class={styles.sampleRow}>
                          <span class={styles.rowTitle}>
                            <Search.Highlight>{item.title}</Search.Highlight>
                          </span>
                          <span class={styles.rowMeta}>
                            <Badge variant="tag"><Search.Highlight>{item.tag}</Search.Highlight></Badge>
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </Search>
            </div>
          </div>
        </section>

        {/* 4. Collections & Data Presentation Patterns */}
        <section id="sec-patterns" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Example patterns</h2>
            <span class={styles.sectionDesc}>App-owned compositions, not exported components</span>
          </div>

          <div class={`${styles.grid} ${styles.twoCol}`}>
            {/* List Rail with Block Cursor */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>List item rail (example markup; Vim j / k keys):</p>
              <div class={styles.listRail}>
                <button type="button" aria-pressed={activeRow() === 0}
                  class={`${styles.sampleRow} ${activeRow() === 0 ? styles.sampleRowActive : ""}`}
                  onClick={() => setActiveRow(0)}
                >
                  <span class={styles.rowTitle}>
                    <span class={styles.unreadDot}>•</span>
                    Local-first software architecture guide
                  </span>
                  <span class={styles.rowMeta}>
                    <span>ref.tools</span>
                    <span>·</span>
                    <span>2h ago</span>
                    <span>·</span>
                    <Badge variant="tag">architecture</Badge>
                    <Badge variant="tag">local</Badge>
                  </span>
                </button>

                <button type="button" aria-pressed={activeRow() === 1}
                  class={`${styles.sampleRow} ${activeRow() === 1 ? styles.sampleRowActive : ""}`}
                  onClick={() => setActiveRow(1)}
                >
                  <span class={styles.rowTitle}>
                    How I Design with AI - anti-slop principles
                  </span>
                  <span class={styles.rowMeta}>
                    <span>ref.tools/blog</span>
                    <span>·</span>
                    <span>yesterday</span>
                    <span>·</span>
                    <Badge variant="tag">design</Badge>
                    <Badge variant="tag">ai</Badge>
                  </span>
                </button>

                <button type="button" aria-pressed={activeRow() === 2}
                  class={`${styles.sampleRow} ${activeRow() === 2 ? styles.sampleRowActive : ""}`}
                  onClick={() => setActiveRow(2)}
                >
                  <span class={styles.rowTitle}>
                    Bart Jaskulski (Kin Contact)
                  </span>
                  <span class={styles.rowMeta}>
                    <Badge variant="bracket">colleague</Badge>
                    <span>·</span>
                    <span>Warsaw, PL</span>
                    <span>·</span>
                    <span>3d ago</span>
                  </span>
                </button>
              </div>
            </div>

            {/* Sync Status Definition List */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Sync status definition list (example markup):</p>
              <dl class={styles.defList}>
                <div class={styles.defCard}>
                  <dt class={styles.defTerm}>state</dt>
                  <dd class={styles.defDesc}>clean</dd>
                </div>
                <div class={styles.defCard}>
                  <dt class={styles.defTerm}>revision</dt>
                  <dd class={styles.defDesc}>rev-4891</dd>
                </div>
                <div class={styles.defCard}>
                  <dt class={styles.defTerm}>local</dt>
                  <dd class={styles.defDesc}>up to date</dd>
                </div>
              </dl>
              <p class={styles.sectionDesc}>
                A possible settings layout. Keep the markup in the app that owns sync status until another app needs the same structure.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Shell & Overlays */}
        <section id="sec-overlays" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Shell and overlays</h2>
            <span class={styles.sectionDesc}>Responsive topbar, native dialog modals, CSS anchored popovers & keybind help</span>
          </div>

          <div class={styles.grid}>
            {/* Tabline */}
            <div class={styles.componentBox}>
              <p class={styles.componentBoxLabel}>Tabline:</p>
              <div style={{ border: "1px solid var(--border-color, #e1e4e8)" }}>
                <Tabline>
                  <Tabline.Brand app={currentApp()} />
                  <Tabline.Nav>
                    <Tabline.Tab href="#tab-main" active={true}>{currentApp()}.db</Tabline.Tab>
                    <Tabline.Tab href="#tab-settings" active={false}>settings.json</Tabline.Tab>
                    <Tabline.Tab href="#tab-showcase" active={false}>showcase.dev</Tabline.Tab>
                  </Tabline.Nav>
                </Tabline>
              </div>
            </div>

            {/* Dialogs & Popover API */}
            <div class={`${styles.grid} ${styles.twoCol}`}>
              <div class={styles.componentBox}>
                <p class={styles.componentBoxLabel}>ConfirmDialog (Replaces window.confirm):</p>
                <p class={styles.sectionDesc}>
                  Accessible native modal with backdrop, keyboard focus trapping, Escape handling, and danger confirmation.
                </p>
                <div>
                  <Button danger onClick={() => setShowConfirm(true)}>
                    Trigger Delete Confirmation
                  </Button>
                </div>
                <Show when={confirmNotice()}>
                  <StatusBanner type="status">
                    {confirmNotice()!}
                  </StatusBanner>
                </Show>
              </div>

              <div class={styles.componentBox}>
                <p class={styles.componentBoxLabel}>Modal Form Dialog:</p>
                <p class={styles.sectionDesc}>
                  Native <code>&lt;dialog&gt;</code> with title bar, close action [ × ], form controls, and autofocus.
                </p>
                <div>
                  <Button onClick={() => setShowModal(true)}>
                    Open Modal Form
                  </Button>
                </div>
              </div>

              {/* Anchored Popover */}
              <div class={styles.componentBox} style={{ "grid-column": "1 / -1" }}>
                <p class={styles.componentBoxLabel}>Native Popover API & CSS Anchor Positioning:</p>
                <p class={styles.sectionDesc}>
                  Escapes <code>overflow: hidden</code> stacking contexts without z-index wars. Features native light dismissal.
                </p>
                <div class={styles.componentRow}>
                  <button
                    type="button"
                    id="anchor-menu-btn"
                    class={styles.popoverTrigger}
                    style={{
                      "anchor-name": "--demo-popover-anchor",
                    }}
                    popovertarget="demo-action-popover"
                  >
                    [ TOGGLE ANCHORED POPOVER ▼ ]
                  </button>

                  <Popover
                    id="demo-action-popover"
                    anchorName="--demo-popover-anchor"
                    positionArea="bottom span-right"
                  >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "0.5rem", "min-width": "24ch" }}>
                      <div style={{ "font-weight": "bold", "border-bottom": "1px solid var(--border-color)", "padding-bottom": "0.25rem" }}>
                        Quick Actions Menu
                      </div>
                      <div style={{ "font-size": "12px", color: "var(--fg-muted)" }}>
                        Top-layer popover anchored with pure CSS.
                      </div>
                  <Button variant="text" onClick={() => setConfirmNotice("Action: Export triggered (demo)")}>
                        [ export database ]
                      </Button>
                  <Button variant="text" onClick={() => setConfirmNotice("Action: Clear filter triggered (demo)")}>
                        [ clear filters ]
                      </Button>
                    </div>
                  </Popover>

                  <Button variant="text" onClick={() => showVimHelp()}>
                    [ open keybind help (?) ]
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Design System Guidelines & Do's / Don'ts */}
        <section id="sec-guidelines" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Usage guidelines</h2>
            <span class={styles.sectionDesc}>Decisions that keep the shared components consistent</span>
          </div>

          <div class={styles.dodontGrid}>
            <div class={styles.doCard}>
              <span class={`${styles.dodontHeader} ${styles.doHeader}`}>✓ DO: 0px Flat Corners Globally</span>
              <p class={styles.dodontText}>
                Use <code>border-radius: 0px</code> on all buttons, inputs, panels, and modals. Tildom's aesthetic is strictly grounded in text tools and code editors.
              </p>
            </div>

            <div class={styles.dontCard}>
              <span class={`${styles.dodontHeader} ${styles.dontHeader}`}>✗ DON'T: Rounded Corners & Pills</span>
              <p class={styles.dodontText}>
                Never introduce <code>rounded-md</code>, <code>rounded-full</code>, or floating pill buttons. They dilute the text-tool design identity.
              </p>
            </div>

            <div class={styles.doCard}>
              <span class={`${styles.dodontHeader} ${styles.doHeader}`}>✓ DO: Vertical Guide Rails for Lists</span>
              <p class={styles.dodontText}>
                Group lists, callouts, and comments using a thin left border rail (<code>border-left: 2px solid var(--border-color)</code>).
              </p>
            </div>

            <div class={styles.dontCard}>
              <span class={`${styles.dodontHeader} ${styles.dontHeader}`}>✗ DON'T: Heavy Boxed Cards & Shadows</span>
              <p class={styles.dodontText}>
                Do not wrap individual list items in heavy 4-sided cards with box shadows. Keep data presentation quiet, dense, and scan-friendly.
              </p>
            </div>

            <div class={styles.doCard}>
              <span class={`${styles.dodontHeader} ${styles.doHeader}`}>✓ DO: Use Named Variants</span>
              <p class={styles.dodontText}>
                Use the variants a shared component exposes. For buttons, choose <code>default</code>, <code>text</code>, or <code>danger</code>.
              </p>
            </div>

            <div class={styles.dontCard}>
              <span class={`${styles.dodontHeader} ${styles.dontHeader}`}>✗ DON'T: Arbitrary Class Prop Overrides</span>
              <p class={styles.dodontText}>
                Avoid changing a shared component's appearance at each call site. If a new treatment recurs, define a named variant with a clear purpose.
              </p>
            </div>
          </div>
        </section>

        {/* 7. AI Agent Context */}
        <section id="sec-agent" class={styles.section}>
          <div class={styles.sectionHeader}>
            <h2 class={styles.sectionTitle}>Using the package</h2>
            <span class={styles.sectionDesc}>A copyable Solid example; import shared CSS once in the app</span>
          </div>

          <div class={styles.componentBox}>
            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
              <p class={styles.componentBoxLabel}>Minimal setup and usage example:</p>
              <button type="button" class={styles.copyBtn} onClick={copyAiCheatsheet}>
                {aiSnippetCopied() ? "[ copied ]" : "[ copy example ]"}
              </button>
            </div>
            <pre class={styles.aiContextBox}>{packageSnippet}</pre>
          </div>
        </section>
      </main>

      {/* Interactive ConfirmDialog for Showcase */}
      <ConfirmDialog
        open={showConfirm()}
        title="Delete 'Alex from climbing'?"
        message="This will permanently delete this person and all 4 associated timeline entries. This cannot be undone."
        danger
        confirmText="delete person"
        onConfirm={() => {
          setShowConfirm(false);
          setConfirmNotice("Person record deleted (demo).");
          setTimeout(() => setConfirmNotice(null), 4000);
        }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Interactive Modal Dialog for Showcase */}
      <Dialog
        open={showModal()}
        title="New Contact Record"
        onClose={() => setShowModal(false)}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            setShowModal(false);
            setConfirmNotice(`Created contact: ${modalInputVal() || "Anonymous"}`);
            setTimeout(() => setConfirmNotice(null), 4000);
          }}
          style={{ display: "flex", "flex-direction": "column", gap: "1rem" }}
        >
          <label style={{ display: "grid", gap: "0.5rem", "font-size": "12px", color: "var(--fg-muted)" }}>
            Name you use:
            <Input
              value={modalInputVal()}
              placeholder="e.g. Maya Lin"
              onInput={(e) => setModalInputVal(e.currentTarget.value)}
              required
            />
          </label>
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "1ch", "margin-top": "0.5rem" }}>
            <Button variant="text" onClick={() => setShowModal(false)}>
              [ cancel ]
            </Button>
            <Button type="submit">
              [ create record ]
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Global Keybind Help Modal */}
      <KeybindHelp />
    </div>
  );
}

export default function Showcase(props: ShowcaseProps) {
  return (
    <VimNavigationProvider>
      <ShowcaseContent {...props} />
    </VimNavigationProvider>
  );
}
