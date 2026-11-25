import { stageStatus, type StageStatusInput } from './stage-status.ts';

// Compact one-line stage status bar: always pinned at the top of the leader page while scrolling,
// and self-contained so configurable performance layouts can also expose it as an optional module
// on producer and viewer pages.
export function StageStatusLine({
  connected,
  live,
  set,
  playing,
  now,
  jump,
  countIn,
  sticky = true,
}: StageStatusInput & { sticky?: boolean }) {
  const status = stageStatus({ connected, live, set, playing, now, jump, countIn });
  const classes = ['stage-status', sticky && 'sticky', `stage-status-${status.kind}`].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-label="Stage status">
      {status.kind === 'disconnected' && (
        <span className="stage-status-state stage-status-state-disconnected">{status.label}</span>
      )}
      {status.kind === 'empty' && <span className="stage-status-message">{status.label}</span>}
      {status.kind === 'between' && (
        <>
          <span className={`stage-status-state stage-status-state-${status.transport.kind}`}>{status.transport.label}</span>
          <span className="stage-status-message">{status.label}</span>
        </>
      )}
      {status.kind === 'active' && (
        <>
          <span className={`stage-status-state stage-status-state-${status.transport.kind}`}>{status.transport.label}</span>
          <span className="stage-status-song">{status.song}</span>
          <span className="stage-status-sep" aria-hidden="true">
            ·
          </span>
          <span className="stage-status-section">{status.section}</span>
          {status.next !== null && (
            <span className="stage-status-next">
              <span className="stage-status-next-label">Next</span> {status.next}
            </span>
          )}
        </>
      )}
    </section>
  );
}
