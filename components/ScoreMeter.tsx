import type { FitEvidence } from "@domain";

/**
 * Renders one participant's affinity as a labelled meter.
 *
 * Affinity is a relative provider signal, not a percentage of enjoyment, so the
 * numeric value is shown and the scale is described in words. An unknown is
 * drawn as a hatched "unknown" bar and never as zero, because unknown is not
 * dislike.
 */
export function ScoreMeter({
  label,
  evidence,
}: {
  label: string;
  evidence: FitEvidence | undefined;
}) {
  const affinity = evidence?.affinity ?? null;
  const isUnknown = affinity === null;
  const pct = affinity === null ? 100 : Math.max(3, Math.round(affinity * 100));

  return (
    <li className="score-row">
      <span>{label}</span>
      <span
        className={isUnknown ? "meter unknown" : "meter"}
        role="img"
        aria-label={
          isUnknown
            ? `Affinity for ${label} is unknown`
            : `Affinity ${affinity.toFixed(3)} for ${label} on a 0 to 1 relative scale`
        }
      >
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="mono" aria-hidden="true">
        {isUnknown ? "unknown" : affinity.toFixed(3)}
      </span>
    </li>
  );
}
