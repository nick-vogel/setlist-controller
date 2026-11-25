import { PARTS, type Part } from './device-settings.ts';

// The band member's part, on every view-only page: a select, so a phone opens its own picker and the
// page keeps no button. A part opens the chart view; No part goes back to the view-only page. It
// sends nothing to the server.
export function PartPicker({ part, onPart }: { part: Part | null; onPart(part: Part | null): void }) {
  return (
    <label className="part-picker">
      <span className="part-picker-label">Part</span>
      <select className="part-select" value={part ?? ''} onChange={(event) => onPart(PARTS.find((choice) => choice === event.target.value) ?? null)}>
        <option value="">No part</option>
        {PARTS.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}
