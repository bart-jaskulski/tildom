import { createMemo, createSignal, For, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { RadioButton, EmptyState } from "@tildom/ui";
import AppNav from "~/components/AppNav";
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
  selectedSpaceId,
  selectSpace,
  tasks,
  spaces,
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
      return "No active tasks in this space.";
    }

    if (listFilter() === "completed") {
      return "No completed tasks in this space.";
    }

    if (listFilter() === "stalled") {
      return "No stalled tasks in this space.";
    }

    return "No tasks in this space yet.";
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
    <div class="do-page">
      <Title>do.tildom</Title>

      <AppNav active="tasks" />

      {/* Main Container */}
      <div class="tui-container">
        
        {/* Space Switcher in TUI Style */}
        <section class="do-section">
          <h2 class="tui-heading">Spaces</h2>
          <div class="do-radio-group">
            <For each={spaces()}>
              {(space) => {
                const isSelected = () => selectedSpaceId() === space.id;
                return (
                  <RadioButton
                    name="space"
                    checked={isSelected()}
                    onChange={() => void selectSpace(space.id)}
                    label={space.name}
                  />
                );
              }}
            </For>
          </div>
        </section>

        {/* List Filters in Bracket-TUI Style */}
        <section class="do-section">
          <h2 class="tui-heading">Filter</h2>
          <div class="do-radio-group">
            <For each={LIST_FILTER_OPTIONS}>
              {(option) => {
                const isSelected = () => listFilter() === option;
                return (
                  <RadioButton
                    name="task-filter"
                    checked={isSelected()}
                    onChange={() => setListFilter(option)}
                    label={FILTER_LABELS[option]}
                  />
                );
              }}
            </For>
          </div>
        </section>

        {/* Task List Header */}
        <div class="buffer-header">
          <span>
            {`BUFFER: tasks.db (${visibleTasks().length} items)`}
          </span>
          <span>
            ORDER: URGENCY_RANKING
          </span>
        </div>

        {/* Tasks List */}
        <main 
          class="task-scroll-area"
          onScroll={handleScroll}
        >
          <TasksList
            tasks={visibleTasks()}
            emptyState={
              <EmptyState message={emptyStateMessage()} />
            }
          />
        </main>
      </div>

      {/* TUI Quick Composer */}
      <TaskPrompt visible={fabVisible()} />
    </div>
  );
}
