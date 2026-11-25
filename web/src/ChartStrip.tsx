import type { Ref } from 'react';
import type { JumpTarget, Loop, NowPlaying, SetList } from '../../src/shared/snapshot.ts';
import { chartStrip } from './chart-strip.ts';

// The chart view's strip, pinned to the top of the screen over the blocks: Next, then the next
// section and the bars until it starts, with the next song's title before it in a song's last
// section. "Loop" alone while the loop is on, and "Last section" alone in the last section of the
// set's last song with no End, neither with Next or a countdown. Nothing while the playhead is in no
// section.
export function ChartStrip({
  set,
  now,
  jump,
  countIn,
  loop,
  ref,
}: {
  set: SetList;
  now: NowPlaying | null;
  jump: JumpTarget | null;
  countIn: boolean;
  loop: Loop | null;
  ref?: Ref<HTMLElement>;
}) {
  const strip = chartStrip(set, now, jump, countIn, loop);
  if (!strip) return null;
  return (
    <section ref={ref} className="chart-strip" aria-label="Next section">
      {strip.kind === 'loop' && <span className="chart-strip-loop">Loop</span>}
      {strip.kind === 'last' && <span className="chart-strip-section">Last section</span>}
      {strip.kind === 'next' && (
        <>
          <span className="label">Next</span>
          {strip.song !== null && <span className="chart-strip-song">{strip.song}</span>}
          <span className="chart-strip-section">{strip.section}</span>
          {strip.bars !== null && <span className="chart-strip-bars">{strip.bars === 1 ? 'in 1 bar' : `in ${strip.bars} bars`}</span>}
        </>
      )}
    </section>
  );
}
