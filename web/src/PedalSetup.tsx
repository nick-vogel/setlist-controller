import { Fragment } from 'react';
import type { PedalAction, PedalStatus } from '../../src/shared/setup.ts';

// The foot pedal on the setup screen: what the server made of the pedal config file, which switch
// does what, and the MIDI monitor, which lists each message as it arrives so the operator can fill
// in the file by pressing each switch.

const ACTION_LABELS: Record<PedalAction, string> = {
  loop: 'Loop',
  next: 'Next section',
  previous: 'Previous section',
};

const CONFIG_LABELS: Record<PedalStatus['config'], string> = {
  loaded: 'Pedal config loaded.',
  missing: 'No pedal config.',
  invalid: 'Pedal config rejected.',
};

export function PedalSetup({ pedal }: { pedal: PedalStatus }) {
  return (
    <section className="setup-section" aria-labelledby="pedal">
      <h2 id="pedal">Foot pedal</h2>
      <p className={`pedal-config ${pedal.config}`}>{CONFIG_LABELS[pedal.config]}</p>
      {pedal.configPath && (
        <p className="pedal-path">
          File: <code>{pedal.configPath}</code>
        </p>
      )}
      {pedal.problems.length > 0 && (
        <ul className="pedal-problems">
          {pedal.problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
      {pedal.mappings.length > 0 && (
        <ul className="pedal-mappings">
          {pedal.mappings.map((mapping) => (
            <li key={mapping.switch}>
              <span className="pedal-switch">Switch {mapping.switch}</span>{' '}
              {[mapping.message].flat().map((message) => (
                <Fragment key={message}>
                  <code>{message}</code>{' '}
                </Fragment>
              ))}
              <span>{ACTION_LABELS[mapping.action]}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="status">
        {pedal.input.kind === 'ready'
          ? 'MIDI input ready.'
          : pedal.input.kind === 'none'
            ? 'No MIDI input.'
            : `MIDI input unavailable: ${pedal.input.message}`}
      </p>
      <h3 className="midi-monitor-heading">MIDI monitor</h3>
      {pedal.monitor.length === 0 ? (
        <p className="status">Press a pedal switch to see its message.</p>
      ) : (
        <ul className="midi-monitor">
          {pedal.monitor.toReversed().map((entry) => (
            <li key={entry.id}>
              <code>{entry.message}</code> <span>{entry.description}</span>{' '}
              <span className={entry.action ? 'midi-action' : 'midi-unmapped'}>
                {entry.action ? ACTION_LABELS[entry.action] : 'unmapped'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
