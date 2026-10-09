# Do design

Follow the suite [DESIGN.md](../../DESIGN.md) and this app's [PRODUCT.md](./PRODUCT.md).

`@tildom/ui/base.css` owns design tokens and global defaults. Use `@tildom/ui` controls
for shared appearance and interactions; keep app CSS for domain layouts and specialized editors.
Do not maintain a separate copy of the suite's palette or component styles here.
