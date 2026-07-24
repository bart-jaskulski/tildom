import { createEffect, createMemo, createSignal, on, Show } from "solid-js";
import Plus from "lucide-solid/icons/plus";
import { addTask, setTaskExpanded } from "~/stores/taskStore";
import { isOnline } from "~/stores/networkStore";
import { breakdownGranularity } from "~/stores/preferencesStore";

// Re-define BreakdownTaskResult since taskActions.ts is no longer imported
type CreateTasksResult = {
  ok: true;
  action: "createTasks";
  title: string;
  tasks: Array<{
    content: string;
    dueDate?: string;
  }>;
};

type AskClarificationResult = {
  ok: true;
  action: "askClarification";
  question: string;
};

export type BreakdownTaskResult = CreateTasksResult | AskClarificationResult;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "http://localhost:8788" : "https://api.tildom.app");

type TaskPromptProps = {
  visible: boolean;
};

export default function TaskPrompt(props: TaskPromptProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [mode, setMode] = createSignal<"default" | "clarify">("default");
  
  // Custom mock for useSubmission matching standard SPA
  const [pending, setPending] = createSignal(false);
  const [result, setResult] = createSignal<BreakdownTaskResult | null>(null);

  const submission = {
    get pending() { return pending(); },
    get result() { return result(); }
  };

  const [clarification, setClarification] = createSignal<string>("");
  const [isAiEnabled, setIsAiEnabled] = createSignal(false);
  const [isSavingLocally, setIsSavingLocally] = createSignal(false);
  const [dueDate, setDueDate] = createSignal<string>("");
  const [taskText, setTaskText] = createSignal<string>("");
  const submissionResult = createMemo(() => submission.result as BreakdownTaskResult | undefined);

  const runWithTransition = async <T,>(fn: () => T | Promise<T>): Promise<T> => {
    const startViewTransition = (document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> };
    }).startViewTransition;

    if (startViewTransition) {
      let result!: T;
      const transition = startViewTransition.call(document, async () => {
        result = await fn();
      });
      await transition.finished;
      return result;
    }

    return await fn();
  };

  const resetComposer = () => {
    setMode("default");
    setClarification("");
    setIsAiEnabled(false);
    setDueDate("");
    setTaskText("");
    setResult(null);
    setPending(false);

    if (textareaRef) {
      textareaRef.value = "";
      textareaRef.style.height = "auto";
    }

    if (clarifyTextareaRef) {
      clarifyTextareaRef.value = "";
      clarifyTextareaRef.style.height = "auto";
    }
  };

  createEffect(
    on(submissionResult, async (result) => {
      if (result) {
        switch (result.action) {
        case "createTasks":
          const { tasks } = result;
          const rootDueDate = dueDate() || undefined;

          const newTask = await runWithTransition(() =>
            addTask({
              content: result.title,
              dueDate: rootDueDate,
            })
          );

          if (!newTask) return;
          if (tasks.length > 0) {
            setTaskExpanded(newTask.id, true);
          }

          for (const t of tasks) {
            await runWithTransition(() => addTask(t, newTask.id));
          }
          setIsOpen(false);
          resetComposer();
          break;
        case "askClarification":
          setMode("clarify");
          setClarification(result.question);
          break;
        default:
          return;
        }
      }
    })
  );

  let textareaRef: HTMLTextAreaElement | undefined;
  let clarifyTextareaRef: HTMLTextAreaElement | undefined;

  const handleOpen = () => {
    setIsOpen(true);
    setMode("default");
    setTimeout(() => textareaRef?.focus(), 50);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetComposer();
  };

  const handleKeyDown = (e: KeyboardEvent, formRef: HTMLFormElement | undefined) => {
    if (e.key === "Enter") {
      if (e.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();

      const form = formRef || (e.currentTarget as HTMLTextAreaElement).form;
      const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitButton?.disabled) return;

      form?.requestSubmit();
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const triggerAiBreakdown = async (taskVal: string, granularityVal: string, clarificationVal?: string) => {
    setPending(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/do/breakdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: taskVal,
          granularity: granularityVal,
          clarification: clarificationVal,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "AI breakdown failed");
      }

      const apiResult = await response.json() as BreakdownTaskResult;
      setResult(apiResult);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "AI breakdown failed");
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();

    const task = taskText().trim();
    const selectedDueDate = dueDate() || undefined;

    if (!task) return;

    if (isAiEnabled()) {
      const form = event.currentTarget as HTMLFormElement;
      const formData = new FormData(form);
      const clarificationVal = (formData.get("clarification") as string)?.trim();
      
      await triggerAiBreakdown(task, breakdownGranularity(), clarificationVal);
      return;
    }

    if (isSavingLocally()) {
      return;
    }

    setIsSavingLocally(true);

    try {
      await runWithTransition(() =>
        addTask({
          content: task,
          dueDate: selectedDueDate,
        })
      );
      setIsOpen(false);
      resetComposer();
    } finally {
      setIsSavingLocally(false);
    }
  };

  const submitDisabled = createMemo(() =>
    !taskText().trim() ||
    isSavingLocally() ||
    submission.pending ||
    (isAiEnabled() && !isOnline())
  );

  return (
    <>
      {/* TUI FIXED BOTTOM BAR BUTTON */}
      <div 
        class="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-canvas)] border-t-2 border-[var(--border-color)] transition-transform duration-200"
        style={{ transform: props.visible && !isOpen() ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div class="max-w-xl mx-auto p-4">
          <button 
            onClick={handleOpen} 
            class="w-full tui-button flex items-center justify-center gap-2 group font-mono"
          >
            <Plus class="w-4 h-4" />
            <span>[ ADD NEW TASK ]</span>
          </button>
        </div>
      </div>

      <Show when={isOpen()}>
        <div 
          class="fixed inset-0 bg-black/30 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 font-mono"
          onClick={handleClose}
        >
          <div 
            class="bg-[var(--bg-surface)] w-full max-w-xl border-t-2 sm:border-2 border-[var(--fg-default)] p-6 flex flex-col gap-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-prompt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h2 id="task-prompt-title" class="text-sm font-bold uppercase tracking-wider text-[var(--fg-default)]">
                {mode() === "clarify" ? "■ CLARIFY TASK" : "■ ADD TASK"}
              </h2>

              <button
                type="button"
                onClick={handleClose}
                class="font-mono text-xs text-[var(--fg-muted)] hover:text-[var(--syntax-keyword)] cursor-pointer select-none"
                aria-label="Close task composer"
              >
                [ CLOSE ]
              </button>
            </div>

            <form
              onSubmit={(event) => void handleSubmit(event)}
              class="flex flex-col gap-4"
            >
              <Show when={mode() === "default"}>
                <div class="w-full">
                  <textarea
                    ref={textareaRef}
                    placeholder="What needs to be done?"
                    aria-label="Task description"
                    class="tui-textarea min-h-[4.5rem]"
                    rows={1}
                    value={taskText()}
                    onInput={(e) => {
                      setTaskText(e.currentTarget.value);
                      autoResize(e.currentTarget);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, undefined)}
                  />
                </div>

                <div class="flex flex-col gap-3 pt-2">
                  {/* Bracket-styled due date button */}
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-[var(--fg-muted)]">DUE DATE:</span>
                    <div class="relative inline-flex items-center">
                      <input 
                        type="date" 
                        aria-label="Choose due date"
                        class="absolute inset-0 opacity-0 cursor-pointer"
                        value={dueDate()}
                        onChange={(e) => setDueDate(e.currentTarget.value)} 
                      />
                      <button
                        type="button"
                        class="text-xs font-mono border border-[var(--border-color)] px-2 py-1 bg-[var(--bg-canvas)] hover:border-[var(--fg-default)] transition-colors cursor-pointer"
                      >
                        {dueDate() ? `[ ${dueDate()} ]` : "[ Set Date ]"}
                      </button>
                    </div>
                  </div>

                  {/* AI Breakdown checkbox */}
                  <div class="flex items-center justify-between">
                    <label class="tui-checkbox-container cursor-pointer">
                      <input 
                        type="checkbox" 
                        class="sr-only"
                        checked={isAiEnabled()}
                        onChange={(event) => setIsAiEnabled(event.currentTarget.checked)}
                        aria-label="Enable AI breakdown"
                      />
                      <span class="tui-checkbox-box font-mono text-sm">
                        {isAiEnabled() ? "[x]" : "[ ]"} AI Breakdown
                      </span>
                    </label>

                    <button 
                      type="submit" 
                      class="tui-button"
                      disabled={submitDisabled()}
                      aria-label={isAiEnabled() ? "Create task with AI breakdown" : "Create task"}
                    >
                      {isSavingLocally() || submission.pending ? "[ SAVING... ]" : "[ SUBMIT ]"}
                    </button>
                  </div>
                </div>

                <Show when={isAiEnabled() && !isOnline()}>
                  <p class="text-xs text-[var(--syntax-error)] font-bold uppercase pt-1">
                    ! AI breakdown needs network. Saving as local-only task.
                  </p>
                </Show>
              </Show>

              <Show when={mode() === "clarify"}>
                <div class="flex flex-col gap-4">
                  <div class="border-l-4 border-[var(--highlight-blue)] bg-[var(--bg-canvas)] p-3 text-xs font-mono text-[var(--syntax-string)]">
                    {clarification()}
                  </div>
                  
                  <div>
                    <textarea
                      ref={clarifyTextareaRef}
                      name="clarification"
                      placeholder="Provide details..."
                      aria-label="Clarification details"
                      class="tui-textarea"
                      rows={2}
                      onInput={(e) => autoResize(e.currentTarget)}
                      onKeyDown={(e) => handleKeyDown(e, undefined)}
                    />
                  </div>
                  
                  <div class="flex justify-end gap-2 border-t border-[var(--border-color)] pt-3">
                    <button 
                      type="button" 
                      onClick={() => { setMode("default"); setClarification(""); }}
                      class="text-xs font-mono text-[var(--fg-muted)] hover:text-[var(--fg-default)] cursor-pointer select-none px-2 py-1"
                    >
                      [ CANCEL ]
                    </button>
                    <button 
                      type="submit" 
                      class="tui-button text-xs font-mono"
                      disabled={submission.pending || !isOnline()}
                    >
                      [ REPLY ]
                    </button>
                  </div>
                  <Show when={!isOnline()}>
                    <p class="text-xs text-[var(--syntax-error)] font-bold uppercase">
                      ! Reconnect to continue AI clarification flow.
                    </p>
                  </Show>
                </div>
              </Show>

            </form>
          </div>
        </div>
      </Show>
    </>
  );
}
