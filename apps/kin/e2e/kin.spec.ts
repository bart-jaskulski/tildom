import { test, expect } from "@playwright/test";

test.describe("Kin Acceptance Tests (Local-First & Behavioral)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for local database directory to initialize and loading status to detach
    await expect(page.getByRole("status")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "add person" })).toBeVisible();
  });

  test("creates a contact, logs a timeline note with tags, and persists across OPFS reload", async ({ page }) => {
    // 1. Add contact via modal dialog
    await page.getByRole("button", { name: "add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("e.g. Mum / Alex from climbing").fill("Grace Hopper");
    await dialog.getByRole("button", { name: "add record" }).click();
    await expect(dialog).not.toBeVisible();

    // 2. Automatically routed to person detail page (/person/grace-hopper)
    await expect(page).toHaveURL(/\/person\/grace-hopper/);
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();

    // 3. Write a timeline note with #tags
    const editor = page.locator("#new-note .cm-content");
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill("Discussed early compiler designs and #nanoseconds demonstration #compiler");

    await page.getByRole("button", { name: "add entry" }).click();

    // 4. Verify observable result: note in timeline and tags in sidebar index
    const timeline = page.getByLabel("Grace Hopper timeline");
    await expect(timeline.getByText("Discussed early compiler designs and #nanoseconds demonstration #compiler")).toBeVisible();
    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("button", { name: "#nanoseconds" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "#compiler" })).toBeVisible();

    // 5. Local-First Invariant: hard reload browser and verify OPFS SQLite persistence
    await page.reload();
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();
    await expect(timeline.getByText("Discussed early compiler designs and #nanoseconds demonstration #compiler")).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "#nanoseconds" })).toBeVisible();

    // 6. Return to directory and verify contact appears in directory list
    await page.getByRole("link", { name: /people\.db/i }).click();
    await expect(page.locator("[data-person-row]").filter({ hasText: "Grace Hopper" })).toBeVisible();
  });

  test("maps symmetrical relationships between contacts and persists across reload", async ({ page }) => {
    // Helper to create a person from the home directory
    const addPerson = async (name: string) => {
      await page.goto("/");
      await expect(page.getByRole("status")).not.toBeVisible();
      await page.getByRole("button", { name: "add person" }).click();
      const dialog = page.getByRole("dialog", { name: "Add person" });
      await dialog.getByPlaceholder("e.g. Mum / Alex from climbing").fill(name);
      await dialog.getByRole("button", { name: "add record" }).click();
      await expect(dialog).not.toBeVisible();
    };

    // 1. Create two contacts so relationships can be formed
    await addPerson("Grace Hopper");
    await addPerson("Ada Lovelace");
    await expect(page).toHaveURL(/\/person\/ada-lovelace/);

    // 2. Add relationship: Ada Lovelace is mentor to Grace Hopper
    const addRelationshipButton = page.getByRole("button", { name: "[ add ]" });
    await expect(addRelationshipButton).toBeVisible();
    await addRelationshipButton.click();

    await page.getByLabel("Related person").selectOption({ label: "Grace Hopper" });
    await page.getByLabel("Relationship type").fill("mentor");
    await page.getByRole("button", { name: "save" }).click();

    // 3. Verify on Ada's page: relationship shows Mentor: Grace Hopper
    await expect(page.getByText("Mentor: Grace Hopper")).toBeVisible();

    // 4. Navigate to Grace Hopper's page: verify inverse role Mentee: Ada Lovelace is rendered!
    await page.goto("/");
    await expect(page.getByRole("status")).not.toBeVisible();
    await page.locator("[data-person-row]").filter({ hasText: "Grace Hopper" }).click();
    await expect(page.getByText("Mentee: Ada Lovelace")).toBeVisible();

    // 5. Local-First Invariant: reload and verify reciprocal link persisted in SQLite
    await page.reload();
    await expect(page.getByText("Mentee: Ada Lovelace")).toBeVisible();
  });

  test("filters contacts via timeline tag search", async ({ page }) => {
    // 1. Create a contact with a tagged timeline note
    await page.getByRole("button", { name: "add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });
    await dialog.getByPlaceholder("e.g. Mum / Alex from climbing").fill("Grace Hopper");
    await dialog.getByRole("button", { name: "add record" }).click();
    await expect(page).toHaveURL(/\/person\/grace-hopper/);

    const editor = page.locator("#new-note .cm-content");
    await editor.click();
    await editor.fill("Working on #compiler optimizations");
    await page.getByRole("button", { name: "add entry" }).click();

    // 2. Create a second contact without that tag
    await page.goto("/");
    await expect(page.getByRole("status")).not.toBeVisible();
    await page.getByRole("button", { name: "add person" }).click();
    const dialog2 = page.getByRole("dialog", { name: "Add person" });
    await dialog2.getByPlaceholder("e.g. Mum / Alex from climbing").fill("Ada Lovelace");
    await dialog2.getByRole("button", { name: "add record" }).click();
    await expect(page).toHaveURL(/\/person\/ada-lovelace/);

    // 3. Search for #compiler tag from home page
    await page.goto("/");
    await expect(page.getByRole("status")).not.toBeVisible();
    const searchInput = page.locator("[data-kin-search]");
    await searchInput.fill("#compiler");

    // Only Grace Hopper matches this tag in the timeline
    await expect(page.locator("[data-person-row]")).toHaveCount(1);
    await expect(page.locator("[data-person-row]").filter({ hasText: "Grace Hopper" })).toBeVisible();
    await expect(page.locator("[data-person-row]").filter({ hasText: "Ada Lovelace" })).toHaveCount(0);
  });
});
