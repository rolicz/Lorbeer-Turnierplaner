import React from "react";

export default function FormLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className ? `input-label ${className}` : "input-label"}>{children}</div>;
}
