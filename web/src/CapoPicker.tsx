import { CAPOS } from './device-settings.ts';

// A song's capo, under its name in the chart view: No capo or a fret from 1 to 7. A select, as the
// display is, so a phone opens its own picker and the page keeps no button. It sends nothing to the
// server.
export function CapoPicker({ capo, onCapo }: { capo: number; onCapo(capo: number): void }) {
  return (
    <label className="capo-picker">
      <span className="capo-picker-label">Capo</span>
      <select
        className="capo-select"
        value={String(capo)}
        onChange={(event) => {
          const picked = CAPOS.find((choice) => String(choice) === event.target.value);
          if (picked !== undefined) onCapo(picked);
        }}
      >
        {CAPOS.map((choice) => (
          <option key={choice} value={String(choice)}>
            {choice === 0 ? 'No capo' : String(choice)}
          </option>
        ))}
      </select>
    </label>
  );
}
