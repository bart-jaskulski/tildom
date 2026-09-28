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
  let addDialog: HTMLDialogElement | undefined;
  let nameInput: HTMLInputElement | undefined;

  const open = () => {
    addDialog?.showModal();
    queueMicrotask(() => nameInput?.focus());
  };

  const reset = () => {
    setName("");
  };

  const add = async (event: SubmitEvent) => {
    event.preventDefault();
    const id = await createContact(name());
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
          <h2>Add person</h2>
          <label>Name you use<input ref={nameInput} class="kin-input" value={name()} placeholder="e.g. Mum / Alex from climbing" onInput={(event) => setName(event.currentTarget.value)} required /></label>
          <div class={styles.dialogActions}>
            <button type="button" class="kin-button" onClick={() => addDialog?.close()}>cancel</button>
            <button type="submit" class="kin-primary-button">add record</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
