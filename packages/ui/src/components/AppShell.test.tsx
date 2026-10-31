import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders header, brand, and content", () => {
    render(() => (
      <AppShell appName="test" appTitle="~ test app">
        <p>Main content area</p>
      </AppShell>
    ));

    expect(screen.getByText("~ test app")).toBeInTheDocument();
    expect(screen.getByText("Main content area")).toBeInTheDocument();
  });
});
