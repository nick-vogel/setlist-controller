import { VIEWS, type View } from './device-settings.ts';

// The chart view's layout, after the display on the chart page: the song the playhead is in, or every
// song one after the next. A select, as the part is, so the page keeps no button. It sends nothing to
// the server.
export function ViewPicker({ view, onView }: { view: View; onView(view: View): void }) {
  return (
    <label className="view-picker">
      <span className="view-picker-label">View</span>
      <select
        className="view-select"
        value={view}
        onChange={(event) => {
          const picked = VIEWS.find((choice) => choice.value === event.target.value);
          if (picked) onView(picked.value);
        }}
      >
        {VIEWS.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
