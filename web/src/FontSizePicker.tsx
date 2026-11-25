import { FONT_SIZES, type FontSize } from './device-settings.ts';

// The chart text's size in steps, after the view on the chart page. A select, as the part is, so the
// page keeps no button. It sends nothing to the server.
export function FontSizePicker({ fontSize, onFontSize }: { fontSize: FontSize; onFontSize(fontSize: FontSize): void }) {
  return (
    <label className="font-size-picker">
      <span className="font-size-picker-label">Font size</span>
      <select
        className="font-size-select"
        value={fontSize}
        onChange={(event) => {
          const picked = FONT_SIZES.find((choice) => choice.value === event.target.value);
          if (picked) onFontSize(picked.value);
        }}
      >
        {FONT_SIZES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
