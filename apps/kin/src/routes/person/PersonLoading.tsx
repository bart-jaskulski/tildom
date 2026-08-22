import { For } from "solid-js";
import styles from "./person.module.css";

export default function PersonLoading() {
  return (
    <section class={styles.loading} role="status" aria-live="polite">
      <span class="visually-hidden">Opening person</span>
      <aside class={`${styles.sidebar} ${styles.loadingSidebar}`} aria-hidden="true">
        <section class={styles.sidebarBlock}>
          <div class={styles.profileHeading}>
            <div class={styles.loadingProfile}><span class={styles.loadingTitle} /><span class={styles.loadingShortLine} /></div>
            <span class={styles.loadingAction} />
          </div>
          <dl class={styles.parameters}>
            <For each={[0, 1, 2]}>{() => <div><dt class={styles.loadingLabel} /><dd class={styles.loadingLine} /></div>}</For>
          </dl>
        </section>
        <section class={styles.sidebarBlock}>
          <div class={styles.blockHeading}><span class={styles.loadingHeading} /><span class={styles.loadingAction} /></div>
          <ul class={styles.relationshipList}>
            <For each={[0, 1]}>{() => <li><span class={styles.loadingLine} /><span class={styles.loadingAction} /></li>}</For>
          </ul>
        </section>
        <section class={styles.sidebarBlock}>
          <div class={styles.blockHeading}><span class={styles.loadingHeading} /></div>
          <div class={styles.loadingTags}><span /><span /><span /></div>
        </section>
      </aside>
      <section class={`${styles.log} ${styles.loadingLog}`} aria-hidden="true">
        <div class={styles.loadingComposer}><span /><div><span /><span /></div></div>
        <div class={`${styles.timeline} ${styles.loadingTimeline}`}>
          <For each={[0, 1, 2]}>{() => (
            <article class={styles.timelineItem}>
              <span class={styles.marker} />
              <div class={styles.loadingNoteMeta}><span /><span /></div>
              <span class={styles.loadingNoteLine} /><span class={`${styles.loadingNoteLine} ${styles.loadingNoteLineShort}`} />
            </article>
          )}</For>
        </div>
      </section>
    </section>
  );
}
