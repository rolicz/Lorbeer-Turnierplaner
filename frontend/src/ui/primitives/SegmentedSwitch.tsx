type Primitive = string | number | boolean;

export type SegmentedOption<T extends Primitive> = {
  key: T;
  label: string;
  icon?: string;
};

export default function SegmentedSwitch<T extends Primitive>({
  value,
  onChange,
  options,
  widthClass = "w-14 sm:w-20",
  ariaLabel,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  widthClass?: string;
  ariaLabel: string;
  title?: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );

  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label={ariaLabel}
      title={title}
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + widthClass}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {options.map((x) => (
        <button
          key={String(x.key)}
          type="button"
          onClick={() => onChange(x.key)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            widthClass +
            " " +
            (value === x.key ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.key}
        >
          {x.icon ? <i className={"fa-solid " + x.icon} aria-hidden="true" /> : null}
          <span className={x.icon ? "hidden sm:inline" : undefined}>{x.label}</span>
        </button>
      ))}
    </div>
  );
}
