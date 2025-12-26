export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
      <div className="mb-3 text-lg font-semibold">{title}</div>
      {children}
    </section>
  );
}
