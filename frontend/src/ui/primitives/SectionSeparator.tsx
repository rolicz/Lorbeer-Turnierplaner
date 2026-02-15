import { cn } from "../cn";

export default function SectionSeparator({
  id,
  title,
  className,
  titleClassName,
  children,
}: {
  id?: string;
  title?: React.ReactNode;
  className?: string;
  titleClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mt-3 border-t border-border-card-outer/70 pt-3 scroll-mt-[calc(env(safe-area-inset-top,0px)+160px)]",
        className
      )}
    >
      {title ? (
        <div className={cn("mb-2 text-sm font-semibold text-text-normal", titleClassName)}>
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}
