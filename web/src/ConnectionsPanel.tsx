import { useEffect, useRef } from 'react';
import type { PageCommand } from '../../src/shared/command.ts';
import type { Connection, ConnectionLateness, ConnectionPick, PauseReason } from '../../src/shared/snapshot.ts';
import { CheckResult } from './PreServiceCheck.tsx';

// The producer's view of the connection targets, such as ProPresenter, on the producer page only.
// One row per target: its label, whether it is online, whether it is armed, disarmed or paused and
// why, Arm and Disarm, Fire again, the target's own manual buttons, then the choice it asks the
// producer to pick, such as ProPresenter's playlist, as a labelled select with a line naming the pick,
// enabled as its buttons are and only while the server knows a set, since a pick is kept for a set:
// with none, the line says the pick waits for the set from Live. Then under them any problem the target
// reports reaching it, such as a connect that failed, online or offline, and then its pre-service
// check. Arm is enabled while the target is disarmed or paused, Disarm while it is armed or paused.
// Fire again and the target's own buttons are enabled while it is online, whatever its arm state,
// since neither changes it. Under the check, whatever read-only state the target reports, such as its
// live cue, in full, then the read-only list it reports under that, such as its cue list, capped in
// height and scrolled, so a long list neither hides the state lines above it nor pushes the rows
// below off the screen. The list line the target marks, such as its live cue's, is marked, and the
// list scrolls itself, never the page, to put it at the top of the box. Under those, how late the cues reach it once one has: the last and the
// median, and the same for when it acted on them, for a target that reports it. Every button is disabled while the
// page is not connected. An offline row shows red, as Live not connected does. A target the
// connections config file disabled shows red too, as not configured with its problems, and has no
// buttons, since it can never follow the set. A problem with the file itself, which started no
// target, stands where the rows would be.
export function ConnectionsPanel({
  connections,
  problems,
  connected,
  setKnown,
  send,
}: {
  connections: Connection[];
  // The connections config file's own problems.
  problems: string[];
  connected: boolean;
  // Whether the server has read a set from Live, which a pick is kept for.
  setKnown: boolean;
  send(command: PageCommand): void;
}) {
  return (
    <section className="connections" aria-labelledby="connections">
      <h2 id="connections">Connections</h2>
      {problems.length > 0 && <ConnectionProblems problems={problems} />}
      {connections.length === 0 ? (
        problems.length === 0 && <p className="status">No connections are configured.</p>
      ) : (
        <ul className="connection-list">
          {connections.map(({ name, label, configured, problems, connection, arm, pause, movedTo, check, buttons, pick, state, list, listCurrent, lateness }) =>
            !configured ? (
              <li key={name} className="connection not-configured" aria-label={label}>
                <span className="connection-label">{label}</span>
                <span className="connection-status">Not configured</span>
                <ConnectionProblems problems={problems} />
              </li>
            ) : (
              <li key={name} className={connection === 'offline' ? 'connection offline' : 'connection'} aria-label={label}>
                <span className="connection-label">{label}</span>
                <span className="connection-status">{connection === 'online' ? 'Online' : 'Offline'}</span>
                <span className="connection-arm">{arm === 'armed' ? 'Armed' : arm === 'paused' ? pausedLine(pause, movedTo) : 'Disarmed'}</span>
                <span className="connection-buttons">
                  <RowButton label="Arm" enabled={connected && arm !== 'armed'} onClick={() => send({ kind: 'arm', target: name })} />
                  <RowButton label="Disarm" enabled={connected && arm !== 'disarmed'} onClick={() => send({ kind: 'disarm', target: name })} />
                  <RowButton label="Fire again" enabled={connected && connection === 'online'} onClick={() => send({ kind: 'fire-again', target: name })} />
                  {buttons.map((button) => (
                    <RowButton
                      key={button.id}
                      label={button.label}
                      enabled={connected && connection === 'online'}
                      onClick={() => send({ kind: 'run-button', target: name, button: button.id })}
                    />
                  ))}
                </span>
                {pick && (
                  <PickField pick={pick} enabled={connected && connection === 'online' && setKnown} setKnown={setKnown} onPick={(choice) => send({ kind: 'pick', target: name, choice })} />
                )}
                {problems.length > 0 && <ConnectionProblems problems={problems} />}
                <CheckResult check={check} />
                {state.length > 0 && (
                  <ul className="connection-state">
                    {state.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
                {list.length > 0 && <StateList list={list} current={listCurrent} />}
                <Lateness lateness={lateness} />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

// The read-only list under a target's state lines, capped in height and scrolled by the stylesheet,
// with the line at current marked. When the marked line changes, and when the list fills or changes
// length, as when a read of the cue list finishes, the box scrolls itself to put that line at its top, so the producer sees what comes next. Only the
// box's own scrollTop moves, never the page, and a producer who scrolls the box by hand to look ahead
// is left there until the marked line moves.
function StateList({ list, current }: { list: string[]; current: number | null }) {
  const box = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const element = box.current;
    const line = current === null ? undefined : element?.children[current];
    if (!element || !line) return;
    element.scrollTop += line.getBoundingClientRect().top - element.getBoundingClientRect().top;
  }, [current, list.length]);
  return (
    <ul className="connection-state-list" ref={box}>
      {list.map((line, index) =>
        index === current ? (
          <li key={index} className="current" aria-current="true">
            {line}
          </li>
        ) : (
          <li key={index}>{line}</li>
        ),
      )}
    </ul>
  );
}

// How late the cues reach the target, in whole milliseconds, once one has been measured: nothing
// before that, and the acted-on line only once the target has reported acting on one.
function Lateness({ lateness: { last, median, acted, actedMedian } }: { lateness: ConnectionLateness }) {
  if (last === null) return null;
  return (
    <ul className="connection-lateness">
      <li>{latenessLine('Late', last, median)}</li>
      {acted !== null && <li>{latenessLine('Acted on', acted, actedMedian)}</li>}
    </ul>
  );
}

const latenessLine = (lead: string, last: number, median: number | null) =>
  `${lead} ${Math.round(last)} ms${median === null ? '' : `, median ${Math.round(median)} ms`}`;

// The choice the target asks the producer to make, such as its playlist: a select of what it offers,
// on a prompt while nothing is picked, and a line naming the pick, or, while no set is known, saying
// the pick waits for one. A pick the target no longer offers still shows as picked.
function PickField({
  pick: { label, options, picked },
  enabled,
  setKnown,
  onPick,
}: {
  pick: ConnectionPick;
  enabled: boolean;
  setKnown: boolean;
  onPick(choice: string): void;
}) {
  const noun = label.toLowerCase();
  const shown = picked && !options.some(({ id }) => id === picked.id) ? [...options, picked] : options;
  return (
    <>
      <label className="connection-pick">
        <span className="connection-pick-label">{label}</span>
        <select className={enabled ? 'connection-pick-select' : 'connection-pick-select unavailable'} value={picked?.id ?? ''} disabled={!enabled} onChange={(event) => event.target.value && onPick(event.target.value)}>
          <option value="" disabled>
            {`Pick a ${noun}`}
          </option>
          {shown.map(({ id, label: option }) => (
            <option key={id} value={id}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <p className="connection-picked">{!setKnown ? `No ${noun} can be picked until the set is read from Live.` : picked ? `${label}: ${picked.label}` : `No ${noun} picked`}</p>
    </>
  );
}

// What a paused row says, by its reason: a pause by a press names what the press moved onto, such as
// "Paused: moved to Facetime".
function pausedLine(pause: PauseReason | null, movedTo: string | null): string {
  if (pause === 'by-hand') return 'Paused by hand';
  if (pause === 'fade-out') return 'Paused by Fade out';
  if (pause === 'moved') return movedTo === null ? 'Paused: moved' : `Paused: moved to ${movedTo}`;
  return 'Paused';
}

function RowButton({ label, enabled, onClick }: { label: string; enabled: boolean; onClick(): void }) {
  return (
    <button type="button" className={enabled ? 'connection-button' : 'connection-button unavailable'} disabled={!enabled} onClick={onClick}>
      {label}
    </button>
  );
}

// What is wrong with the connections config file, with one target's section of it, or with reaching
// a configured target, as the target reported it.
export function ConnectionProblems({ problems }: { problems: string[] }) {
  return (
    <ul className="connection-problems">
      {problems.map((problem, index) => (
        <li key={index} className="connection-problem">
          {problem}
        </li>
      ))}
    </ul>
  );
}
