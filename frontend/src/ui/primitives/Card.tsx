import React from "react";

export default function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${className}`}>
      <div className="px-1 pb-1">
        <div>
          {children}
        </div>
      </div>
    </section>
  );
}
