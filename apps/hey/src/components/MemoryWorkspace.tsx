import { For, type Accessor, type Setter } from "solid-js";
import type { MemoryFile } from "../lib/types";
import styles from "./MemoryWorkspace.module.css";

type Props = {
  groups: Accessor<[string, MemoryFile[]][]>; active: Accessor<MemoryFile | undefined>; activePath: Accessor<string>;
  draft: Accessor<string>; setDraft: Setter<string>; mobileOpen: Accessor<boolean>; setMobileOpen: Setter<boolean>;
  openFile: (path: string) => Promise<void>; save: () => Promise<void>;
};

export default function MemoryWorkspace(props: Props) {
  return <section class={styles.layout} classList={{ [styles.mobileOpen]: props.mobileOpen() }}>
    <aside class={styles.fileList}>
      <For each={props.groups()}>{([directory, files]) => <section class={styles.fileGroup}>
        <p>{directory ? `▾ ${directory}/` : "memory/"}</p>
        <For each={files}>{file => <button class={styles.fileRow} classList={{ [styles.active]: file.path === props.activePath() }} onClick={() => void props.openFile(file.path)}><span aria-hidden="true">·</span><span>{directory ? file.path.slice(directory.length + 1) : file.path}</span></button>}</For>
      </section>}</For>
    </aside>
    <section class={styles.editor}>
      <div class={styles.heading}><button class={styles.back} type="button" aria-label="Back to memory files" onClick={() => props.setMobileOpen(false)}>←</button><h1>{props.active()?.path}</h1></div>
      <textarea aria-label={`Edit ${props.active()?.path || "memory file"}`} value={props.draft()} onInput={event => props.setDraft(event.currentTarget.value)} />
      <footer><button class="button primary" disabled={!props.active() || props.draft() === props.active()?.content} onClick={() => void props.save()}>save file</button></footer>
    </section>
  </section>;
}
