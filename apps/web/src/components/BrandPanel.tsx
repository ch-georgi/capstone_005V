import "./BrandPanel.css";

export function BrandPanel() {
  return (
    <aside className="brand-panel" aria-label="WellQ">
      <div className="brand-panel-blob blob-1" aria-hidden="true" />
      <div className="brand-panel-blob blob-2" aria-hidden="true" />

      <div className="brand-panel-content">
        <div className="brand-panel-mark">
          <span className="brand-panel-mark-glyph">Q</span>
        </div>
        <h2 className="brand-panel-tagline">
          Historial documental médico, organizado y seguro.
        </h2>
      </div>
    </aside>
  );
}
