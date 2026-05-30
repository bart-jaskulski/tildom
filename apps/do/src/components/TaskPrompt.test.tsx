import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskPrompt from "./TaskPrompt";

vi.mock("~/stores/taskStore", () => ({
  addTask: vi.fn(),
  setTaskExpanded: vi.fn(),
}));

vi.mock("~/stores/networkStore", () => ({
  isOnline: () => true,
}));

vi.mock("~/stores/preferencesStore", () => ({
  breakdownGranularity: () => "medium",
}));

describe("TaskPrompt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose hidden composer controls while closed", () => {
    render(() => <TaskPrompt visible={true} />);

    expect(screen.getByText("[ ADD NEW TASK ]")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Task description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Choose due date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable AI breakdown")).not.toBeInTheDocument();
  });

  it("adds explicit labels to icon-driven controls when opened", async () => {
    render(() => <TaskPrompt visible={true} />);

    await fireEvent.click(screen.getByText("[ ADD NEW TASK ]"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Close task composer")).toBeInTheDocument();
    expect(screen.getByLabelText("Task description")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose due date")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable AI breakdown")).toBeInTheDocument();
    expect(screen.getByLabelText("Create task")).toBeInTheDocument();
  });
});
