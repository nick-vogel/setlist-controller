import type { DeviceCommand } from '../../src/shared/command.ts';
import { ROLE_LABELS, type Device } from '../../src/shared/devices.ts';

// Every device in the hub's registry, in the order each first said hello: its name, its role, Online
// or Offline with the time it was last seen, and its battery. On the producer page each other online
// device has Reload, which reloads that device's pages alone, and the panel has Clear offline, which
// forgets the offline rows; the producer's own row has no Reload, since a reload of the page pressing
// it drops the panel. The setup screen lists the devices with neither, since only the producer's
// socket may send them. Every button is disabled while the page is not connected.
export function DevicesPanel({
  devices,
  producer,
}: {
  devices: Device[];
  // The producer page's own client ID, its connection and its send. With none, the panel is the setup
  // screen's and has no buttons.
  producer?: { ownClient: string; connected: boolean; send(command: DeviceCommand): void };
}) {
  const anyOffline = devices.some((device) => !device.online);
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

// The hour and minute the device's last socket closed, by the server's clock, in the page's time zone
// and locale.
function lastSeenLine(lastSeen: number | null): string {
  if (lastSeen === null) return 'Offline';
  return `Offline, last seen ${new Date(lastSeen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
