import { createSignal, onMount } from "solid-js";
import { createContact } from "~/stores/contactStore";
import styles from "~/routes/index.module.css";

export type AddPersonHandle = { open: () => void };

type Props = {
  ref?: (handle: AddPersonHandle) => void;
  onCreated: (id: string) => void;
};

export default function AddPerson(props: Props) {
  const [name, setName] = createSignal("");
  const [relationship, setRelationship] = createSignal("");
  const [location, setLocation] = createSignal("");
  let addDialog: HTMLDialogElement | undefined;
  let nameInput: HTMLInputElement | undefined;

  const open = () => {
    addDialog?.showModal();
    queueMicrotask(() => nameInput?.focus());
  };

  const reset = () => {
    setName(""); setRelationship(""); setLocation("");
  };

  const add = async (event: SubmitEvent) => {
    event.preventDefault();
    const id = await createContact(name(), relationship(), location());
    reset();
    addDialog?.close();
    props.onCreated(id);
  };

  onMount(() => props.ref?.({ open }));

  return (
    <>
      <div class={styles.toolbar}>
        <button type="button" class="kin-primary-button" onClick={open}>add person</button>
      </div>
      <dialog ref={addDialog} class={styles.addDialog} onClose={reset}>
        <form method="dialog" class={styles.dialogForm} onSubmit={add}>
          <h2>Add record to people.db</h2>
          <label>Full name<input ref={nameInput} class="kin-input" value={name()} placeholder="e.g. John Doe" onInput={(event) => setName(event.currentTarget.value)} required /></label>
          <label>Relationship type<input class="kin-input" value={relationship()} placeholder="e.g. colleague / friend / family" onInput={(event) => setRelationship(event.currentTarget.value)} /></label>
          <label>Location<input class="kin-input" value={location()} placeholder="e.g. Berlin, DE" onInput={(event) => setLocation(event.currentTarget.value)} /></label>
          <div class={styles.dialogActions}>
            <button type="button" class="kin-button" onClick={() => addDialog?.close()}>cancel</button>
            <button type="submit" class="kin-primary-button">add record</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
