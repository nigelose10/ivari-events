/**
 * Ambient Background — 6 slow-drifting color orbs + noise texture
 * creating the "Open Meditations" atmosphere behind Liquid Glass UI.
 */
export function AmbientBackground() {
  return (
    <>
      <div className="ambient-bg" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
        <div className="ambient-orb ambient-orb-4" />
        <div className="ambient-orb ambient-orb-5" />
        <div className="ambient-orb ambient-orb-6" />
      </div>
      <div className="noise-overlay" aria-hidden="true" />
    </>
  );
}
