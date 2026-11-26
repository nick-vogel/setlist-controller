import { isPad } from '../shared/count-in.ts';
import { namesMatch } from '../shared/match-name.ts';
import type { ManifestSong, SongDurations } from '../shared/set-manifest.ts';
import { gapAfter, type NowPlaying, type SetList, type Snapshot, type Song, type SongTiming } from '../shared/snapshot.ts';

// Each song's timing for the snapshot (SongTiming). A song the set manifest times takes the build's seconds, exact across
// its tempo changes, as long as the manifest's beats still match Live's locators: a set moved by hand after the build is
// timed by Live instead. Any other song is timed by its beats at Live's tempo the first time Live plays in it, once Live
// has reported a tempo, outside its Pad and Pad Out, which play at the next song's tempo, and keeps that timing until the
// set changes. The Pad and Pad Out are then timed at the song's own tempo too, so a padded song's total is off by the
// difference: left untimed, they would leave the song with no total at all. A song Live has not played in has no timing:
// Live reports only the tempo it plays now.

// Live's song time is float32, so beats a hair apart are the same beats.
const BEATS_EPSILON = 1e-3;

// Where Live plays, and its tempo, null until Live reports one.
export type LivePlayhead = { now: NowPlaying | null; playing: boolean; tempo: number | null };

export type TimeSongs = (set: SetList | null, manifestSongs: readonly ManifestSong[], live: LivePlayhead) => Snapshot['songTimings'];

// The server keeps one, so a song keeps the timing Live first played it at.
export function createSongTimer(): TimeSongs {
  // The timings by Live's tempo, by song number, for the set they were taken in.
  const played = new Map<number, SongTiming>();
  let playedIn: string | null = null;

  return (set, manifestSongs, { now, playing, tempo }) => {
    const key = set && setKey(set);
    if (key !== playedIn) {
      played.clear();
      playedIn = key;
    }
    if (!set) return {};
    const timings: Snapshot['songTimings'] = {};
    set.songs.forEach((song, index) => {
      const built = builtTiming(set.songs, index, manifestFor(manifestSongs, song, index)?.durations);
      if (built) {
        timings[song.number] = built;
        return;
      }
      const kept = played.get(song.number);
      if (kept) {
        timings[song.number] = kept;
        return;
      }
      if (now?.song !== song.number || !playing || tempo === null || isPad(song.sections[now.section]?.name ?? '')) return;
      const timing = tempoTiming(song, tempo);
      played.set(song.number, timing);
      timings[song.number] = timing;
    });
    return timings;
  };
}

// The manifest song for the set's song at `index`: the one at the same position when its title matches by the name rule,
// as a build writes them in set order, or else the first of the song's title. None for a song with no title. The charts
// and meters match by title alone (chartForSong, meterForSong), but a song played twice in a set has a gap of its own
// after each place, which only the position tells apart.
function manifestFor(songs: readonly ManifestSong[], song: Song, index: number): ManifestSong | undefined {
  const { title } = song;
  if (title === null) return undefined;
  const same = songs[index];
  if (same && namesMatch(same.title, title)) return same;
  return songs.find((candidate) => namesMatch(candidate.title, title));
}

// The build's timing of the song, or none when the manifest gives it no durations or their beats do not match Live's
// locators. The gap keeps the build's seconds only while its beats match too.
function builtTiming(songs: readonly Song[], index: number, durations: SongDurations | undefined): SongTiming | null {
  const song = songs[index]!;
  if (!durations || durations.sections.length !== song.sections.length) return null;
  const matches = song.sections.every((section, index) => section.end !== null && sameBeats(section.end - section.time, durations.sections[index]!.beats));
  if (!matches) return null;
  const stretch = gapAfter(songs, index);
  const gap = stretch && durations.gap && sameBeats(stretch.end - stretch.start, durations.gap.beats) ? durations.gap.seconds : null;
  return { sections: durations.sections.map(({ seconds }) => seconds), gap, source: 'build' };
}

// Each section's beats at `tempo`. The gap after the song plays at the next song's tempo, which Live does not report
// before it plays it, so it is not known.
function tempoTiming(song: Song, tempo: number): SongTiming {
  return { sections: song.sections.map((section) => (section.end === null ? null : ((section.end - section.time) * 60) / tempo)), gap: null, source: 'tempo' };
}

// Live names no set, so a set whose songs, titles or locators differ is another set, as the controller treats a read that
// finds the set changed.
function setKey(set: SetList): string {
  return JSON.stringify(set.songs.map((song) => [song.number, song.title, song.sections.map((section) => [section.time, section.end]), song.end]));
}

function sameBeats(a: number, b: number): boolean {
  return Math.abs(a - b) < BEATS_EPSILON;
}
