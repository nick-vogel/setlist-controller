import { useEffect } from 'react';

// The words of the tip, kept here so the tests and the README read the same copy.
export const AUTO_LOCK_TIP =
  'Tip: set Auto-Lock to Never for the service (Settings, Display & Brightness, Auto-Lock), so the screen does not lock mid-song. On Android, set Screen timeout to its longest.';

// The tip a band member's device shows once, on the view-only page: a phone that locks mid-song loses
// the chart. The page cannot keep the screen on itself, since the Screen Wake Lock needs HTTPS and the
// server serves plain HTTP. The device marks the tip shown once it is drawn, so a first open that never
// reached the server shows it next time. It has no button and nothing to dismiss: it stays for the
// visit and is gone after a reload.
export function AutoLockTip({ onShown }: { onShown(): void }) {
  useEffect(() => onShown(), [onShown]);
  return <p className="auto-lock-tip">{AUTO_LOCK_TIP}</p>;
}
