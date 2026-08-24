import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder, ViewPlugin } from "@codemirror/view";
import { createEffect, onCleanup, onMount } from "solid-js";
import styles from "./MemoEditor.module.css";

type MemoEditorProps = {
  id: string;
  value: string;
  compact?: boolean;
  placeholder?: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
};

const markdownPreview = ViewPlugin.fromClass(class {
  decorations = Decoration.none;

  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }

  update(update: { docChanged: boolean; selectionSet: boolean; view: EditorView }) {
    if (update.docChanged || update.selectionSet) this.decorations = this.build(update.view);
  }

  private build(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const selection = view.state.selection.main;
    const firstActiveLine = view.state.doc.lineAt(selection.from).number;
    const lastActiveLine = view.state.doc.lineAt(selection.to).number;
    const decorations: Array<{ from: number; to: number; value: Decoration }> = [];
    const formattedRanges: Array<{ from: number; to: number }> = [];

    const addDelimited = (line: { from: number; text: string }, pattern: RegExp, className: string) => {
      for (const match of line.text.matchAll(pattern)) {
        const from = line.from + match.index!;
        const delimiterLength = match[1].length;
        const to = from + match[0].length;
        if (formattedRanges.some((range) => from < range.to && to > range.from)) continue;
        formattedRanges.push({ from, to });
        decorations.push(
          { from, to: from + delimiterLength, value: Decoration.replace({}) },
          { from: from + delimiterLength, to: to - delimiterLength, value: Decoration.mark({ class: className }) },
          { from: to - delimiterLength, to, value: Decoration.replace({}) },
        );
      }
    };

    for (let number = 1; number <= view.state.doc.lines; number += 1) {
      if (number >= firstActiveLine && number <= lastActiveLine) continue;
      const line = view.state.doc.line(number);

      for (const match of line.text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
        const from = line.from + match.index!;
        const to = from + match[0].length;
        formattedRanges.push({ from, to });
        decorations.push(
          { from, to: from + 1, value: Decoration.replace({}) },
          { from: from + 1, to: from + 1 + match[1].length, value: Decoration.mark({ class: "memo-link" }) },
          { from: from + 1 + match[1].length, to, value: Decoration.replace({}) },
        );
      }
      addDelimited(line, /(\*\*)([^*\n]+)\1/g, "memo-strong");
      addDelimited(line, /(~~)([^~\n]+)\1/g, "memo-strike");
      addDelimited(line, /(`)([^`\n]+)\1/g, "memo-code");
      addDelimited(line, /(?<!\*)\*([^*\n]+)\*(?!\*)/g, "memo-emphasis");
    }

    decorations.sort((left, right) => left.from - right.from || left.to - right.to);
    for (const decoration of decorations) builder.add(decoration.from, decoration.to, decoration.value);
    return builder.finish();
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

export default function MemoEditor(props: MemoEditorProps) {
  let host: HTMLDivElement | undefined;
  let editor: EditorView | undefined;

  onMount(() => {
    editor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          history(),
          markdown(),
          markdownPreview,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-labelledby": `${props.id}-label` }),
          placeholder(props.placeholder ?? ""),
          keymap.of([
            { key: "Mod-Enter", run: () => (props.onSubmit(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) props.onInput(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": { "background-color": props.compact ? "var(--bg-canvas)" : "transparent", color: "var(--fg-default)" },
            ".cm-content": { "min-height": props.compact ? "6rem" : "14rem", padding: props.compact ? "0.6rem 1ch" : "0", "font-family": "inherit", "font-size": "14px", "line-height": "1.6", caretColor: "var(--fg-default)" },
            ".cm-line:first-child": props.compact
              ? { "font-size": "14px", "font-weight": "400", "line-height": "1.6" }
              : { "font-size": "22px", "font-weight": "800", "line-height": "1.25" },
            ".cm-scroller": { "font-family": "inherit", overflow: "auto" },
            ".cm-focused": { outline: "none" },
            "&.cm-focused": { "border-bottom": "2px solid var(--fg-default)" },
            ".cm-placeholder": { color: "var(--fg-muted)" },
            ".memo-strong": { "font-weight": "800" },
            ".memo-emphasis": { "font-style": "italic" },
            ".memo-strike": { "text-decoration": "line-through" },
            ".memo-code": { "background-color": "var(--bg-canvas)" },
            ".memo-link": { color: "var(--highlight-blue)", "font-weight": "700" },
            ".cm-selectionBackground, ::selection": { "background-color": "var(--syntax-bg-active) !important" },
          }),
        ],
      }),
    });
  });

  createEffect(() => {
    const value = props.value;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  });

  onCleanup(() => editor?.destroy());

  return <div classList={{ [styles.editor]: true, [styles.compact]: props.compact }} ref={(element) => { host = element; }} />;
}
