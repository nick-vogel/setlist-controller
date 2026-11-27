import type { DeviceCommand } from '../../src/shared/command.ts';
import { ROLE_LABELS, type Device } from '../../src/shared/devices.ts';
import type { ActiveMessage } from '../../src/shared/messages.ts';
import { clockTime } from './clock-time.ts';

// Every device in the hub's registry, in the order each first said hello: its name, its role, Online
// or Offline with the time it was last seen, and its battery. On the producer page a device that shows
// an active message, offline ones included, names it, so the producer sees who holds it; an offline
// device shows it when it comes back, whether or not it was online at the send. A device that
// dismissed it says so on its row alone (setlist-controller#33). Each other online device has Reload,
// which reloads that device's pages alone, and the panel has Clear offline, which forgets the offline
// rows; the producer's own row has no Reload, since a reload of the page pressing it drops the panel.
// The setup screen lists the devices with neither, since only the producer's socket may send them.
// Every button is disabled while the page is not connected.
export function DevicesPanel({
  devices,
  producer,
}: {
  devices: Device[];
  // The producer page's own client ID, its connection, its send and the active messages. With none, the
  // panel is the setup screen's and has no buttons.
  producer?: { ownClient: string; connected: boolean; send(command: DeviceCommand): void; activeMessages: ActiveMessage[] };
}) {
  const anyOffline = devices.some((device) => !device.online);
  const messageLine = (client: string) => {
    const shown = producer?.activeMessages.find((message) => message.shownBy.includes(client));
    return shown && <span className="device-message">{`Message: ${shown.text}${shown.dismissedBy.includes(client) ? ', dismissed' : ''}`}</span>;
  };
  return (
    <section className="devices" aria-labelledby="devices">
      <h2 id="devices">Devices</h2>
      {devices.length === 0 ? (
        <p className="status">No device has connected yet.</p>
      ) : (
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.client} className={device.online ? 'device' : 'device offline'} aria-label={device.name}>
              <span className="device-name">{device.name}</span>
              <span className="device-role">{ROLE_LABELS[device.role]}</span>
              <span className="device-status">{device.online ? 'Online' : lastSeenLine(device.lastSeen)}</span>
              <span className="device-battery">{device.battery === null ? 'Battery not reported' : `Battery ${device.battery}%`}</span>
              {messageLine(device.client)}
              {producer && device.online && device.client !== producer.ownClient && (
                <button
                  type="button"
                  className={producer.connected ? 'connection-button device-reload' : 'connection-button device-reload unavailable'}
                  disabled={!producer.connected}
                  onClick={() => producer.send({ kind: 'reload', client: device.client })}
                >
                  Reload
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {producer && (
        <button
          type="button"
          className={producer.connected && anyOffline ? 'connection-button' : 'connection-button unavailable'}
          disabled={!producer.connected || !anyOffline}
          onClick={() => producer.send({ kind: 'clear-offline' })}
        >
          Clear offline
        </button>
      )}
    </section>
  );
}

// The time the device's last socket closed, by the server's clock.
function lastSeenLine(lastSeen: number | null): string {
  if (lastSeen === null) return 'Offline';
  return `Offline, last seen ${clockTime(lastSeen)}`;
}
