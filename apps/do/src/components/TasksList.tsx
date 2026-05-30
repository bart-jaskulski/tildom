import { For, Show, type JSX } from "solid-js";
import {
  isTaskExpanded,
  setTaskExpanded,
  type TreeNode,
} from "~/stores/taskStore";
import TaskItem from "./TaskItem";
type TasksListProps = {
  tasks: TreeNode[];
  level?: number;
  defaultExpanded?: boolean;
  emptyState?: JSX.Element;
};

type ExpansionState = {
  isExpanded: (id: string) => boolean;
  setExpanded: (id: string, value: boolean) => void;
};

export default function TasksList(props: TasksListProps) {
  const expansion: ExpansionState = {
    isExpanded: (id) => isTaskExpanded(id) || !!props.defaultExpanded,
    setExpanded: (id, value) => setTaskExpanded(id, value),
  };

  return (
    <TaskBranch
      {...props}
      level={props.level ?? 0}
      expansion={expansion}
    />
  );
}

type TaskBranchProps = TasksListProps & { expansion: ExpansionState };

function TaskBranch(props: TaskBranchProps) {
  const level = props.level ?? 0;
  return (
    <ol class="flex flex-col">
      <For each={props.tasks} fallback={props.emptyState}>
        {(task => (
          <TaskNode
            node={task}
            level={level}
            defaultExpanded={props.defaultExpanded}
            expansion={props.expansion}
            emptyState={props.emptyState}
          />
        ))}
      </For>
    </ol>
  );
}

type TaskNodeProps = {
  node: TreeNode;
  level?: number;
  defaultExpanded?: boolean;
  emptyState?: JSX.Element;
  expansion: ExpansionState;
};

function TaskNode(props: TaskNodeProps) {
  const isExpanded = () => props.expansion.isExpanded(props.node.id);
  const hasChildren = () => props.node.children.length > 0;

  const expand = () => {
    if (hasChildren()) {
      props.expansion.setExpanded(props.node.id, true);
    }
  };

  const collapse = () => props.expansion.setExpanded(props.node.id, false);

  return (
    <li class="relative flex flex-col" data-task-id={props.node.id}>
      <div class="relative w-full">
        <TaskItem {...props.node}/>

        {/* Flat TUI Subtask Indicator/Button */}
        <Show when={hasChildren() && !isExpanded()}>
          <div class="px-4 py-2 bg-[var(--bg-canvas)] border-b border-[var(--border-color)] flex items-center">
            <button
              type="button"
              class="text-xs font-mono text-[var(--highlight-blue)] hover:underline cursor-pointer"
              onClick={expand}
              aria-label={`Show ${props.node.children.length} subtasks`}
            >
              {`[+ Show ${props.node.children.length} step${props.node.children.length === 1 ? "" : "s"} ]`}
            </button>
          </div>
        </Show>
      </div>

      <Show when={hasChildren() && isExpanded()}>
        <div class="relative pl-6 ml-3.5 border-l-2 border-[var(--border-color)] pb-3">
          <div class="pt-2">
            <TaskBranch
              tasks={props.node.children}
              level={(props.level ?? 0) + 1}
              defaultExpanded={props.defaultExpanded}
              expansion={props.expansion}
              emptyState={props.emptyState}
            />
          </div>
        </div>
      </Show>
    </li>
  );
}
