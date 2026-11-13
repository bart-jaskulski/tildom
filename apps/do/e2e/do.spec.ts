import { test, expect } from "@playwright/test";

test.describe("Do Acceptance Tests (Local-First & Behavioral)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the space radio to be active and ready
    await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
    await expect(page.getByText(/BUFFER: tasks\.db/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "[ ADD NEW TASK ]" })).toBeVisible();
  });

  test("creates a task with subtask, and persists across OPFS reload", async ({ page }) => {
    // 1. Open quick composer
    await page.getByRole("button", { name: "[ ADD NEW TASK ]" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 2. Fill task description and submit
    const textarea = page.getByRole("textbox", { name: "Task description" });
    await textarea.fill("Deliver Q3 tax filings #finance");
    await page.getByRole("button", { name: /create task/i }).click();
    await expect(dialog).not.toBeVisible();

    // 3. Verify task is rendered in the list
    await expect(page.getByText("Deliver Q3 tax filings #finance")).toBeVisible();

    // 4. Add an inline subtask
    await page.getByRole("button", { name: "[ + SUBTASK ]" }).click();
    const subtaskInput = page.getByPlaceholder("What needs to be done?");
    await expect(subtaskInput).toBeVisible();
    await subtaskInput.fill("Gather 1099 statements");
    await subtaskInput.press("Enter");

    // 5. Verify subtask is rendered under parent
    await expect(page.getByText("Gather 1099 statements")).toBeVisible();

    // 6. Local-First Invariant: hard reload browser and verify OPFS SQLite persistence
    await page.reload();
    await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
    await expect(page.getByText("Deliver Q3 tax filings #finance")).toBeVisible();

    // Subtasks on fresh load are collapsed behind the step indicator
    const showStepsButton = page.getByRole("button", { name: /show 1 subtask/i });
    await expect(showStepsButton).toBeVisible();
    await showStepsButton.click();
    await expect(page.getByText("Gather 1099 statements")).toBeVisible();
  });

  test("toggles task completion and preserves completed status across reload", async ({ page }) => {
    // 1. Create a task
    await page.getByRole("button", { name: "[ ADD NEW TASK ]" }).click();
    const textarea = page.getByRole("textbox", { name: "Task description" });
    await textarea.fill("Submit quarterly invoice");
    await page.getByRole("button", { name: /create task/i }).click();
    await expect(page.getByText("Submit quarterly invoice")).toBeVisible();

    // 2. Mark task complete via its checkbox label
    const taskRow = page.locator("li").filter({ hasText: "Submit quarterly invoice" });
    await taskRow.locator("label").first().click();

    // 3. Since the default filter is 'active', the completed task is filtered out of active view
    await expect(page.getByText("Submit quarterly invoice")).not.toBeVisible();

    // 4. Switch filter to 'COMPLETED'
    await page.getByText("COMPLETED", { exact: true }).click();
    await expect(page.getByText("Submit quarterly invoice")).toBeVisible();
    const completedCheckbox = page.locator("li").filter({ hasText: "Submit quarterly invoice" }).getByRole("checkbox", { name: "Mark task incomplete" });
    await expect(completedCheckbox).toBeChecked();

    // 5. Local-First Invariant: reload and verify completion status persists in OPFS SQLite
    await page.reload();
    await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
    await page.getByText("COMPLETED", { exact: true }).click();
    await expect(page.getByText("Submit quarterly invoice")).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Submit quarterly invoice" }).getByRole("checkbox", { name: "Mark task incomplete" })).toBeChecked();
  });

  test("performs AI task breakdown via intercepted perimeter API and persists hierarchy", async ({ page }) => {
    // 1. Intercept network call at perimeter boundary
    await page.route("**/v1/do/breakdown", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          action: "createTasks",
          title: "Build personal portfolio site",
          tasks: [
            { content: "Design clean typography system" },
            { content: "Write project case study" },
          ],
        }),
      });
    });

    // 2. Open task composer and enable AI breakdown
    await page.getByRole("button", { name: "[ ADD NEW TASK ]" }).click();
    await page.getByRole("textbox", { name: "Task description" }).fill("Build personal portfolio site");
    await page.getByText("AI Breakdown").click();

    // 3. Submit
    await page.getByRole("button", { name: /create task/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // 4. Verify parent task and generated subtasks are rendered
    await expect(page.getByText("Build personal portfolio site")).toBeVisible();
    await expect(page.getByText("Design clean typography system")).toBeVisible();
    await expect(page.getByText("Write project case study")).toBeVisible();

    // 5. Local-First Invariant: hard reload browser and verify all tasks persist from OPFS SQLite
    await page.reload();
    await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
    await expect(page.getByText("Build personal portfolio site")).toBeVisible();

    // Expand collapsed subtasks after reload
    const showStepsButton = page.getByRole("button", { name: /show 2 subtask/i });
    await expect(showStepsButton).toBeVisible();
    await showStepsButton.click();
    await expect(page.getByText("Design clean typography system")).toBeVisible();
    await expect(page.getByText("Write project case study")).toBeVisible();
  });
});
