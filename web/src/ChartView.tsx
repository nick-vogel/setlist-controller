import { useEffect, useRef, useState, type Ref } from 'react';
import { parseChart, type ChartLine, type ChartSection } from '../../src/shared/chart.ts';
import { namesMatch } from '../../src/shared/match-name.ts';
import { beatsPerBar, chartForSong, type ManifestSong, type SetCharts } from '../../src/shared/set-manifest.ts';
import { songTitle, type SetList, type Snapshot } from '../../src/shared/snapshot.ts';
import { chartBlocks, shownSong } from './chart-blocks.ts';
import { ChartStrip } from './ChartStrip.tsx';
import { displayLines } from './chart-display.ts';
import { CapoPicker } from './CapoPicker.tsx';
import type { ChordNames, Display, FontSize, View } from './device-settings.ts';
import { sectionState } from './section-state.ts';

// The chart view, in place of the now-playing panel and the setlist once a band member picks a part:
// the pinned strip with the next section and its countdown, then the shown song as one block per
// locator in played order, each with its name and bar count. The current block is highlighted and
// scrolled to the top of the page, just under the strip, and follows the playhead and a jump at
// once. A waiting jump and the loop are marked as the setlist marks them. Under its name and bar
// count, each block shows its matched heading's lines from the song's chart, the chords over the
// lyrics in the stems' key, when the set's charts hold one for the song's title, as the display draws them: chords over
// lyrics, lyrics only, or none for the section map. Once the charts are fetched, a song they hold no
// chart for says so under its name. Over the lyrics, the chords show by their letters or their
// Nashville numbers, and each song with a chart takes a capo of its own, which shows the letters in
// the capo's shapes and labels the song.
export function ChartView({
  set,
  now,
  jump,
  countIn = false,
  loop,
  charts = null,
  display = 'chords-over-lyrics',
  view = 'song',
  fontSize = 'medium',
  chordNames = 'letters',
  capoOf = () => 0,
  onCapo = () => {},
}: {
  set: SetList;
  now: Snapshot['now'];
  jump: Snapshot['jump'];
  countIn?: Snapshot['countIn'];
  loop: Snapshot['loop'];
  charts?: SetCharts | null;
  display?: Display;
  // The shown song alone, or every song in set order under the one strip.
  view?: View;
  // The chart text's size, which the page sets; a change resizes the strip and moves the block.
  fontSize?: FontSize;
  chordNames?: ChordNames;
  // The capo the device keeps for a song, by its title, and a change to it.
  capoOf?(title: string): number;
  onCapo?(title: string, capo: number): void;
}) {
  // The song shown last, so the band keeps the song they just played between songs. It follows the
  // playhead in the whole-set view too, so going back to one song shows the right one.
  const [last, setLast] = useState<number | null>(null);
  const shown = shownSong(set, now, last);
  if (shown !== last) setLast(shown);

  const current = useRef<HTMLLIElement>(null);
  const strip = useRef<HTMLElement>(null);
  const song = set.songs.find((candidate) => candidate.number === shown);
  const currentSong = now?.song;
  const currentSection = now?.section;
  // The capo of each song drawn at or above the current block, as one value the effect can compare: the
  // shown song in This song, and in the whole set every song up to the current one. A capo on a later
  // song moves no block above it, so a guitarist setting it keeps the page where it is.
  const above = view === 'set' ? set.songs.slice(0, set.songs.findIndex((each) => each.number === currentSong) + 1) : song ? [song] : [];
  const capos = above.map((each) => (each.title === null ? 0 : capoOf(each.title))).join(',');
  useEffect(() => {
    // The current block's top goes to the strip's bottom edge, so the strip never covers it. The
    // strip is measured, since its height follows its text and the font size. A change of view, of
    // font size, of display, of chord names or of a capo above it moves the block, since each can
    // rewrap a line, and so do the charts, which arrive after the first scroll on an open or a reload and give every
    // block above it its lines, so it scrolls again.
    const block = current.current;
    if (!block) return;
    const under = strip.current?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: block.getBoundingClientRect().top + window.scrollY - under });
  }, [currentSong, currentSection, view, fontSize, display, chordNames, capos, charts]);

  if (!song) return null;

  const body = (each: SetList['songs'][number]) => (
    <SongChart set={set} song={each} now={now} jump={jump} loop={loop} charts={charts} display={display} chordNames={chordNames} capoOf={capoOf} onCapo={onCapo} current={current} />
  );

  // The strip is outside the songs' sections, so it holds to the top of the whole chart page, and the
  // whole-set view keeps one strip for every song.
  return (
    <>
      <ChartStrip ref={strip} set={set} now={now} jump={jump} countIn={countIn} loop={loop} />
      {view === 'set' ? (
        <div className="chart-set">
          {set.songs.map((each) => (
            <section key={each.number} className="chart" aria-label={songTitle(each)}>
              {body(each)}
            </section>
          ))}
        </div>
      ) : (
        <section className="chart" aria-label="Chart">
          {body(song)}
        </section>
      )}
    </>
  );
}

// One song of the chart view, as both views draw it: its title, "No chart for this song" when the
// fetched charts hold none for it, its capo row when it has a title and a chart and the display draws
// chords, and its blocks. The current block takes the ref the view scrolls.
function SongChart({
  set,
  song,
  now,
  jump,
  loop,
  charts,
  display,
  chordNames,
  capoOf,
  onCapo,
  current,
}: {
  set: SetList;
  song: SetList['songs'][number];
  now: Snapshot['now'];
  jump: Snapshot['jump'];
  loop: Snapshot['loop'];
  charts: SetCharts | null;
  display: Display;
  chordNames: ChordNames;
  capoOf(title: string): number;
  onCapo(title: string, capo: number): void;
  current: Ref<HTMLLIElement>;
}) {
  const charted = chartForSong(charts?.songs ?? [], song.title);
  const chartText = charted?.chartText;
  const { title } = song;
  const capo = title === null ? 0 : capoOf(title);
  const chart = sectionsOf(charted, set.songs.length, chordNames === 'numbers', capo);
  const beats = beatsPerBar(charts?.songs.find((candidate) => title !== null && namesMatch(candidate.title, title))?.meter);
  // Not before the first fetch, so the line never flashes on a song that has a chart.
  const missing = charts !== null && chartText === undefined;
  return (
    <>
      <h2 className="chart-song">{songTitle(song)}</h2>
      {missing && <p className="chart-missing">No chart for this song</p>}
      {title !== null && chartText !== undefined && display === 'chords-over-lyrics' && (
        <div className="chart-capo">
          <CapoPicker capo={capo} onCapo={(picked) => onCapo(title, picked)} />
          {capo > 0 && <span className="chart-capo-label">Capo {capo}</span>}
        </div>
      )}
      <ol className="chart-blocks">
        {chartBlocks(set, song.number, chart, beats).map((block) => {
          const { section } = block;
          // End is a point past the song's last section, so it is never marked.
          const classes = section === 'end' ? '' : sectionState({ song: block.song, section }, now, jump, loop).classes;
          const isCurrent = section !== 'end' && now?.song === block.song && now.section === section;
          // The current block counts as Live counts it, in the song's own signature.
          const bars = isCurrent ? now.bars : block.bars;
          const lines = displayLines(block.lines, display);
          return (
            <li key={section} ref={isCurrent ? current : undefined} className={['chart-block', classes].filter(Boolean).join(' ')}>
              <span className="chart-block-name">{block.name}</span>
              {bars !== null && <span className="chart-block-bars">{bars === 1 ? '1 bar' : `${bars} bars`}</span>}
              {lines.length > 0 && <ChartLines lines={lines} />}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// The charts read, each by its text, both keys, the chord names and the capo, and their sections, so a snapshot that moves the
// playhead reads no chart, in either view, and a manifest that changes only a key reads it again. It
// holds a set's worth, and starts again when a changed manifest brings more.
const read = new Map<string, ChartSection[]>();

// A song's chart sections, its chords in the stems' key, in Nashville numbers, or in a capo's shapes.
function sectionsOf(song: ManifestSong | undefined, songs: number, numbers: boolean, capo: number): ChartSection[] {
  const text = song?.chartText;
  if (song === undefined || text === undefined) return [];
  const { chartKey, stemsKey } = song;
  const key = JSON.stringify([text, chartKey ?? null, stemsKey, numbers, capo]);
  let sections = read.get(key);
  if (!sections) {
    if (read.size >= Math.max(1, songs)) read.clear();
    sections = parseChart(text, { chartKey, stemsKey, numbers, capo }).sections;
    read.set(key, sections);
  }
  return sections;
}

// A block's lines. A line with chords is a row of chunks, each its chord over the text it falls on, so
// a long line wraps between chunks and every chord stays over its syllable. A line with none is its
// words alone.
function ChartLines({ lines }: { lines: ChartLine[] }) {
  return (
    <div className="chart-lines">
      {lines.map((line, index) => {
        if (line.kind === 'blank') return <div key={index} className="chart-gap" />;
        if (line.kind === 'note') return <p key={index} className="chart-note">{line.text}</p>;
        if (line.chunks.every(({ chord }) => chord === null)) {
          return (
            <p key={index} className="chart-line">
              <span className="chart-lyric">{line.chunks.map(({ text }) => text).join('')}</span>
            </p>
          );
        }
        return (
          <p key={index} className="chart-line">
            {line.chunks.map(({ chord, text }, chunk) => (
              <span key={chunk} className="chart-chunk">
                {/* A chunk with no chord keeps the chord row's height, so its words sit on the line's. */}
                <span className="chart-chord">{chord ?? '\u00a0'}</span>
                <span className="chart-lyric">{text}</span>
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
