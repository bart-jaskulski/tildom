type TextEdit = {
  from: number;
  to: number;
  text: string;
  caret: number;
};

export const getMarkdownListEdit = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEdit | null => {
  if (selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const beforeCaret = value.slice(lineStart, selectionStart);
  const unordered = beforeCaret.match(/^(\s*)([-+*])\s+(\[[ xX]\]\s+)?(.*)$/);

  if (unordered) {
    const [, indent, bullet, task = "", content] = unordered;
    if (!content.trim()) {
      return { from: lineStart, to: selectionStart, text: "", caret: lineStart };
    }

    const prefix = `${indent}${bullet} ${task ? "[ ] " : ""}`;
    return {
      from: selectionStart,
      to: selectionEnd,
      text: `\n${prefix}`,
      caret: selectionStart + prefix.length + 1,
    };
  }

  const ordered = beforeCaret.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (!ordered) return null;

  const [, indent, number, delimiter, content] = ordered;
  if (!content.trim()) {
    return { from: lineStart, to: selectionStart, text: "", caret: lineStart };
  }

  const prefix = `${indent}${Number(number) + 1}${delimiter} `;
  return {
    from: selectionStart,
    to: selectionEnd,
    text: `\n${prefix}`,
    caret: selectionStart + prefix.length + 1,
  };
};

export const handleMarkdownishEnter = (event: KeyboardEvent) => {
  if (
    event.key !== "Enter"
    || event.shiftKey
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.isComposing
  ) return false;

  const textarea = event.currentTarget;
  if (!(textarea instanceof HTMLTextAreaElement)) return false;

  const edit = getMarkdownListEdit(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  if (!edit) return false;

  event.preventDefault();
  textarea.setRangeText(edit.text, edit.from, edit.to, "end");
  textarea.setSelectionRange(edit.caret, edit.caret);
  textarea.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertLineBreak",
    data: edit.text,
  }));
  return true;
};
