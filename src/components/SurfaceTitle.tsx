/** Heading for the visible communication surface; receives focus on surface changes. */
export function SurfaceTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="surface-head">
      <h1 className="surface-title" tabIndex={-1} data-surface-title="">{children}</h1>
      {sub ? <p className="surface-sub">{sub}</p> : null}
    </div>
  );
}
