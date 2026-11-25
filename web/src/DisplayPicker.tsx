import { DISPLAYS, type Display } from './device-settings.ts';

// How the chart view draws the song, beside the part on the chart page: a select, as the part is, so
// a phone opens its own picker and the page keeps no button. It sends nothing to the server.
export function DisplayPicker({ display, onDisplay }: { display: Display; onDisplay(display: Display): void }) {
  return (
    <label className="display-picker">
      <span className="display-picker-label">Display</span>
      <select
        className="display-select"
        value={display}
        onChange={(event) => {
          const picked = DISPLAYS.find((choice) => choice.value === event.target.value);
          if (picked) onDisplay(picked.value);
        }}
      >
        {DISPLAYS.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
