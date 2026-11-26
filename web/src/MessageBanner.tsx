import type { BandMessage } from '../../src/shared/messages.ts';

// The producer's message, at the top of every page it reaches and held there while the page
// scrolls, with Dismiss, which hides it on this device until a newer message comes. Nothing shows
// with no message, or once the device dismissed it.
export function MessageBanner({ message, onDismiss }: { message: BandMessage | null; onDismiss(id: string): void }) {
  if (message === null) return null;
  return (
    <div className="message-banner" role="alert">
      <p className="message-banner-text">{message.text}</p>
      <button type="button" className="message-banner-dismiss" onClick={() => onDismiss(message.id)}>
        Dismiss
      </button>
    </div>
  );
}
