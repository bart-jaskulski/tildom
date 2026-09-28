import { Title } from "@solidjs/meta";
import { Button } from "@tildom/ui";

export default function NotFound() {
  return (
    <>
      <Title>Not Found | mark.tildom</Title>
      <h1 class="hn-heading">Page not found</h1>
      <p class="hn-muted">That local route does not exist.</p>
      <Button href="/">back to new</Button>
    </>
  );
}
