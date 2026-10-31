import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  ViewPlugin,
} from "@codemirror/view";
import { createEffect, onCleanup, onMount } from "solid-js";
import styles from "./Editor.module.css";

export type EditorHandle = {
  focus: () => void;
  blur: () => void;
  view?: EditorView;
};

export type EditorProps = {
  id?: string;
  value?: string;
  onInput?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  class?: string;
  compact?: boolean;
  titleFirstLine?: boolean;
  autofocus?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  variant?: "default" | "borderless";
  ref?: EditorHandle | ((handle: EditorHandle) => void);
};

// Markdownish inline syntax highlighting (Option A)
// Keeps all syntax characters visible while quietly applying syntax coloring
const markdownishHighlight = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    private build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const decorations: Array<{ from: number; to: number; value: Decoration }> = [];
      const occupied: Array<{ from: number; to: number }> = [];

      const addDeco = (from: number, to: number, value: Decoration) => {
        if (from >= to) return;
        if (occupied.some((r) => from < r.to && to > r.from)) return;
        occupied.push({ from, to });
        decorations.push({ from, to, value });
      };

      for (const { from, to } of view.visibleRanges) {
        const startLine = view.state.doc.lineAt(from).number;
        const endLine = view.state.doc.lineAt(to).number;

        for (let num = startLine; num <= endLine; num++) {
          const line = view.state.doc.line(num);
          const text = line.text;
          if (!text) continue;

          // Headings
          const headingMatch = text.match(/^(#{1,6})\s+/);
          if (headingMatch) {
            const hashesLen = headingMatch[1].length;
            addDeco(line.from, line.from + hashesLen, Decoration.mark({ class: "cm-md-hash" }));
            addDeco(line.from + headingMatch[0].length, line.to, Decoration.mark({ class: "cm-md-heading" }));
          }

          // Tasks: - [ ] or - [x]
          const taskMatch = text.match(/^(\s*[-*+]\s+)\[([ xX])\]/);
          if (taskMatch) {
            const bracketStart = line.from + taskMatch[1].length;
            addDeco(bracketStart, bracketStart + 3, Decoration.mark({ class: "cm-md-task" }));
          }

          // Links: [text](url)
          for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
            const mFrom = line.from + match.index!;
            const textLen = match[1].length;
            const fullLen = match[0].length;
            addDeco(mFrom, mFrom + 1, Decoration.mark({ class: "cm-md-delimiter" }));
            addDeco(mFrom + 1, mFrom + 1 + textLen, Decoration.mark({ class: "cm-md-link" }));
            addDeco(mFrom + 1 + textLen, mFrom + fullLen, Decoration.mark({ class: "cm-md-delimiter" }));
          }

          // Bold: **text**
          for (const match of text.matchAll(/\*\*([^*\n]+)\*\*/g)) {
            const mFrom = line.from + match.index!;
            const mTo = mFrom + match[0].length;
            addDeco(mFrom, mFrom + 2, Decoration.mark({ class: "cm-md-delimiter" }));
            addDeco(mFrom + 2, mTo - 2, Decoration.mark({ class: "cm-md-strong" }));
            addDeco(mTo - 2, mTo, Decoration.mark({ class: "cm-md-delimiter" }));
          }

          // Strikethrough: ~~text~~
          for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
            const mFrom = line.from + match.index!;
            const mTo = mFrom + match[0].length;
            addDeco(mFrom, mFrom + 2, Decoration.mark({ class: "cm-md-delimiter" }));
            addDeco(mFrom + 2, mTo - 2, Decoration.mark({ class: "cm-md-strike" }));
            addDeco(mTo - 2, mTo, Decoration.mark({ class: "cm-md-delimiter" }));
          }

          // Inline code: `text`
          for (const match of text.matchAll(/`([^`\n]+)`/g)) {
            const mFrom = line.from + match.index!;
            const mTo = mFrom + match[0].length;
            addDeco(mFrom, mFrom + 1, Decoration.mark({ class: "cm-md-delimiter" }));
            addDeco(mFrom + 1, mTo - 1, Decoration.mark({ class: "cm-md-code" }));
            addDeco(mTo - 1, mTo, Decoration.mark({ class: "cm-md-delimiter" }));
          }

          // Emphasis: *text*
          for (const match of text.matchAll(/(?<!\*)\*([^*\n]+)\*(?!\*)/g)) {
            const mFrom = line.from + match.index!;
            const mTo = mFrom + match[0].length;
            addDeco(mFrom, mFrom + 1, Decoration.mark({ class: "cm-md-delimiter" }));
            addDeco(mFrom + 1, mTo - 1, Decoration.mark({ class: "cm-md-emphasis" }));
            addDeco(mTo - 1, mTo, Decoration.mark({ class: "cm-md-delimiter" }));
          }

          // Hashtags: #tag
          for (const match of text.matchAll(/(?:^|[^\w/])#([a-z][a-z0-9_-]*)/gi)) {
            const hashIndex = match[0].indexOf("#");
            const mFrom = line.from + match.index! + hashIndex;
            const mTo = mFrom + match[1].length + 1;
            addDeco(mFrom, mTo, Decoration.mark({ class: "cm-md-tag" }));
          }
        }
      }

      decorations.sort((a, b) => a.from - b.from || a.to - b.to);
      for (const d of decorations) {
        builder.add(d.from, d.to, d.value);
      }
      return builder.finish();
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

// Toggle checkbox task on direct click
const taskClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const line = view.state.doc.lineAt(pos);
    const match = line.text.match(/^(\s*[-*+]\s+)\[([ xX])\]/);
    if (!match) return false;
    const bracketStart = line.from + match[1].length;
    const bracketEnd = bracketStart + 3;
    if (pos >= bracketStart && pos <= bracketEnd) {
      const current = match[2];
      const next = current === " " ? "x" : " ";
      view.dispatch({
        changes: { from: bracketStart + 1, to: bracketStart + 2, insert: next },
      });
      return true;
    }
    return false;
  },
});

export default function Editor(props: EditorProps) {
  let host: HTMLDivElement | undefined;
  let editor: EditorView | undefined;

  const placeholderCompartment = new Compartment();
  const attrCompartment = new Compartment();

  const getAttributes = () => {
    const attrs: Record<string, string> = {};
    if (props.ariaLabel) attrs["aria-label"] = props.ariaLabel;
    if (props.ariaLabelledby) attrs["aria-labelledby"] = props.ariaLabelledby;
    if (props.id) attrs["id"] = `${props.id}-cm`;
    return EditorView.contentAttributes.of(attrs);
  };

  onMount(() => {
    if (!host) return;

    editor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value ?? "",
        extensions: [
          history(),
          markdown(),
          markdownishHighlight,
          taskClickHandler,
          EditorView.lineWrapping,
          placeholderCompartment.of(cmPlaceholder(props.placeholder ?? "")),
          attrCompartment.of(getAttributes()),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                props.onSubmit?.();
                return true;
              },
            },
            {
              key: "Escape",
              run: (view) => {
                view.contentDOM.blur();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...markdownKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              props.onInput?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    if (props.autofocus) {
      editor.focus();
    }

    if (typeof props.ref === "function") {
      props.ref({
        focus: () => editor?.focus(),
        blur: () => editor?.contentDOM.blur(),
        get view() {
          return editor;
        },
      });
    }
  });

  // Keep external value prop in sync without resetting caret if unchanged
  createEffect(() => {
    const nextValue = props.value ?? "";
    if (editor && editor.state.doc.toString() !== nextValue) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: nextValue },
      });
    }
  });

  // Reactively reconfigure placeholder
  createEffect(() => {
    const text = props.placeholder ?? "";
    if (editor) {
      editor.dispatch({
        effects: placeholderCompartment.reconfigure(cmPlaceholder(text)),
      });
    }
  });

  // Reactively reconfigure ARIA attributes
  createEffect(() => {
    if (editor) {
      editor.dispatch({
        effects: attrCompartment.reconfigure(getAttributes()),
      });
    }
  });

  onCleanup(() => {
    editor?.destroy();
  });

  return (
    <div
      ref={(el) => {
        host = el;
      }}
      id={props.id}
      class={styles.editor}
      classList={{
        [styles.compact]: props.compact,
        [styles.borderless]: props.variant === "borderless",
        [styles.titleFirstLine]: props.titleFirstLine,
        [props.class ?? ""]: Boolean(props.class),
      }}
    />
  );
}
