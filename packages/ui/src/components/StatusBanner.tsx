import { JSX, splitProps } from "solid-js";
import styles from "./StatusBanner.module.css";

export interface StatusBannerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  type?: "status" | "error";
}

export default function StatusBanner(props: StatusBannerProps) {
  const [local, others] = splitProps(props, ["type", "class", "children"]);

  const bannerClass = () => {
    const isError = local.type === "error";
    return `${styles.banner} ${isError ? styles.error : styles.status} ${local.class ?? ""}`.trim();
  };

  return (
    <div
      class={bannerClass()}
      role={local.type === "error" ? "alert" : "status"}
      {...others}
    >
      {local.children}
    </div>
  );
}
