/**
 * One settings group: a `card` with a `text-sm font-semibold` title (`DESIGN.md` §6, a head
 * inside a card). Its own module since L7, because `SecuritySection` renders three of them and
 * `SettingsPage` the rest — one look for every group on the page.
 */
export default function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // `min-w-0`: a grid item defaults to `min-width: auto`, so one unbreakable
    // line inside (a crash message, a stack frame) would widen the whole page.
    <section className="card min-w-0">
      <h2 className="mb-3 text-sm font-semibold text-text-normal">{title}</h2>
      {children}
    </section>
  );
}
