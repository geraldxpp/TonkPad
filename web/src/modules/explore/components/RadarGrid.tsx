/** The radar's rings, crosshair, ticks and dust, exactly as drawn in the reference. */
export function RadarGrid() {
  return (
    <svg width="300" height="300" viewBox="0 0 300 300" fill="none" aria-hidden="true" className="absolute top-0 left-0">
      <circle cx="150" cy="150" r="149" className="fill-accent" fillOpacity="0.04" />
      <circle cx="150" cy="150" r="149" className="stroke-accent" strokeOpacity="0.32" />
      <circle cx="150" cy="150" r="112" className="stroke-accent" strokeOpacity="0.22" />
      <circle cx="150" cy="150" r="75" className="stroke-accent" strokeOpacity="0.18" />
      <circle cx="150" cy="150" r="38" className="stroke-accent" strokeOpacity="0.16" />
      <path d="M1 150H299M150 1V299" className="stroke-accent" strokeOpacity="0.12" />
      <path
        d="M255.36 255.36L248.29 248.29M44.64 255.36L51.71 248.29M44.64 44.64L51.71 51.71M255.36 44.64L248.29 51.71"
        className="stroke-accent"
        strokeOpacity="0.4"
      />
      <circle cx="60" cy="95" r="2" className="fill-neon" fillOpacity="0.55" />
      <circle cx="212" cy="70" r="1.8" className="fill-accent" fillOpacity="0.6" />
      <circle cx="240" cy="190" r="2" className="fill-accent" fillOpacity="0.5" />
      <circle cx="95" cy="215" r="1.6" className="fill-neon" fillOpacity="0.5" />
      <circle cx="180" cy="240" r="2.2" className="fill-accent" fillOpacity="0.45" />
      <circle cx="120" cy="60" r="1.5" className="fill-accent" fillOpacity="0.6" />
      <circle cx="40" cy="170" r="1.6" className="fill-neon" fillOpacity="0.45" />
    </svg>
  );
}
