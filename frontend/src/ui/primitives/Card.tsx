import React from "react";

export default function Card({
  title,
  children,
  variant = "card",
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "card" | "plain";
  className?: string;
}) {
  const base = variant === "card" ? "p-4" : "";
  const chrome = variant === "card" ? "surface-card shadow-sm" : "";

  return (
    <section className={`${base} ${chrome} ${className}`}>
      <div className="mb-3 text-lg font-semibold">{title}</div>
      {children}
    </section>
  );
}
