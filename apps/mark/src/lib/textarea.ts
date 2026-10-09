export const handleTextareaKeyboardSubmit = (event: KeyboardEvent) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    const form = (event.currentTarget as HTMLTextAreaElement).form;
    if (form) {
      form.requestSubmit();
    }
  }
};
