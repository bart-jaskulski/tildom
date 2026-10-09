import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Button, Checkbox, Input, Textarea } from "@tildom/ui";
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
            aria-label={props.completed ? "Mark task incomplete" : "Complete task"}
            checked={props.completed}
            onChange={(checked) => updateTask(props.id, { completed: checked })}
          />

          <Show when={hasChildren()}>
            <Button
              type="button"
              onClick={toggleExpand}
              variant="text"
              aria-label={isExpanded() ? "Collapse subtasks" : "Expand subtasks"}
            >
              {isExpanded() ? "[-]" : "[+]"}
            </Button>
          </Show>
        </div>

        {/* Task Text Content */}
        <div class="flex-1 min-w-0 flex flex-col gap-2">
          <div class="flex items-start justify-between gap-3">
            <Show when={!isEditing()} fallback={
              <Textarea
                ref={inputRef}
                autoResize
                rows={1}
                value={draft()}
                onInput={(event) => {
                  setDraft(event.currentTarget.value);
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
              <Button
                onClick={(e) => { e.stopPropagation(); deleteTask(props.id); }}
                variant="text" danger
                title="Delete"
                aria-label="Delete task"
              >
                [ DELETE ]
              </Button>
            </div>
          </div>

          {/* Date Selector Badge & Action Badges */}
          <div class="flex items-center gap-2">
            <Button
              ref={dueDateButtonRef}
              type="button"
              onClick={() => setIsEditingDueDate(true)}
              variant="text"
              aria-label={props.dueAt === null ? "Set due date" : "Edit due date"}
            >
              {props.dueAt === null ? "[ Set Date ]" : `[ Due: ${formatDueDateLabel(props.dueAt)} ]`}
            </Button>

            <Button
              type="button"
              onClick={handleAddSubtaskTrigger}
              variant="text"
            >
              [ + SUBTASK ]
            </Button>
          </div>
        </div>
      </div>

      {/* Inline Subtask Input Form */}
      <Show when={isAddingSubtask()}>
        <div class="pl-[4ch] pr-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-canvas)] flex flex-col gap-2 font-mono">
          <div class="flex items-center gap-2">
            <span class="text-xs text-[var(--fg-muted)]">❯ ADD STEP:</span>
            <Input
              ref={subtaskInputRef}
              type="text"
              class="flex-1"
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
            <Button
              type="button"
              onClick={cancelSubtask}
              variant="text"
            >
              [ CANCEL ]
            </Button>
            <Button
              type="button"
              onClick={saveSubtask}

            >
              [ ADD ]
            </Button>
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
