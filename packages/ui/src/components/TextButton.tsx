import type { JSX } from "solid-js";
import Button, { type ButtonProps } from "./Button";

export type TextButtonProps = Omit<ButtonProps, "variant"> & {
  inline?: boolean;
};

export default function TextButton(props: TextButtonProps) {
  return <Button {...props} variant="text" inline={props.inline} />;
}
