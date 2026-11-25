import { useEffect, useState } from 'react';
import { SETUP_API, SETUP_CONNECTIONS_API, SETUP_PEDAL_API, SETUP_REFRESH_API, SETUP_REFUSED } from '../../src/shared/routes.ts';
import type { ConnectionsStatus, JoinLink, PedalStatus, SetupInfo } from '../../src/shared/setup.ts';
import type { Snapshot } from '../../src/shared/snapshot.ts';
import { NowPlaying, Reconnecting } from './NowPlaying.tsx';
import { ConnectionsSetup } from './ConnectionsSetup.tsx';
import { PedalSetup } from './PedalSetup.tsx';
import { PowerWarning } from './PowerWarning.tsx';
import { RefreshButton } from './RefreshButton.tsx';

// The operator's check before rehearsal, on the playback laptop: whether Live is connected, where
// the set is, the playback Mac's battery warning, what is wrong with the locators, the foot pedal, the connections config and what each
// connection target cannot match in the set, and the QR codes that bring the iPad and the band's phones onto the right pages.

export function Setup({ snapshot, connected }: { snapshot: Snapshot | null; connected: boolean }) {
  return (
    <main className="setup">
      <h1>Setup</h1>
      {snapshot ? (
        <>
          <PowerWarning power={snapshot.power} />
          {!connected && <Reconnecting />}
          <p className={`live-status ${snapshot.live}`}>
            {snapshot.live === 'connected' ? 'Live connected' : 'Live not connected'}
          </p>
          <NowPlaying live={snapshot.live} set={snapshot.set} now={snapshot.now} jump={snapshot.jump} countIn={snapshot.countIn} loop={snapshot.loop} />
          <section className="set-actions" aria-label="Set">
            <RefreshButton live={snapshot.live} playing={snapshot.playing} available={connected} send={refreshFromLaptop} />
          </section>
          <Warnings set={snapshot.set} />
        </>
      ) : (
        <p className="status">Connecting to the server.</p>
      )}
      <PedalStatusPanel />
      <ConnectionsStatusPanel />
      <JoinCodes />
    </main>
  );
}

function refreshFromLaptop() {
  void fetch(SETUP_REFRESH_API, { method: 'POST' });
}

function Warnings({ set }: { set: Snapshot['set'] }) {
  return (
    <section className="setup-section" aria-labelledby="warnings">
      <h2 id="warnings">Warnings</h2>
      {!set ? (
        <p className="status">Waiting for Live to report the set.</p>
      ) : set.warnings.length === 0 ? (
        <p className="status">No warnings.</p>
      ) : (
        <ul className="warnings">
          {set.warnings.map((warning, index) => (
            <li key={index}>{warning.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Reads a laptop-only setup route again after each answer, so two reads are never in flight. A
// refusal never changes for this machine, so it ends the reads; a failure does not, so the screen
// recovers once a restarted server answers.
type SetupPoll<T> = { kind: 'loading' } | { kind: 'refused' } | { kind: 'failed' } | { kind: 'ready'; value: T };

function useSetupPoll<T>(api: string, ms: number): SetupPoll<T> {
  const [state, setState] = useState<SetupPoll<T>>({ kind: 'loading' });

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      fetch(api, { cache: 'no-store' })
        .then(async (response): Promise<SetupPoll<T>> => {
          if (response.status === 403) return { kind: 'refused' };
          if (!response.ok) return { kind: 'failed' };
          return { kind: 'ready', value: (await response.json()) as T };
        })
        .catch((): SetupPoll<T> => ({ kind: 'failed' }))
        .then((next) => {
          if (!current) return;
          setState(next);
          if (next.kind !== 'refused') timer = setTimeout(read, ms);
        });
    };
    read();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [api, ms]);

  return state;
}

// A few reads a second is plenty to watch the MIDI monitor while pressing each switch.
const PEDAL_POLL_MS = 250;

// The foot pedal's status comes from the laptop's own server on its own route, never in the snapshot
// every page gets.
function PedalStatusPanel() {
  const state = useSetupPoll<PedalStatus>(SETUP_PEDAL_API, PEDAL_POLL_MS);

  if (state.kind === 'ready') return <PedalSetup pedal={state.value} />;
  return (
    <section className="setup-section" aria-labelledby="pedal">
      <h2 id="pedal">Foot pedal</h2>
      {state.kind === 'loading' && <p className="status">Loading the foot pedal.</p>}
      {state.kind === 'refused' && <p className="status">{SETUP_REFUSED}</p>}
      {state.kind === 'failed' && <p className="status">Could not load the foot pedal. Trying again.</p>}
    </section>
  );
}

// A check runs on a Refresh, a set change or a target coming online, so a read a second shows each
// result soon enough.
const CONNECTIONS_POLL_MS = 1000;

// The setup screen watches as a viewer, whose snapshot never carries the connections, so the
// connections config and each target's row and pre-service check come from the laptop's own server
// on its own route, as the foot pedal's status does.
function ConnectionsStatusPanel() {
  const state = useSetupPoll<ConnectionsStatus>(SETUP_CONNECTIONS_API, CONNECTIONS_POLL_MS);

  if (state.kind === 'ready') return <ConnectionsSetup status={state.value} />;
  return (
    <section className="setup-section" aria-labelledby="setup-connections">
      <h2 id="setup-connections">Connections</h2>
      {state.kind === 'loading' && <p className="status">Loading the connections.</p>}
      {state.kind === 'refused' && <p className="status">{SETUP_REFUSED}</p>}
      {state.kind === 'failed' && <p className="status">Could not load the connections. Trying again.</p>}
    </section>
  );
}

type JoinCodesState = { kind: 'loading' } | { kind: 'refused' } | { kind: 'failed' } | { kind: 'ready'; info: SetupInfo };

// The codes come from the laptop's own server, with no network call beyond it.
function JoinCodes() {
  const [state, setState] = useState<JoinCodesState>({ kind: 'loading' });

  useEffect(() => {
    let current = true;
    fetch(SETUP_API)
      .then(async (response): Promise<JoinCodesState> => {
        if (response.status === 403) return { kind: 'refused' };
        if (!response.ok) return { kind: 'failed' };
        return { kind: 'ready', info: (await response.json()) as SetupInfo };
      })
      .catch((): JoinCodesState => ({ kind: 'failed' }))
      .then((next) => {
        if (current) setState(next);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <section className="setup-section" aria-labelledby="join">
      <h2 id="join">Join</h2>
      {state.kind === 'loading' && <p className="status">Loading the QR codes.</p>}
      {state.kind === 'refused' && <p className="status">{SETUP_REFUSED}</p>}
      {state.kind === 'failed' && <p className="status">Could not load the QR codes. Reload the page to try again.</p>}
      {state.kind === 'ready' && (
        <div className="join-codes">
          <JoinCode label="Leader (iPad)" link={state.info.leader} />
          <JoinCode label="Producer (iPad)" link={state.info.producer} />
          <JoinCode label="View only (band and FOH)" link={state.info.view} />
        </div>
      )}
    </section>
  );
}

function JoinCode({ label, link }: { label: string; link: JoinLink }) {
  return (
    <figure className="join-code">
      <QrCode modules={link.qr} label={`QR code for ${label}: ${link.url}`} />
      <figcaption>
        <span className="join-label">{label}</span>
        {link.urls.map((url) => (
          <span className="join-url" key={url}>
            {url}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// One unit square per dark module, on white, which every phone camera reads in a dark room too.
function QrCode({ modules, label }: { modules: boolean[][]; label: string }) {
  const size = modules.length;
  const dark = modules.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={dark} fill="#000" />
    </svg>
  );
}
