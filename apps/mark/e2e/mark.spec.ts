import { test, expect } from "@playwright/test";

test.describe("Mark Acceptance Tests (Local-First & Behavioral)", () => {
  test.beforeEach(async ({ page }) => {
    // Open app and wait for the database store to be ready and editor to mount
    await page.goto("/");
    await expect(page.getByRole("status")).not.toBeVisible();
    await expect(page.locator("#entry-body-cm")).toBeVisible();
  });

  test("creates a note with hashtags, navigates via j/k, and persists in OPFS across reload", async ({ page }) => {
    const editor = page.locator("#entry-body-cm");
    await editor.click();
    await editor.fill("Project brainstorm\nReview architecture decisions\n#architecture #local-first");

    // Save entry
    const saveButton = page.getByRole("button", { name: "save", exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Verify observable result: note rendered with title and tags
    const entryRow = page.locator("[data-entry-row]").filter({ hasText: "Project brainstorm" });
    await expect(entryRow).toBeVisible();
    await expect(entryRow.getByRole("link", { name: "#architecture" })).toBeVisible();
    await expect(entryRow.getByRole("link", { name: "#local-first" })).toBeVisible();

    // Test Vim list navigation: blur editor, press 'j' to select first item
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await expect(entryRow).toHaveAttribute("data-active", "");

    // Test Local-First Invariant: hard reload browser and verify OPFS SQLite persistence
    await page.reload();
    await expect(page.getByRole("status")).not.toBeVisible();
    await expect(page.locator("#entry-body-cm")).toBeVisible();

    const reloadedRow = page.locator("[data-entry-row]").filter({ hasText: "Project brainstorm" });
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow.getByRole("link", { name: "#architecture" })).toBeVisible();
    await expect(reloadedRow.getByRole("link", { name: "#local-first" })).toBeVisible();
  });

  test("creates a URL bookmark with perimeter-intercepted metadata enrichment and persists across reload", async ({ page }) => {
    // Intercept ONLY at the external HTTP perimeter
    await page.route("**/v1/mark/metadata", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title: "Local-First Software Manifesto",
          excerpt: "You own your data, in spite of the cloud.",
          capture: null,
        }),
      });
    });

    const editor = page.locator("#entry-body-cm");
    await editor.click();
    await editor.fill("https://localfirst.org/manifesto");

    const saveButton = page.getByRole("button", { name: "save", exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Verify observable result: title and excerpt enriched from metadata
    const entryRow = page.locator("[data-entry-row]").filter({ hasText: "Local-First Software Manifesto" });
    await expect(entryRow).toBeVisible();
    await expect(entryRow.getByText("You own your data, in spite of the cloud.")).toBeVisible();

    // Test Local-First Invariant: hard reload browser and verify OPFS SQLite persistence
    await page.reload();
    await expect(page.getByRole("status")).not.toBeVisible();
    await expect(page.locator("#entry-body-cm")).toBeVisible();

    const reloadedRow = page.locator("[data-entry-row]").filter({ hasText: "Local-First Software Manifesto" });
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow.getByText("You own your data, in spite of the cloud.")).toBeVisible();
  });

  test("maintains keyboard focus integrity so typing inside editor never triggers Vim shortcuts", async ({ page }) => {
    const editor = page.locator("#entry-body-cm");
    await editor.click();

    // Type characters that correspond to global Vim navigation shortcuts ('j', 'k', '/')
    await editor.pressSequentially("just checking / search keys");

    // Verify editor received the text
    await expect(editor).toContainText("just checking / search keys");

    // Verify no background rows were selected or active
    const activeRows = page.locator("[data-entry-row][data-active]");
    await expect(activeRows).toHaveCount(0);
  });
});
