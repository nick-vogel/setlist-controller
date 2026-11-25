import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import type { Command } from '../../src/shared/command.ts';
import { countInLandsOn } from '../../src/shared/count-in.ts';
import { activeSong } from '../../src/shared/safe-mode.ts';
import { sectionAt, songTitle, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';
import { CountInButton } from './CountInButton.tsx';
import type { LeaderView } from './device-settings.ts';
import { FadeOutButton } from './FadeOutButton.tsx';
import { LeaderViewSwitcher } from './LeaderViewSwitcher.tsx';
import { LiveNotConnected } from './NowPlaying.tsx';
import { SafeModeToggle } from './SafeModeToggle.tsx';
import { sectionControlState, sectionState } from './section-state.ts';
import { buildTimeline, PEEK_IDLE_MS } from './timeline-model.ts';
import { TimelinePauseButton } from './TimelinePauseButton.tsx';

// Pixels of horizontal pointer travel before a gesture becomes a drag rather than a tap.
const DRAG_THRESHOLD_PX = 8;

// Share of the timeline viewport to the left of the pinned playhead, leaving 75% ahead of the band.
const PLAYHEAD_RATIO = 0.25;

export function TimelineView({
  set,
  snapshot,
  connected,
  leaderView,
  onLeaderView,
  send,
}: {
  set: SetList;
  snapshot: Snapshot;
  connected: boolean;
  leaderView: LeaderView;
  onLeaderView(view: LeaderView): void;
  send(command: Command): void;
}) {
  const { live, playing, position, now, jump, countIn, loop, fade, songMeters, safeMode } = snapshot;
  const liveReady = connected && live === 'connected';
  const guardedSong = activeSong(countIn, jump, now);
  const playheadSong = set.songs.find((song) => song.number === now?.song);
  const playheadSection = now && playheadSong?.sections[now.section];

  const layout = useMemo(() => buildTimeline(set, songMeters, position), [set, songMeters, position]);
  const activeLoop = useMemo(() => layout.loopRect(loop), [layout, loop]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0) setViewportWidth(element.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const playheadOffset = Math.round(viewportWidth * PLAYHEAD_RATIO);

  // Whether the strip tracks Live's playhead automatically. Dragging or peeking detaches it,
  // showing Follow and returning automatically after PEEK_IDLE_MS of idle while Live plays.
  const [following, setFollowing] = useState(true);
  const [dragging, setDragging] = useState(false);

  // Re-attach to the live playhead whenever Live starts playing.
  const [prevPlaying, setPrevPlaying] = useState(playing);
  if (prevPlaying !== playing) {
    setPrevPlaying(playing);
    if (playing) setFollowing(true);
  }

  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const followingRef = useRef(following);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  const updateFollowing = useCallback((next: boolean) => {
    followingRef.current = next;
    setFollowing(next);
  }, []);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedScrollLeftRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef({ pointerId: -1, pointerType: '', startX: 0, startScrollLeft: 0, active: false, moved: false });

  const clearAutoReturn = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAutoReturn(), [clearAutoReturn]);

  const scheduleAutoReturn = useCallback(() => {
    clearAutoReturn();
    if (!playingRef.current) return;
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (playingRef.current && !dragRef.current.active) updateFollowing(true);
    }, PEEK_IDLE_MS);
  }, [clearAutoReturn, updateFollowing]);

  const scrollToX = useCallback((x: number) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const target = Math.max(0, Math.min(max, x));
    expectedScrollLeftRef.current = target;
    scroll.scrollLeft = target;
  }, []);

  useLayoutEffect(() => {
    if (!following || position === null) return;
    scrollToX(layout.beatToX(position));
  }, [following, position, layout, viewportWidth, scrollToX]);

  const resumeFollow = useCallback(() => {
    clearAutoReturn();
    updateFollowing(true);
    if (position !== null) scrollToX(layout.beatToX(position));
  }, [clearAutoReturn, position, layout, scrollToX, updateFollowing]);

  const peekSong = useCallback(
    (startBeat: number) => {
      updateFollowing(false);
      scrollToX(layout.beatToX(startBeat));
      scheduleAutoReturn();
    },
    [layout, scheduleAutoReturn, scrollToX, updateFollowing],
  );

  const finishPointer = useCallback(
    (pointerId?: number) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      if (pointerId !== undefined && drag.pointerId !== pointerId) return;
      const moved = drag.moved;
      drag.active = false;
      drag.moved = false;
      setDragging(false);
      if (moved) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      if (!followingRef.current) scheduleAutoReturn();
    },
    [scheduleAutoReturn],
  );

  useEffect(() => {
    const onWindowPointerEnd = (event: globalThis.PointerEvent) => finishPointer(event.pointerId);
    const onWindowBlur = () => finishPointer();
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [finishPointer]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (dragRef.current.active) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (!followingRef.current) clearAutoReturn();
    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startScrollLeft: scroll.scrollLeft,
      active: true,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId || drag.pointerType === 'touch') return;
    if (drag.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      finishPointer(event.pointerId);
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
      updateFollowing(false);
      clearAutoReturn();
      try {
        scroll.setPointerCapture(event.pointerId);
      } catch {
        void 0;
      }
    }
    expectedScrollLeftRef.current = null;
    scroll.scrollLeft = drag.startScrollLeft - dx;
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    finishPointer(event.pointerId);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const onScroll = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const expected = expectedScrollLeftRef.current;
    if (expected !== null && Math.abs(scroll.scrollLeft - expected) <= 2) return;
    expectedScrollLeftRef.current = null;
    updateFollowing(false);
    if (!dragRef.current.active) scheduleAutoReturn();
  };

  const jumpTarget = jump && (jump.section === 'end' ? 'End' : sectionAt(set, jump)?.name);
  const loopedSection = loop?.section && sectionAt(set, loop.section);

  const { looping, canPrevious, canNext, canLoop } = sectionControlState(set, now, jump, countIn, loop);
  const canPause = liveReady && playing;

  return (
    <div className="timeline-view">
      <header className="timeline-top">
        {live === 'not-connected' ? (
          <LiveNotConnected />
        ) : (
          <section className="timeline-readout" aria-label="Now playing">
            {now && playheadSong && playheadSection ? (
              <div className="timeline-readout-primary">
                <span className="timeline-readout-song">{songTitle(playheadSong)}</span>
                <span className="timeline-readout-section">{playheadSection.name}</span>
                <span className="timeline-readout-bar">
                  {now.bars === null ? `bar ${now.bar}` : `bar ${now.bar} of ${now.bars}`}
                </span>
              </div>
            ) : (
              <div className="timeline-readout-primary">
                <span className="timeline-readout-between">Between songs.</span>
              </div>
            )}
            <div className="timeline-readout-status">
              <span className="timeline-readout-jump">
                {jumpTarget ? `${countIn ? 'Count in to' : 'Jumping to'} ${jumpTarget}.` : '\u00a0'}
              </span>
              <span className="timeline-readout-loop">
                {loopedSection ? `Looping ${loopedSection.name}.` : loop ? 'Loop on.' : '\u00a0'}
              </span>
            </div>
          </section>
        )}
        <div className="timeline-top-controls">
          <SafeModeToggle safeMode={safeMode} available={connected} send={send} />
          <LeaderViewSwitcher leaderView={leaderView} onLeaderView={onLeaderView} />
        </div>
      </header>

      <nav className="timeline-song-tabs" aria-label="Songs">
        {layout.songs.map((song) => {
          const isCurrent = now?.song === song.number;
          const isUntitled = song.title === `Song ${song.number}`;
          return (
            <button
              key={song.number}
              type="button"
              className={['timeline-song-tab', isCurrent && 'current'].filter(Boolean).join(' ')}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => peekSong(song.startBeat)}
            >
              {!isUntitled && <span className="timeline-song-tab-number">{song.number}</span>}
              <span className="timeline-song-tab-title">{song.title}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="timeline-viewport"
        ref={viewportRef}
        style={{ '--playhead-x': `${playheadOffset}px` } as CSSProperties}
      >
        <div className="timeline-playhead" aria-hidden="true">
          <span className="timeline-playhead-cap" />
        </div>
        {!following && (
          <button type="button" className="timeline-follow" onClick={resumeFollow}>
            Follow
          </button>
        )}
        <div
          ref={scrollRef}
          className={['timeline-scroll', dragging && 'dragging'].filter(Boolean).join(' ')}
          role="region"
          aria-label="Set timeline"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={onClickCapture}
          onScroll={onScroll}
        >
          <div
            className="timeline-canvas"
            style={{
              paddingLeft: playheadOffset,
              paddingRight: Math.max(0, viewportWidth - playheadOffset),
            }}
          >
            <div className="timeline-track" style={{ width: layout.totalWidth }}>
              <div className="timeline-song-rail" aria-hidden="true">
                {layout.songs.map((song) => (
                  <div
                    key={song.number}
                    className={['timeline-song-header', now?.song === song.number && 'current'].filter(Boolean).join(' ')}
                    data-song-header={song.number}
                    style={{ left: song.left, width: song.width }}
                  >
                    <span className="timeline-song-header-title">{song.title}</span>
                  </div>
                ))}
              </div>

              <div className="timeline-lane">
                {layout.gaps.map((gap) => (
                  <div
                    key={gap.startBeat}
                    className="timeline-gap"
                    data-gap-start={gap.startBeat}
                    data-gap-end={gap.endBeat}
                    style={{ left: gap.left, width: gap.width }}
                    aria-hidden="true"
                  />
                ))}

                {layout.sections.map((block) => {
                  const address = { song: block.song, section: block.section };
                  const song = set.songs.find((candidate) => candidate.number === block.song);
                  const { waiting, classes } = sectionState(
                    address,
                    now,
                    jump,
                    loop,
                    song?.sections[block.section],
                  );
                  const heldInSong = countIn && jump !== null && jump.song === block.song;
                  const safeGuarded = safeMode && playing && block.song !== guardedSong;
                  const enabled = liveReady && (!heldInSong || (song !== undefined && countInLandsOn(song, block.section)));
                  const isCountInTarget = countIn && waiting;
                  const title = song ? songTitle(song) : `Song ${block.song}`;
                  return (
                    <button
                      key={`${block.song}-${block.section}`}
                      type="button"
                      className={[
                        'timeline-section',
                        block.kind,
                        classes,
                        isCountInTarget && 'count-in-target',
                        safeGuarded && 'safe-guarded',
                        !enabled && 'unavailable',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-song={block.song}
                      data-section={block.section}
                      data-kind={block.kind}
                      data-bars={block.bars}
                      data-beats-per-bar={block.beatsPerBar}
                      style={{ left: block.left, width: block.width }}
                      aria-pressed={waiting}
                      aria-disabled={safeGuarded || undefined}
                      aria-label={`${block.name}, ${title}`}
                      disabled={!enabled}
                      onClick={() => {
                        if (!safeGuarded) send({ kind: 'jump', ...address });
                      }}
                    >
                      <span className="timeline-waveform-layer" aria-hidden="true" />
                      <span className="timeline-bar-grid" aria-hidden="true">
                        {block.ticks.map((tick) => (
                          <span
                            key={tick.bar}
                            className={['timeline-bar-tick', tick.bar === 1 && 'first'].filter(Boolean).join(' ')}
                            style={{ left: tick.offsetX }}
                          >
                            <span className="timeline-bar-number">{tick.bar}</span>
                          </span>
                        ))}
                      </span>
                      <span className="timeline-section-content">
                        <span className="timeline-section-name">{block.name}</span>
                        {block.skipped && <span className="timeline-section-badge skipped">Skip</span>}
                        {waiting && (
                          <span className="timeline-section-badge waiting">
                            {isCountInTarget ? 'Count in' : 'Jumping'}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

                {layout.ends.map((end) => {
                  const waitingEnd = jump?.song === end.song && jump.section === 'end';
                  return (
                    <div
                      key={`end-${end.song}`}
                      className={['timeline-end', waitingEnd && 'waiting'].filter(Boolean).join(' ')}
                      data-song-end={end.song}
                      style={{ left: end.x }}
                      aria-label={`${end.songTitle} End`}
                    >
                      <span className="timeline-end-label">End</span>
                    </div>
                  );
                })}

                {activeLoop && (
                  <div
                    className="timeline-loop-brace"
                    data-loop-start={loop!.start}
                    data-loop-length={loop!.length}
                    style={{ left: activeLoop.left, width: activeLoop.width }}
                    aria-label={loopedSection ? `Looping ${loopedSection.name}` : 'Loop active'}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="timeline-transport" aria-label="Timeline transport">
        <TimelinePauseButton available={canPause} safeMode={safeMode} send={send} />
        <button
          type="button"
          className={['section-control', !(liveReady && canPrevious) && 'unavailable'].filter(Boolean).join(' ')}
          disabled={!(liveReady && canPrevious)}
          onClick={() => send({ kind: 'previous' })}
        >
          Previous
        </button>
        <button
          type="button"
          className={['section-control', looping && 'on', !(liveReady && canLoop) && 'unavailable'].filter(Boolean).join(' ')}
          aria-pressed={looping}
          disabled={!(liveReady && canLoop)}
          onClick={() => send({ kind: 'loop' })}
        >
          Loop
        </button>
        <button
          type="button"
          className={['section-control', !(liveReady && canNext) && 'unavailable'].filter(Boolean).join(' ')}
          disabled={!(liveReady && canNext)}
          onClick={() => send({ kind: 'next' })}
        >
          Next
        </button>
        <CountInButton song={playheadSong} now={now} playable={liveReady} playing={playing} send={send} />
        <FadeOutButton available={liveReady} playing={playing} fade={fade} send={send} />
      </section>
    </div>
  );
}
