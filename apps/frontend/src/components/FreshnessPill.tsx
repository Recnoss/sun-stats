import type { SourceFreshness } from "../types.js";

interface FreshnessPillProps {
  label: string;
  freshness: SourceFreshness;
}

export function FreshnessPill({ label, freshness }: FreshnessPillProps) {
  return (
    <div className={`led led--${freshness}`}>
      <span className="led__dot" />
      <span>{label}</span>
    </div>
  );
}
