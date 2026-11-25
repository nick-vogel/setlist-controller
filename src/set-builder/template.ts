import { child, childElements, valueOf, type Element } from './als.ts';
import type { StemMap } from './build-set.ts';

// Where stems go in the template. A target is a stem map key: a group track, whose tracks are the audio tracks
// inside it (its slots, found by TrackGroupId and track order, never by name), or a single track such as GUIDE or
// MT CLICK, an audio track outside every group (TrackGroupId -1), which is its own one track. A slot renamed GUIDE
// stays a slot. Return and MIDI tracks are not targets, and neither is the PAD track, the single track named PAD, which
// holds the pads and no stem.

export type Target = { kind: 'group' | 'single track'; tracks: Element[] };

// A name more than one of the template's tracks carries: more than one group, more than one single track, or a group
// and a single track.
export type SharedName = { kind: Target['kind'] | 'group and single track'; name: string };

// The template's targets by name, in template track order, one per name. A group keeps the name over a single track of
// the same name, and the shared name is a template problem (sharedTargetNames).
export function templateTargets(liveSet: Element): Map<string, Target> {
  const tracks = childElements(child(liveSet, 'Tracks'));
  const audioTracks = tracks.filter((track) => track.name === 'AudioTrack');
  const targets = new Map<string, Target>();
  for (const track of tracks) {
    const kind = kindOf(track);
    const name = valueOf(track, 'Name', 'EffectiveName');
    if (kind === 'group') {
      targets.set(name, { kind, tracks: audioTracks.filter((slot) => valueOf(slot, 'TrackGroupId') === track.attributes.Id) });
    } else if (kind === 'single track' && name !== PAD_TRACK && !targets.has(name)) {
      targets.set(name, { kind, tracks: [track] });
    }
  }
  return targets;
}

// The name of the template's single track that holds the pads.
export const PAD_TRACK = 'PAD';

// The template's PAD track, the first single track named PAD, found by name like GUIDE and MT CLICK; undefined when the
// template has none. A build needs one only when it asks for a pad. A second one is a shared name (sharedTargetNames).
export function padTrack(liveSet: Element): Element | undefined {
  return childElements(child(liveSet, 'Tracks')).find((track) => kindOf(track) === 'single track' && valueOf(track, 'Name', 'EffectiveName') === PAD_TRACK);
}

// Each name more than one of the template's groups, or more than one of its single tracks, carries, once per kind, and
// each name a group and a single track both carry, once, in template track order: each at the first track that carries
// the name in its kind, or in either kind for a group and a single track, and a name repeated within a kind before the
// same name shared across kinds when both start at one track. The template holds one track per target, so the build
// stops on a shared name.
export function sharedTargetNames(liveSet: Element): SharedName[] {
  // Each candidate in the order its first track comes, with the kind of every track that carries it.
  const seen = new Map<string, SharedName & { kinds: Target['kind'][] }>();
  for (const track of childElements(child(liveSet, 'Tracks'))) {
    const kind = kindOf(track);
    if (kind === undefined) continue;
    const name = valueOf(track, 'Name', 'EffectiveName');
    for (const shared of [{ kind, name }, { kind: 'group and single track', name }] satisfies SharedName[]) {
      const key = `${shared.kind}: ${name}`;
      seen.set(key, { ...shared, kinds: [...(seen.get(key)?.kinds ?? []), kind] });
    }
  }
  return [...seen.values()]
    .filter(({ kind, kinds }) => (kind === 'group and single track' ? new Set(kinds).size > 1 : kinds.length > 1))
    .map(({ kind, name }) => ({ kind, name }));
}

// What a template track is as a target: a group track, or an audio track outside every group. Any other track is no
// target.
function kindOf(track: Element): Target['kind'] | undefined {
  if (track.name === 'GroupTrack') return 'group';
  if (track.name === 'AudioTrack' && valueOf(track, 'TrackGroupId') === '-1') return 'single track';
  return undefined;
}

// Each stem name the map lists, with the one target it goes to, or undefined for a stem the map lists under more than
// one target, which goes to none of them: the build stops on it (templateProblems), and no track count counts it. A
// stem listed twice under one target goes to that target.
export function stemTargets(stemMap: StemMap): Map<string, string | undefined> {
  const targetOf = new Map<string, string | undefined>();
  for (const [target, stems] of Object.entries(stemMap)) {
    for (const stem of stems) targetOf.set(stem, targetOf.has(stem) && targetOf.get(stem) !== target ? undefined : target);
  }
  return targetOf;
}
