import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Checkbox } from "@tildom/ui";
import { formatDateInputValue, formatDueDateLabel, normalizeDateOnlyInput } from "~/lib/dates";
import { deleteTask, updateTask, addTask, setTaskExpanded, isTaskExpanded } from "~/stores/taskStore";
import type { Task, TreeNode } from "~/stores/taskStore";

type TaskItemProps = Task & {
  children?: TreeNode[];
};

export default function TaskItem(props: TaskItemProps) {
  const [isEditing, setIsEditing] = createSignal(false);
  const [isEditingDueDate, setIsEditingDueDate] = createSignal(false);
  const [dueDateAnchor, setDueDateAnchor] = createSignal<{ top: number; left: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = createSignal(props.text);
  let inputRef: HTMLTextAreaElement | undefined;
  let dueDateInputRef: HTMLInputElement | undefined;
  let dueDateButtonRef: HTMLButtonElement | undefined;

  // Inline Subtask Composer state
  const [isAddingSubtask, setIsAddingSubtask] = createSignal(false);
  const [subtaskDraft, setSubtaskDraft] = createSignal("");
  let subtaskInputRef: HTMLInputElement | undefined;

  createEffect(on(isEditing, (editing) => {
    if (editing && inputRef) {
      inputRef.style.height = 'auto';
      inputRef.style.height = inputRef.scrollHeight + 'px';
      
      queueMicrotask(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  }));

  createEffect(() => {
    if (isAddingSubtask() && subtaskInputRef) {
      queueMicrotask(() => {
        subtaskInputRef?.focus();
      });
    }
  });

  const updateDueDateAnchor = () => {
    if (!dueDateButtonRef) {
      return;
    }

    const rect = dueDateButtonRef.getBoundingClientRect();
    setDueDateAnchor({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  };

  const closeDueDateEditor = () => {
    setIsEditingDueDate(false);
    setDueDateAnchor(null);
  };

  createEffect(() => {
    if (!isEditingDueDate()) {
      return;
    }

    updateDueDateAnchor();

    const handleViewportChange = () => {
      updateDueDateAnchor();
    };

    document.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    let frameOne = 0;
    let frameTwo = 0;

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        dueDateInputRef?.showPicker?.() ?? dueDateInputRef?.focus();
      });
    });

    onCleanup(() => {
      if (frameOne) {
        window.cancelAnimationFrame(frameOne);
      }
      if (frameTwo) {
        window.cancelAnimationFrame(frameTwo);
      }
      document.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    });
  });

  const save = () => {
    const next = draft().trim();
    setIsEditing(false);
    if (next && next !== props.text) {
      updateTask(props.id, { text: next });
    } else {
      setDraft(props.text);
    }
  };

  const cancel = () => {
    setDraft(props.text);
    setIsEditing(false);
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleDueDateChange = (value: string) => {
    const dueAt = normalizeDateOnlyInput(value);
    updateTask(props.id, { dueAt });
    closeDueDateEditor();
  };

  const hasChildren = () => props.children && props.children.length > 0;
  const isExpanded = () => isTaskExpanded(props.id);
  const toggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    setTaskExpanded(props.id, !isExpanded());
  };

  const handleAddSubtaskTrigger = (e: MouseEvent) => {
    e.stopPropagation();
    setIsAddingSubtask(true);
  };

  const saveSubtask = async () => {
    const content = subtaskDraft().trim();
    if (!content) return;
    
    await addTask({ content }, props.id);
    setTaskExpanded(props.id, true);
    setIsAddingSubtask(false);
    setSubtaskDraft("");
  };

  const cancelSubtask = () => {
    setIsAddingSubtask(false);
    setSubtaskDraft("");
  };

  return (
    <div class="relative w-full group/item flex flex-col">
      <div 
        class={`tui-item-row flex items-start gap-4 bg-[var(--bg-surface)] border-b border-[var(--border-color)] transition-colors hover:bg-[var(--syntax-bg-active)] ${
          isEditing() ? "bg-[var(--syntax-bg-active)] border-l-[var(--syntax-keyword)]" : ""
        }`}
      >
        {/* Monospace Checkbox [ ] or [x] with collapse toggle [-] / [+] */}
        <div class="pt-0.5 shrink-0 select-none flex items-center gap-1.5">
          <Checkbox
            checked={props.completed}
            onChange={(checked) => updateTask(props.id, { completed: checked })}
          />

          <Show when={hasChildren()}>
            <button
              type="button"
              onClick={toggleExpand}
              class="font-mono text-xs text-[var(--fg-muted)] hover:text-[var(--syntax-keyword)] cursor-pointer select-none mr-1"
              aria-label={isExpanded() ? "Collapse subtasks" : "Expand subtasks"}
            >
              {isExpanded() ? "[-]" : "[+]"}
            </button>
          </Show>
        </div>

        {/* Task Text Content */}
        <div class="flex-1 min-w-0 flex flex-col gap-2">
          <div class="flex items-start justify-between gap-3">
            <Show when={!isEditing()} fallback={
              <textarea
                ref={inputRef}
                class="w-full bg-[var(--bg-surface)] border-2 border-[var(--fg-default)] p-2 font-mono text-sm leading-normal outline-none resize-none overflow-hidden"
                rows={1}
                value={draft()}
                onInput={(event) => {
                  setDraft(event.currentTarget.value);
                  autoResize(event.currentTarget);
                }}
                onBlur={save}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    save();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                  }
                }}
              />
            }>
              <div 
                class={`w-full font-mono text-sm leading-normal text-[var(--fg-default)] cursor-text break-words ${
                  props.completed ? 'line-through text-[var(--fg-muted)]' : ''
                }`}
                onClick={() => setIsEditing(true)}
              >
                {props.text}
              </div>
            </Show>

            {/* Quick Actions (Delete) */}
            <div class="flex items-start shrink-0 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); deleteTask(props.id); }}
                class="text-xs font-mono text-[var(--syntax-error)] hover:bg-[var(--syntax-error)] hover:text-white border border-[var(--syntax-error)] px-2 py-1 transition-all cursor-pointer"
                title="Delete"
                aria-label="Delete task"
              >
                [ DELETE ]
              </button>
            </div>
          </div>

          {/* Date Selector Badge & Action Badges */}
          <div class="flex items-center gap-2">
            <button
              ref={dueDateButtonRef}
              type="button"
              onClick={() => setIsEditingDueDate(true)}
              class="text-xs font-mono border border-[var(--border-color)] px-2 py-1 bg-[var(--bg-canvas)] hover:border-[var(--fg-default)] transition-colors cursor-pointer"
              aria-label={props.dueAt === null ? "Set due date" : "Edit due date"}
            >
              {props.dueAt === null ? "[ Set Date ]" : `[ Due: ${formatDueDateLabel(props.dueAt)} ]`}
            </button>

            <button
              type="button"
              onClick={handleAddSubtaskTrigger}
              class="text-xs font-mono border border-[var(--border-color)] px-2 py-1 bg-[var(--bg-canvas)] hover:border-[var(--fg-default)] transition-colors cursor-pointer"
            >
              [ + SUBTASK ]
            </button>
          </div>
        </div>
      </div>

      {/* Inline Subtask Input Form */}
      <Show when={isAddingSubtask()}>
        <div class="pl-[4ch] pr-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-canvas)] flex flex-col gap-2 font-mono">
          <div class="flex items-center gap-2">
            <span class="text-xs text-[var(--fg-muted)]">❯ ADD STEP:</span>
            <input
              ref={subtaskInputRef}
              type="text"
              class="tui-input flex-1 py-1 px-2 text-xs"
              placeholder="What needs to be done?"
              value={subtaskDraft()}
              onInput={(e) => setSubtaskDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveSubtask();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelSubtask();
                }
              }}
            />
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelSubtask}
              class="text-[10px] font-mono border border-[var(--border-color)] px-2 py-0.5 hover:border-[var(--syntax-keyword)] cursor-pointer"
            >
              [ CANCEL ]
            </button>
            <button
              type="button"
              onClick={saveSubtask}
              class="text-[10px] font-mono border border-[var(--fg-default)] bg-[var(--bg-surface)] hover:bg-[var(--fg-default)] hover:text-[var(--bg-surface)] px-2 py-0.5 cursor-pointer"
            >
              [ ADD ]
            </button>
          </div>
        </div>
      </Show>

      <Show when={isEditingDueDate() && dueDateAnchor()}>
        {(anchor) => (
          <Portal>
            <input
              ref={dueDateInputRef}
              type="date"
              aria-label="Choose due date"
              class="fixed z-[90] opacity-0 pointer-events-none"
              style={{
                top: `${anchor().top}px`,
                left: `${anchor().left}px`,
                width: `${anchor().width}px`,
                height: `${anchor().height}px`,
              }}
              value={formatDateInputValue(props.dueAt)}
              onChange={(event) => handleDueDateChange(event.currentTarget.value)}
              onBlur={() => closeDueDateEditor()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeDueDateEditor();
                }
              }}
            />
          </Portal>
        )}
      </Show>
    </div>
  );
}
