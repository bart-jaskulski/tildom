import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Button, Checkbox, Input, Popover, PopoverItem, Textarea } from "@tildom/ui";
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
    <div class="task-item-wrapper">
      <div
        class={`task-item-row ${
          isEditing() ? "is-editing" : ""
        }`}
      >
        {/* Monospace Checkbox [ ] or [x] with collapse toggle [-] / [+] */}
        <div class="task-controls">
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
        <div class="task-body">
          <div class="task-main">
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
                class={`task-text ${
                  props.completed ? "is-completed" : ""
                }`}
                onClick={() => setIsEditing(true)}
              >
                {props.text}
              </div>
            </Show>

            {/* Quick Actions Menu */}
            <div class="task-actions">
              <Button
                variant="text"
                aria-label={`Actions for task: ${props.text}`}
                popovertarget={`task-actions-${props.id}`}
                style={{ "anchor-name": `--task-anchor-${props.id}` }}
                class="task-action-btn"
              >
                [ ··· ]
              </Button>
              <Popover
                id={`task-actions-${props.id}`}
                anchorName={`--task-anchor-${props.id}`}
                positionArea="bottom span-left"
              >
                <PopoverItem onClick={() => setIsEditing(true)}>
                  [ edit ]
                </PopoverItem>
                <PopoverItem onClick={() => setIsEditingDueDate(true)}>
                  {props.dueAt === null ? "[ set due date ]" : "[ edit due date ]"}
                </PopoverItem>
                <PopoverItem onClick={handleAddSubtaskTrigger}>
                  [ add subtask ]
                </PopoverItem>
                <PopoverItem danger onClick={(e) => { e.stopPropagation(); deleteTask(props.id); }}>
                  [ delete ]
                </PopoverItem>
              </Popover>
            </div>
          </div>

          {/* Date Selector Badge & Action Badges */}
          <div class="task-meta">
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
        <div class="inline-subtask-form">
          <div class="inline-subtask-row">
            <span class="inline-subtask-label">❯ ADD STEP:</span>
            <Input
              ref={subtaskInputRef}
              type="text"
              class="inline-subtask-input"
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
          <div class="inline-subtask-actions">
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
              class="date-picker-hidden"
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
