import { MAX_DEVICE_NAME } from '../../src/shared/devices.ts';

// The name this device goes by on the producer's Devices panel, on every page but the setup screen.
// The field shows the typed name, or the default as its placeholder; clearing it goes back to the
// default. Each change reaches the hub at once in the device's hello.
export function DeviceNameField({ name, placeholder, onName }: { name: string; placeholder: string; onName(name: string): void }) {
  return (
    <label className="device-name-field">
      <span className="device-name-field-label">Device name</span>
      <input
        className="device-name-input"
        type="text"
        value={name}
        placeholder={placeholder}
        maxLength={MAX_DEVICE_NAME}
        autoComplete="off"
        onChange={(event) => onName(event.target.value)}
      />
    </label>
  );
}
