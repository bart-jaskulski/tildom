export const resizeTextareaToFitContent = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
};

export const handleTextareaKeyboardSubmit = (event: KeyboardEvent) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    const form = (event.currentTarget as HTMLTextAreaElement).form;
    if (form) {
      form.requestSubmit();
    }
  }
};
