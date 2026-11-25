import { CHORD_NAMES, type ChordNames } from './device-settings.ts';

// How the chart view names the chords, after the display on the chart page: by their letters or by
// their Nashville numbers. A select, as the display is, so a phone opens its own picker and the page
// keeps no button. It sends nothing to the server.
export function ChordNamesPicker({ chordNames, onChordNames }: { chordNames: ChordNames; onChordNames(chordNames: ChordNames): void }) {
  return (
    <label className="chord-names-picker">
      <span className="chord-names-picker-label">Chord names</span>
      <select
        className="chord-names-select"
        value={chordNames}
        onChange={(event) => {
          const picked = CHORD_NAMES.find((choice) => choice.value === event.target.value);
          if (picked) onChordNames(picked.value);
        }}
      >
        {CHORD_NAMES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
