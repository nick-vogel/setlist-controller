import { LEADER_VIEWS, type LeaderView } from './device-settings.ts';

// Switches the leader page between the Sunday Setlist view and the whole-set scrolling Timeline
// view. Shown on the leader page only; the producer page stays unchanged.
export function LeaderViewSwitcher({
  leaderView,
  onLeaderView,
}: {
  leaderView: LeaderView;
  onLeaderView(view: LeaderView): void;
}) {
  return (
    <div className="leader-mode-switcher" role="group" aria-label="Leader view">
      {LEADER_VIEWS.map((choice) => {
        const active = leaderView === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            className={['leader-mode-choice', active && 'active'].filter(Boolean).join(' ')}
            aria-pressed={active}
            onClick={() => onLeaderView(choice.value)}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
