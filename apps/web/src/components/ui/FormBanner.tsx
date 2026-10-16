import type { ReactNode } from "react";
import "./FormBanner.css";

export function FormBanner({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div className={`form-banner form-banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
