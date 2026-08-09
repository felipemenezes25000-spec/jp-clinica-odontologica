import { ReactNode } from "react";

export function SectionPortal({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="section-portal" aria-hidden="true">
      <span>{label ?? "JP"}</span>
      <div className="section-portal-line" />
      <span>{children}</span>
    </div>
  );
}
