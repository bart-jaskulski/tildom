import { createMemo, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import TaskPrompt from "~/components/TaskPrompt";
import TasksList from "~/components/TasksList";
import {
  createTaskPriorityComparator,
  isTaskStalledForMainView,
} from "~/lib/taskPriority";
import {
  DEFAULT_LIST_FILTER,
  listFilter,
  LIST_FILTER_OPTIONS,
  setListFilter,
  type ListFilter,
} from "~/stores/preferencesStore";
import {
  selectedWorkspaceId,
  selectWorkspace,
  tasks,
  workspaces,
  type TreeNode,
} from "~/stores/taskStore";

const FILTER_LABELS: Record<ListFilter, string> = {
  all: "ALL",
  active: "ACTIVE",
  completed: "COMPLETED",
  stalled: "STALLED",
};

const matchesFilter = (task: TreeNode, filterMode: ListFilter) => {
  if (filterMode === "all") {
    return true;
  }

  if (filterMode === "active") {
    return !task.completed;
  }

  if (filterMode === "completed") {
    return task.completed;
  }

  return isTaskStalledForMainView(task);
};

const projectVisibleTasks = (nodes: TreeNode[], filterMode: ListFilter): TreeNode[] =>
  nodes.flatMap((node) => {
    const children = projectVisibleTasks(node.children, filterMode);

    // Keep matching descendants attached to their parent so the tree stays legible.
    if (!matchesFilter(node, filterMode) && children.length === 0) {
      return [];
    }

    return [{ ...node, children }];
  });

const sortTasksByPriority = (nodes: TreeNode[], now: number): TreeNode[] => {
  const compare = createTaskPriorityComparator<TreeNode>(now);

  return nodes
    .map((node) => ({
      ...node,
      children: sortTasksByPriority(node.children, now),
    }))
    .sort(compare);
};

export default function Home() {
  const [fabVisible, setFabVisible] = createSignal(true);
  let lastScrollY = 0;

  const visibleTasks = createMemo(() => {
    const now = Date.now();
    const projected = projectVisibleTasks(tasks(), listFilter());
    return sortTasksByPriority(projected, now);
  });

  const emptyStateMessage = createMemo(() => {
    if (listFilter() === "active") {
      return "No active tasks in this workspace.";
    }

    if (listFilter() === "completed") {
      return "No completed tasks in this workspace.";
    }

    if (listFilter() === "stalled") {
      return "No stalled tasks in this workspace.";
    }

    return "No tasks in this workspace yet.";
  });

  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement;
    const currentScrollY = target.scrollTop;

    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      setFabVisible(false);
    } else {
      setFabVisible(true);
    }

    lastScrollY = currentScrollY;
  };

  return (
    <div class="min-h-screen flex flex-col font-mono text-[var(--fg-default)] bg-[var(--bg-canvas)]">
      <Title>do.tildom</Title>

      {/* TUI Top Navigation Bar */}
      <header class="tui-topbar">
        <div class="tui-brand">
          <span class="tui-logo">~</span>
          <span class="tui-title">do.tildom</span>
        </div>
        <nav class="tui-nav">
          <A href="/" end>[ tasks.db ]</A>
          <A href="/settings">[ settings.json ]</A>
          <A href="/pair">[ pair.conf ]</A>
        </nav>
      </header>

      {/* Main Container */}
      <div class="tui-container max-w-xl mx-auto flex-1 pb-40">
        
        {/* Workspace Switcher in TUI Style */}
        <section class="mb-6">
          <h2 class="tui-heading">■ Workspaces</h2>
          <div class="flex flex-wrap gap-x-4 gap-y-2 mt-2">
            <For each={workspaces()}>
              {(workspace) => {
                const isSelected = () => selectedWorkspaceId() === workspace.id;
                return (
                  <button
                    type="button"
                    onClick={() => void selectWorkspace(workspace.id)}
                    class="font-mono text-sm hover:text-[var(--syntax-keyword)] transition-colors cursor-pointer select-none"
                  >
                    {isSelected() ? `(*) ${workspace.name}` : `( ) ${workspace.name}`}
                  </button>
                );
              }}
            </For>
          </div>
        </section>

        {/* List Filters in Bracket-TUI Style */}
        <section class="mb-6">
          <h2 class="tui-heading">■ Filter</h2>
          <div class="flex flex-wrap gap-x-4 mt-2">
            <For each={LIST_FILTER_OPTIONS}>
              {(option) => {
                const isSelected = () => listFilter() === option;
                return (
                  <button
                    type="button"
                    onClick={() => setListFilter(option)}
                    class="font-mono text-sm hover:text-[var(--syntax-keyword)] transition-colors cursor-pointer select-none"
                  >
                    {isSelected() ? `[x] ${FILTER_LABELS[option]}` : `[ ] ${FILTER_LABELS[option]}`}
                  </button>
                );
              }}
            </For>
          </div>
        </section>

        {/* Task List Header */}
        <div class="border-b border-[var(--fg-default)] pb-1 mb-4 flex justify-between items-end">
          <span class="text-xs font-bold text-[var(--fg-muted)] tracking-wider">
            {`BUFFER: tasks.db (${visibleTasks().length} items)`}
          </span>
          <span class="text-xs font-bold text-[var(--fg-muted)]">
            ORDER: URGENCY_RANKING
          </span>
        </div>

        {/* Tasks List */}
        <main 
          class="flex-1 overflow-y-auto min-h-[300px]"
          onScroll={handleScroll}
        >
          <TasksList
            tasks={visibleTasks()}
            emptyState={
              <div class="py-12 text-center text-[var(--fg-muted)] font-mono border-t border-[var(--border-color)]">
                {emptyStateMessage()}
              </div>
            }
          />
        </main>
      </div>

      {/* TUI Quick Composer */}
      <TaskPrompt visible={fabVisible()} />
    </div>
  );
}
