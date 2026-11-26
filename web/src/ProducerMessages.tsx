import { useState } from 'react';
import type { DeviceCommand } from '../../src/shared/command.ts';
import { ROLE_LABELS, type Device } from '../../src/shared/devices.ts';
import { MAX_MESSAGE_TEXT, MESSAGE_PRESETS, messageText, type MessageTarget } from '../../src/shared/messages.ts';

// The producer's messages to the band, under the Devices panel: the quick messages, each of which
// sends at once to the devices picked under Send to, so the producer types nothing mid-song, the text
// box, who the message goes to, Send, and Clear, which takes every active message off every device. Chosen devices are picked from the Devices panel's list, by
// client ID, never by name, since two devices may share one. Every control is disabled while the
// page is not connected, as the panel's are.
export function ProducerMessages({
  devices,
  ownClient,
  connected,
  send,
}: {
  devices: Device[];
  ownClient: string;
  connected: boolean;
  send(command: DeviceCommand): void;
}) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'all' | 'viewers' | 'chosen'>('all');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const choices = deviceChoices(devices, ownClient);
  const picked = choices.filter((choice) => chosen.has(choice.client)).map((choice) => choice.client);
  const to: MessageTarget | null = target === 'chosen' ? (picked.length > 0 ? picked : null) : target;
  const kept = messageText(text);
  const reachable = connected && to !== null;
  const sendable = reachable && kept !== null;

  const toggle = (client: string) =>
    setChosen((held) => {
      const next = new Set(held);
      if (!next.delete(client)) next.add(client);
      return next;
    });

  return (
    <section className="messages" aria-labelledby="messages">
      <h2 id="messages">Message the band</h2>
      <div className="message-presets" role="group" aria-label="Quick messages">
        {MESSAGE_PRESETS.map((preset) => (
          <button key={preset} type="button" className={buttonClass(reachable)} disabled={!reachable} onClick={() => to !== null && send({ kind: 'message', text: preset, to })}>
            {preset}
          </button>
        ))}
      </div>
      <label className="message-text-field">
        <span className="message-field-label">Message</span>
        <input
          className="message-text-input"
          type="text"
          value={text}
          maxLength={MAX_MESSAGE_TEXT}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <fieldset className="message-target">
        <legend className="message-field-label">Send to</legend>
        {TARGETS.map(({ value, label }) => (
          <label key={value} className="message-choice">
            <input type="radio" name="message-target" value={value} checked={target === value} onChange={() => setTarget(value)} />
            {label}
          </label>
        ))}
        {target === 'chosen' &&
          (choices.length === 0 ? (
            <p className="message-field-label">No other device has connected yet.</p>
          ) : (
            <ul className="message-devices">
              {choices.map(({ client, label }) => (
                <li key={client}>
                  <label className="message-choice">
                    <input type="checkbox" checked={chosen.has(client)} onChange={() => toggle(client)} />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          ))}
      </fieldset>
      <div className="message-actions">
        <button
          type="button"
          className={buttonClass(sendable)}
          disabled={!sendable}
          onClick={() => {
            if (kept === null || to === null) return;
            send({ kind: 'message', text: kept, to });
            setText('');
          }}
        >
          Send
        </button>
        <button type="button" className={buttonClass(connected)} disabled={!connected} onClick={() => send({ kind: 'clear-messages' })}>
          Clear messages
        </button>
      </div>
    </section>
  );
}

const TARGETS = [
  { value: 'all', label: 'All devices' },
  { value: 'viewers', label: 'View-only devices' },
  { value: 'chosen', label: 'Chosen devices' },
] as const;

const buttonClass = (available: boolean) => (available ? 'connection-button' : 'connection-button unavailable');

// Every device but the producer page's own, in the Devices panel's order, each labelled by its name
// and role, and offline where it is, since a message reaches it when it comes back. Two devices of
// one name and role add the start of their client ID, so the producer can tell them apart.
export function deviceChoices(devices: Device[], ownClient: string): { client: string; label: string }[] {
  const others = devices.filter((device) => device.client !== ownClient);
  const named = (device: Device) => `${device.name}, ${ROLE_LABELS[device.role]}`;
  return others.map((device) => {
    const shared = others.some((other) => other !== device && named(other) === named(device));
    const label = `${named(device)}${shared ? ` (${device.client.slice(0, 4)})` : ''}${device.online ? '' : ', offline'}`;
    return { client: device.client, label };
  });
}
