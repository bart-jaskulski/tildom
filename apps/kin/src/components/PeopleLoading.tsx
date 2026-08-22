import { For } from "solid-js";
import styles from "./PeopleLoading.module.css";

export default function PeopleLoading() {
  return (
    <section class={styles.loading} role="status" aria-live="polite">
      <span class="visually-hidden">Opening local directory</span>
      <ol class={styles.list} aria-hidden="true">
        <For each={[0, 1, 2]}>{() => <li class={styles.row}><span class={styles.line} /><span class={styles.line} /></li>}</For>
      </ol>
    </section>
  );
}
