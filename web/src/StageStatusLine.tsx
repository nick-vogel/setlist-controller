import { stageStatus, type StageSnapshot } from './stage-status.ts';

// The stage status line: one line pinned to the top of the leader page while it scrolls. On the
// leader page it also says the server is out of reach, in the Reconnecting banner's colours, in
// place of the banner, which would cover it. Not sticky, it is the module that the configurable
// layout (setlist-controller#7) puts on the producer and view-only pages.
export function StageStatusLine({ snapshot, connected, sticky = true }: { snapshot: StageSnapshot; connected: boolean; sticky?: boolean }) {
  const status = stageStatus(snapshot, connected);
  const classes = ['stage-status', sticky && 'sticky', `stage-status-${status.kind}`].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-label="Stage status">
      {status.kind === 'server-lost' && (
        <span className="stage-status-message" role="status">
          {status.label}
        </span>
      )}
      {status.kind === 'live-lost' && <span className="stage-status-message">{status.label}</span>}
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
