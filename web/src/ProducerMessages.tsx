import { useState } from 'react';
import type { DeviceCommand } from '../../src/shared/command.ts';
import { ROLE_LABELS, type Device } from '../../src/shared/devices.ts';
import { MAX_MESSAGE_TEXT, MESSAGE_PRESETS, messageText, type ActiveMessage, type MessageTarget } from '../../src/shared/messages.ts';
import { clockTime } from './clock-time.ts';

// The producer's messages to the band, under the Devices panel. First the active messages, newest
// first, each with who it was sent to and when, so the producer sees one that does not reach the
// producer page's own banner. A quick message sends at once to the
// devices picked under Send to, so the producer types nothing mid-song. Then the text box, who the
// message goes to, Send, and Clear, which takes every active message off every device. Chosen devices
// are picked from the Devices panel's list, by client ID, never by name, since two devices may share
// one. Every button is disabled while the page is not connected, as the panel's are.
export function ProducerMessages({
  devices,
  activeMessages,
  ownClient,
  connected,
  send,
}: {
  devices: Device[];
  activeMessages: ActiveMessage[];
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
      {activeMessages.length === 0 ? (
        <p className="status">No active message.</p>
      ) : (
        <ul className="message-active-list" aria-label="Active messages">
          {activeMessages.map((message) => (
            <li key={message.id} className="message-active">
              <span className="message-active-text">{message.text}</span>
              <span className="message-active-target">{targetLine(message.to, deviceLabels(devices))}</span>
              <span className="message-active-sent">{`Sent ${clockTime(message.sent)}`}</span>
            </li>
          ))}
        </ul>
      )}
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

// Who an active message was sent to. A chosen device is named as Send to names it, this producer page
// too where another producer page chose it; one that Clear offline took off the list is only counted,
// since its name went with it.
function targetLine(to: MessageTarget, labels: { client: string; label: string }[]): string {
  if (to === 'all') return 'To all devices';
  if (to === 'viewers') return 'To view-only devices';
  const named = to.flatMap((client) => labels.find((choice) => choice.client === client)?.label ?? []);
  const unlisted = to.length - named.length;
  if (unlisted > 0) named.push(`${unlisted} ${unlisted === 1 ? 'device' : 'devices'} no longer listed`);
  return `To ${named.join('; ')}`;
}

const buttonClass = (available: boolean) => (available ? 'connection-button' : 'connection-button unavailable');

// Every device but the producer page's own, in the Devices panel's order, labelled as deviceLabels
// labels it.
export function deviceChoices(devices: Device[], ownClient: string): { client: string; label: string }[] {
  return deviceLabels(devices).filter((choice) => choice.client !== ownClient);
}

// Every device, in the Devices panel's order, each labelled by its name and role, and offline where
// it is, since a message reaches it when it comes back. Two devices of one name and role add the start
// of their client ID, so the producer can tell them apart.
function deviceLabels(devices: Device[]): { client: string; label: string }[] {
  const named = (device: Device) => `${device.name}, ${ROLE_LABELS[device.role]}`;
  return devices.map((device) => {
    const shared = devices.some((other) => other !== device && named(other) === named(device));
    const label = `${named(device)}${shared ? ` (${device.client.slice(0, 4)})` : ''}${device.online ? '' : ', offline'}`;
    return { client: device.client, label };
  });
}
