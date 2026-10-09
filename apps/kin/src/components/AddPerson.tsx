import { Button, Dialog, Input } from "@tildom/ui";
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
        <Button type="button" class="kin-primary-button" onClick={open}>add person</Button>
      </div>
      <Dialog ref={(element) => { addDialog = element; }} class={styles.addDialog} onClose={reset} ariaLabel="Add person" hideCloseButton>
        <form method="dialog" class={styles.dialogForm} onSubmit={add}>
          <h2>Add person</h2>
          <label>Name you use<Input ref={nameInput} class="kin-input" value={name()} placeholder="e.g. Mum / Alex from climbing" onInput={(event) => setName(event.currentTarget.value)} required /></label>
          <div class={styles.dialogActions}>
            <Button type="button" class="kin-button" onClick={() => addDialog?.close()}>cancel</Button>
            <Button type="submit" class="kin-primary-button">add record</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
