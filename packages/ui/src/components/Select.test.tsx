import { render, screen, fireEvent } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import Select from "./Select";

it("keeps native select behavior and forwards form attributes", () => {
  const onChange = vi.fn();
  render(() => (
    <Select aria-label="Month" name="month" required onChange={onChange}>
      <option value="1">January</option>
      <option value="2">February</option>
    </Select>
  ));
  const select = screen.getByRole("combobox", { name: "Month" }) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "2" } });
  expect(select.value).toBe("2");
  expect(select.required).toBe(true);
  expect(select.name).toBe("month");
  expect(onChange).toHaveBeenCalledOnce();
});
