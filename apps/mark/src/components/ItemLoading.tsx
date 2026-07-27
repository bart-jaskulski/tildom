import styles from "./ItemLoading.module.css";

export default function ItemLoading() {
  return (
    <article class={styles.loading} role="status" aria-live="polite">
      <span class="visually-hidden">Loading item</span>
      <span class={`${styles.line} ${styles.meta}`} aria-hidden="true" />
      <span class={`${styles.line} ${styles.title}`} aria-hidden="true" />
      <span class={`${styles.line} ${styles.url}`} aria-hidden="true" />
      <span class={`${styles.line} ${styles.body}`} aria-hidden="true" />
    </article>
  );
}
