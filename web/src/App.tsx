import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { nameKey } from '../../src/shared/match-name.ts';
import type { PageCommand } from '../../src/shared/command.ts';
import { CHARTS_API, controls, isSetupPage, pageRole, type Role } from '../../src/shared/routes.ts';
import { activeSong } from '../../src/shared/safe-mode.ts';
import type { SetCharts } from '../../src/shared/set-manifest.ts';
import type { DeviceHello } from '../../src/shared/devices.ts';
import type { BandMessage } from '../../src/shared/messages.ts';
import { powerWarning, type PowerWarningLevel } from '../../src/shared/power.ts';
import type { ProducerSnapshot, Snapshot } from '../../src/shared/snapshot.ts';
import { AutoLockTip } from './AutoLockTip.tsx';
import { watchBattery, type BatteryNavigator } from './battery.ts';
import { ChartView } from './ChartView.tsx';
import { ChordNamesPicker } from './ChordNamesPicker.tsx';
import { ConnectionsPanel } from './ConnectionsPanel.tsx';
import { CountInButton } from './CountInButton.tsx';
import {
  FONT_SIZES,
  defaultDeviceName,
  defaultDisplay,
  readCapo,
  readChordNames,
  readClientId,
  readDeviceName,
  readDismissedMessages,
  readDisplay,
  readFontSize,
  readLeaderView,
  readPart,
  readTipShown,
  readView,
  storeCapo,
  storeChordNames,
  storeDeviceName,
  storeDismissedMessage,
  watchDismissedMessages,
  storeDisplay,
  storeFontSize,
  storeLeaderView,
  storePart,
  storeTipShown,
  storeView,
  watchDeviceName,
  type ChordNames,
  type DeviceStorage,
  type Display,
  type FontSize,
  type LeaderView,
  type Part,
  type View,
} from './device-settings.ts';
import { DeviceNameField } from './DeviceNameField.tsx';
import { DevicesPanel } from './DevicesPanel.tsx';
import { DisplayPicker } from './DisplayPicker.tsx';
import { formatSeconds, setSeconds, songSeconds } from './durations.ts';
import { FadeOutButton } from './FadeOutButton.tsx';
import { FontSizePicker } from './FontSizePicker.tsx';
import { JumpTargets } from './JumpTargets.tsx';
import { LeaderViewSwitcher } from './LeaderViewSwitcher.tsx';
import { MessageBanner } from './MessageBanner.tsx';
import { LiveNotConnected, NowPlaying, Reconnecting } from './NowPlaying.tsx';
import { PartPicker } from './PartPicker.tsx';
import { PlayFromStartButton } from './PlayFromStartButton.tsx';
import { PowerWarning } from './PowerWarning.tsx';
import { ProducerMessages } from './ProducerMessages.tsx';
import { RefreshButton } from './RefreshButton.tsx';
import { SafeModeToggle } from './SafeModeToggle.tsx';
import { SectionControls } from './SectionControls.tsx';
import { sectionState } from './section-state.ts';
import { connectToServer, type ServerConnection } from './server-connection.ts';
import { Setup } from './Setup.tsx';
import { SongHeading } from './SongHeading.tsx';
import { SongStepButton } from './SongStepButton.tsx';
import { StageStatusLine } from './StageStatusLine.tsx';
import { StopButton } from './StopButton.tsx';
import { TimelineView } from './TimelineView.tsx';
import { ViewPicker } from './ViewPicker.tsx';

export function App() {
  const { role, socketPath } = pageRole(location.pathname);
  const setup = isSetupPage(location.pathname);
  // The page's client ID, read once from the device for its role, and the name the device goes by,
  // stored on every change and read again when another tab stores one. A device with no name typed
  // goes by its role or its part.
  const [clientId] = useState(() => readClientId(deviceStorage(), role));
  const [deviceName, setDeviceName] = useState(() => readDeviceName(deviceStorage()) ?? '');
  const onDeviceName = useCallback((typed: string) => {
    setDeviceName(typed);
    storeDeviceName(deviceStorage(), typed);
  }, []);
  useEffect(() => watchDeviceName(window, deviceStorage(), (name) => setDeviceName(name ?? '')), []);
  const battery = useBattery(!setup);
  // The band member's part, read once from the device and stored on every change, and the display
  // the device keeps for that part, read again for each part picked.
  const [part, setPart] = useState(() => readPart(deviceStorage()));
  const [display, setDisplay] = useState<Display | null>(() => (part === null ? null : readDisplay(deviceStorage(), part)));
  const onPart = useCallback((picked: Part | null) => {
    setPart(picked);
    storePart(deviceStorage(), picked);
    setDisplay(picked === null ? null : readDisplay(deviceStorage(), picked));
  }, []);
  const onDisplay = useCallback(
    (picked: Display) => {
      setDisplay(picked);
      if (part !== null) storeDisplay(deviceStorage(), part, picked);
    },
    [part],
  );
  // The chart view's layout and text size, one each for the device whatever the part.
  const [view, setView] = useState(() => readView(deviceStorage()));
  const onView = useCallback((picked: View) => {
    setView(picked);
    storeView(deviceStorage(), picked);
  }, []);
  const [fontSize, setFontSize] = useState(() => readFontSize(deviceStorage()));
  const onFontSize = useCallback((picked: FontSize) => {
    setFontSize(picked);
    storeFontSize(deviceStorage(), picked);
  }, []);
  // The chord names, one for the device, and each song's capo, kept by its title as the name rule
  // reads it: read from the device the first time a song asks, and stored on every change.
  const [chordNames, setChordNames] = useState(() => readChordNames(deviceStorage()));
  const onChordNames = useCallback((picked: ChordNames) => {
    setChordNames(picked);
    storeChordNames(deviceStorage(), picked);
  }, []);
  const [capos, setCapos] = useState<ReadonlyMap<string, number>>(() => new Map());
  // The capos read from the device, each once.
  const stored = useRef(new Map<string, number>());
  const capoOf = useCallback(
    (title: string) => {
      const key = nameKey(title);
      const picked = capos.get(key);
      if (picked !== undefined) return picked;
      const held = stored.current.get(key) ?? readCapo(deviceStorage(), title);
      stored.current.set(key, held);
      return held;
    },
    [capos],
  );
  const onCapo = useCallback((title: string, capo: number) => {
    setCapos((held) => new Map(held).set(nameKey(title), capo));
    storeCapo(deviceStorage(), title, capo);
  }, []);

  // The leader page's Setlist / Timeline choice, persisted per device; ignored on other pages.
  const [leaderView, setLeaderView] = useState<LeaderView>(() => readLeaderView(deviceStorage()));
  const onLeaderView = useCallback((picked: LeaderView) => {
    setLeaderView(picked);
    storeLeaderView(deviceStorage(), picked);
  }, []);

  // The Auto-Lock tip, on the view-only page of a device that has not shown it yet. Read once, so it
  // stays for the visit once the device marks it shown.
  const [tip] = useState(() => role === 'viewer' && !setup && !readTipShown(deviceStorage()));
  const onTipShown = useCallback(() => storeTipShown(deviceStorage()), []);

  // Every page but the setup screen says hello on each socket, so the producer's Devices panel lists
  // it. The setup screen is the laptop's own, not a device on the stage.
  const hello: DeviceHello | null = setup ? null : { kind: 'hello', client: clientId, name: deviceName.trim() || defaultDeviceName(role, part), battery };
  const { snapshot, connected, send, message } = useServer(socketPath, hello);
  // The IDs of the producer's messages this device dismissed, stored on every dismiss and read again
  // when another tab of the page stores one. A dismissed message stays hidden when the hub sends it
  // again, and a newer one, with a new ID, shows.
  const [dismissed, setDismissed] = useState<readonly string[]>(() => readDismissedMessages(deviceStorage(), role));
  const onDismissMessage = useCallback(
    (id: string) => {
      setDismissed((held) => [...held, id]);
      storeDismissedMessage(deviceStorage(), role, id);
    },
    [role],
  );
  useEffect(() => watchDismissedMessages(window, deviceStorage(), role, setDismissed), [role]);
  const shownMessage = message !== null && !dismissed.includes(message.id) ? message : null;
  // Held in the page's memory alone, not the device's storage as a dismissed message is: a reload
  // shows the battery warning again.
  const [dismissedPower, setDismissedPower] = useState<PowerWarningLevel | null>(null);
  const warningNow = snapshot ? powerWarning(snapshot.power) : null;
  if (dismissedPower !== null && dismissedPower !== warningNow) setDismissedPower(null);
  // Only the view-only page draws the chart view, so only it fetches the charts.
  const charts = useCharts(role === 'viewer' && !setup, snapshot?.chartRevision, connected);

  if (setup) return <Setup snapshot={snapshot} connected={connected} dismissedPower={dismissedPower} onDismissPower={setDismissedPower} />;
  if (!snapshot) return <p className="status">Connecting to the server.</p>;
  return (
    <Page
      role={role}
      snapshot={snapshot}
      connected={connected}
      send={send}
      part={part}
      onPart={onPart}
      display={display ?? undefined}
      onDisplay={onDisplay}
      charts={charts}
      view={view}
      onView={onView}
      fontSize={fontSize}
      onFontSize={onFontSize}
      chordNames={chordNames}
      onChordNames={onChordNames}
      capoOf={capoOf}
      onCapo={onCapo}
      tip={tip}
      onTipShown={onTipShown}
      leaderView={leaderView}
      onLeaderView={onLeaderView}
      clientId={clientId}
      deviceName={deviceName}
      onDeviceName={onDeviceName}
      message={shownMessage}
      onDismissMessage={onDismissMessage}
      dismissedPower={dismissedPower}
      onDismissPower={setDismissedPower}
    />
  );
}

// The browser's localStorage, or none where reading it throws, as it can with storage blocked.
function deviceStorage(): DeviceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

// The leader page, the producer page or the view-only page, once the server has sent a snapshot. The
// producer page is the leader page plus the Connections, Message the band and Devices panels, from the
// producer's own snapshot. The producer's message, when there is one, opens every page it reaches. The
// view-only page opens on the band member's part picker, and with a part it shows the chart view in
// place of the now-playing panel and the setlist, with the display picker after the part picker, and,
// in the chords over lyrics display, the chord names picker after it. With no display the chart view
// opens on the part's default.
export function Page({
  role,
  snapshot,
  connected,
  send,
  part = null,
  onPart = () => {},
  display,
  onDisplay = () => {},
  charts = null,
  view = 'song',
  onView = () => {},
  fontSize = 'medium',
  onFontSize = () => {},
  chordNames = 'letters',
  onChordNames = () => {},
  capoOf = () => 0,
  onCapo = () => {},
  tip = false,
  onTipShown = () => {},
  leaderView = 'setlist',
  onLeaderView = () => {},
  clientId = '',
  deviceName = '',
  onDeviceName = () => {},
  message = null,
  onDismissMessage = () => {},
  dismissedPower = null,
  onDismissPower = () => {},
}: {
  role: Role;
  snapshot: Snapshot | ProducerSnapshot;
  connected: boolean;
  send(command: PageCommand): void;
  part?: Part | null;
  onPart?(part: Part | null): void;
  display?: Display;
  onDisplay?(display: Display): void;
  // The set's charts, as the view-only page last fetched them, or null before the first fetch.
  charts?: SetCharts | null;
  // The chart view's layout, as the device keeps it: the shown song alone, or the whole set.
  view?: View;
  onView?(view: View): void;
  // The chart text's size, as the device keeps it.
  fontSize?: FontSize;
  onFontSize?(fontSize: FontSize): void;
  // The chords by their letters or their Nashville numbers, as the device keeps it.
  chordNames?: ChordNames;
  onChordNames?(chordNames: ChordNames): void;
  // The capo the device keeps for a song, by its title, 0 for none, and a change to it.
  capoOf?(title: string): number;
  onCapo?(title: string, capo: number): void;
  // Whether the view-only page shows the Auto-Lock tip, which it marks shown once drawn.
  tip?: boolean;
  onTipShown?(): void;
  // The leader page's Setlist / Timeline view choice. Ignored on the producer and view-only pages.
  leaderView?: LeaderView;
  onLeaderView?(view: LeaderView): void;
  // The device's client ID, which the producer's own row is known by, and the name it goes by as
  // typed, empty for its default.
  clientId?: string;
  deviceName?: string;
  onDeviceName?(name: string): void;
  // The producer's message to this device, or null for none or one the device dismissed.
  message?: BandMessage | null;
  onDismissMessage?(id: string): void;
  dismissedPower?: PowerWarningLevel | null;
  onDismissPower?(warning: PowerWarningLevel): void;
}) {
  // The panel does not wait for a set: the connections are not Live's. A pick does, since it is kept
  // for the set, and the server drops one while it has read none.
  const connections = role === 'producer' && 'connections' in snapshot && (
    <>
      <ConnectionsPanel connections={snapshot.connections} problems={snapshot.connectionProblems} connected={connected} setKnown={snapshot.set !== null} send={send} />
      <ProducerMessages devices={snapshot.devices} activeMessages={snapshot.activeMessages} ownClient={clientId} connected={connected} send={send} />
      <DevicesPanel devices={snapshot.devices} producer={{ ownClient: clientId, connected, send, activeMessages: snapshot.activeMessages }} />
    </>
  );
  // The name field: after the pickers and the Auto-Lock tip on the view-only page, under the Devices
  // panel on the producer page, and last on the leader's Setlist page.
  const nameField = <DeviceNameField name={deviceName} placeholder={defaultDeviceName(role, part)} onName={onDeviceName} />;

  const messageBanner = <MessageBanner message={message} onDismiss={onDismissMessage} />;
  // The playback Mac's battery warning, at the top of the leader's and producer's pages, never the
  // band's, and not at the warning the page dismissed.
  const warning = powerWarning(snapshot.power);
  const powerShown = role !== 'viewer' && warning !== null && warning !== dismissedPower;
  const picker = role === 'viewer' && <PartPicker part={part} onPart={onPart} />;
  // After the pickers, on the view-only page only.
  const autoLockTip = role === 'viewer' && tip && <AutoLockTip onShown={onTipShown} />;

  // The leader page opens on the stage status line, which also says the server is out of reach.
  // Every other page shows the Reconnecting banner for that. Either one comes first in the page's top
  // layer, ahead of the producer's message and then the battery warning, so neither covers it.
  const stageStatusLine = role === 'leader' && <StageStatusLine snapshot={snapshot} connected={connected} />;
  const reconnecting = !connected && role !== 'leader' && <Reconnecting />;
  const pageTop = (stageStatusLine || reconnecting || message || powerShown) && (
    <div className="page-top">
      {reconnecting}
      {stageStatusLine}
      {messageBanner}
      {powerShown && <PowerWarning power={snapshot.power} onDismiss={onDismissPower} />}
    </div>
  );
  const leaderPage = role === 'leader' ? 'leader-page' : undefined;

  if (!snapshot.set || snapshot.set.songs.length === 0) {
    return (
      <main className={leaderPage}>
        {pageTop}
        {picker}
        {autoLockTip}
        {role === 'viewer' && nameField}
        {controls(role) && (
          <div className="leader-mode-bar">
            <SafeModeToggle safeMode={snapshot.safeMode} available={connected} send={send} />
          </div>
        )}
        {snapshot.live === 'not-connected' ? (
          <LiveNotConnected />
        ) : (
          <p className="status">{snapshot.set ? 'The set in Live has no songs.' : 'Waiting for Live.'}</p>
        )}
        {connections}
        {controls(role) && nameField}
      </main>
    );
  }

  const { live, playing, now, jump, countIn, endToggles, loop, fade, safeMode } = snapshot;
  const liveReady = connected && live === 'connected';
  const controlsLive = controls(role);
  // The song the playhead is in, for the transport row's Count in and Play from start: none on an End
  // or between songs.
  const playheadSong = snapshot.set.songs.find((song) => song.number === now?.song);
  // How long the whole set plays, gaps included, over the setlist.
  const setTotal = setSeconds(snapshot.set, snapshot.songTimings);

  if (picker && part !== null) {
    // The chart text's scale, set on the page so the strip and the songs both take it. Medium sets
    // none, and the stylesheet reads 1.
    const scale = FONT_SIZES.find((size) => size.value === fontSize)?.scale ?? 1;
    const style = scale === 1 ? undefined : ({ '--chart-font-scale': scale } as CSSProperties);
    const shownDisplay = display ?? defaultDisplay(part);
    return (
      <main className="chart-page" style={style}>
        {pageTop}
        {picker}
        <DisplayPicker display={shownDisplay} onDisplay={onDisplay} />
        {shownDisplay === 'chords-over-lyrics' && <ChordNamesPicker chordNames={chordNames} onChordNames={onChordNames} />}
        <ViewPicker view={view} onView={onView} />
        <FontSizePicker fontSize={fontSize} onFontSize={onFontSize} />
        {autoLockTip}
        {nameField}
        {live === 'not-connected' && <LiveNotConnected />}
        <ChartView
          set={snapshot.set}
          now={now}
          jump={jump}
          countIn={countIn}
          loop={loop}
          charts={charts}
          display={shownDisplay}
          view={view}
          fontSize={fontSize}
          chordNames={chordNames}
          capoOf={capoOf}
          onCapo={onCapo}
        />
      </main>
    );
  }

  if (role === 'leader' && leaderView === 'timeline') {
    return (
      <main className="timeline-page leader-page">
        {pageTop}
        <TimelineView
          set={snapshot.set}
          snapshot={snapshot}
          connected={connected}
          leaderView={leaderView}
          onLeaderView={onLeaderView}
          send={send}
        />
      </main>
    );
  }

  return (
    <main className={leaderPage}>
      {pageTop}
      {picker}
      {autoLockTip}
      {role === 'viewer' && nameField}
      {controlsLive && (
        <div className="leader-mode-bar">
          <SafeModeToggle safeMode={safeMode} available={connected} send={send} />
          {role === 'leader' && <LeaderViewSwitcher leaderView={leaderView} onLeaderView={onLeaderView} />}
        </div>
      )}
      <NowPlaying live={live} set={snapshot.set} now={now} jump={jump} countIn={countIn} loop={loop} timings={snapshot.songTimings} position={snapshot.position} playing={playing} />
      {controlsLive && (
        <section className="transport" aria-label="Transport">
          <StopButton available={liveReady} send={send} />
          <FadeOutButton available={liveReady} playing={playing} fade={fade} send={send} />
          <CountInButton song={playheadSong} now={now} playable={liveReady} playing={playing} send={send} />
          <PlayFromStartButton song={playheadSong} playable={liveReady} send={send} />
          <SongStepButton step="previous" set={snapshot.set} now={now} playable={liveReady} playing={playing} countIn={countIn} send={send} />
          <SongStepButton step="next" set={snapshot.set} now={now} playable={liveReady} playing={playing} countIn={countIn} send={send} />
        </section>
      )}
      {controlsLive && <SectionControls set={snapshot.set} now={now} jump={jump} countIn={countIn} loop={loop} available={connected} send={send} />}
      {controlsLive && <JumpTargets set={snapshot.set} now={now} jump={jump} countIn={countIn} loop={loop} available={connected} send={send} />}
      {controlsLive && (
        <section className="set-actions" aria-label="Set">
          <RefreshButton live={live} playing={playing} available={connected} send={send} />
        </section>
      )}
      {connections}
      {role === 'producer' && nameField}
      {setTotal && <p className="set-duration">{`Set ${setTotal.atLeast ? 'at least ' : ''}${formatSeconds(setTotal.seconds)}`}</p>}
      {snapshot.set.songs.map((song) => (
        <section className="song" key={song.number}>
          {/* The server holds a toggle for every song in the set. */}
          <SongHeading
            song={song}
            toggle={endToggles[song.number]!}
            role={role}
            available={connected}
            playable={liveReady}
            playing={playing}
            safeMode={safeMode}
            activeSong={activeSong(countIn, jump, now)}
            now={now}
            seconds={songSeconds(song, snapshot.songTimings[song.number])}
            send={send}
          />
          <ol className="sections">
            {song.sections.map((section, index) => {
              const { classes } = sectionState({ song: song.number, section: index }, now, jump, loop);
              return (
                <li key={section.time} className={classes || undefined}>
                  {section.name}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {role === 'leader' && nameField}
    </main>
  );
}

// A failed fetch of the charts is tried again after this long, while the page is still behind.
const CHARTS_RETRY_MS = 1000;

// The set's charts, fetched from the server when the snapshot's chart revision is not the one the page
// fetched them for, and again each time the page connects, since a restarted server counts its
// revision from 1 again. A failed fetch keeps the charts the page had and is tried again while it is
// behind.
function useCharts(enabled: boolean, revision: number | undefined, connected: boolean): SetCharts | null {
  // The charts, with the snapshot's revision and the connection they were fetched for.
  const [held, setHeld] = useState<{ charts: SetCharts; revision: number; connection: number } | null>(null);
  const [retry, setRetry] = useState(0);
  // Counts the connections the page has opened, the first one 1.
  const [connection, setConnection] = useState({ connected, count: connected ? 1 : 0 });
  if (connection.connected !== connected) setConnection({ connected, count: connection.count + (connected ? 1 : 0) });
  const count = connection.count;

  useEffect(() => {
    if (!enabled || !connected || revision === undefined) return;
    if (held && held.connection === count && held.revision === revision) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch(CHARTS_API, { cache: 'no-store', signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`The charts answered ${response.status}`);
        return response.json() as Promise<SetCharts>;
      })
      .then((charts) => setHeld({ charts, revision, connection: count }))
      .catch(() => {
        if (!abort.signal.aborted) timer = setTimeout(() => setRetry((tries) => tries + 1), CHARTS_RETRY_MS);
      });
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [enabled, connected, revision, count, held, retry]);

  return held?.charts ?? null;
}

// The leader's and producer's socket paths carry the secret from the page's own path. The hello, when
// there is one, goes on every socket and again on each change.
function useServer(
  socketPath: string,
  hello: DeviceHello | null,
): { snapshot: Snapshot | ProducerSnapshot | null; connected: boolean; send(command: PageCommand): void; message: BandMessage | null } {
  const [snapshot, setSnapshot] = useState<Snapshot | ProducerSnapshot | null>(null);
  // The device's active message from the producer, kept while the connection is down, as the
  // snapshot is, until the hub answers the next hello.
  const [message, setMessage] = useState<BandMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const connection = useRef<ServerConnection | null>(null);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // The page keeps its last snapshot while the connection is down, until the next one arrives.
    const opened = connectToServer({
      url: `${protocol}//${location.host}${socketPath}`,
      onSnapshot: setSnapshot,
      onStatus: setConnected,
      onMessage: setMessage,
      visibility: document,
    });
    connection.current = opened;
    return () => {
      connection.current = null;
      opened.close();
    };
  }, [socketPath]);

  // Declared after the connection's effect, so a first hello reaches the connection it made.
  const { client, name, battery } = hello ?? {};
  useEffect(() => {
    if (client !== undefined && name !== undefined && battery !== undefined) connection.current?.introduce({ kind: 'hello', client, name, battery });
  }, [client, name, battery, socketPath]);

  const send = useCallback((command: PageCommand) => connection.current?.send(command), []);

  return { snapshot, connected, send, message };
}

// The device's battery for its hello, watched while enabled.
function useBattery(enabled: boolean): number | null {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => (enabled ? watchBattery(navigator as unknown as BatteryNavigator, setPercent) : undefined), [enabled]);
  return percent;
}
