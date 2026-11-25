import type { ConnectionsStatus } from '../../src/shared/setup.ts';
import { ConnectionProblems } from './ConnectionsPanel.tsx';
import { CheckResult } from './PreServiceCheck.tsx';

// The setup screen's Connections section: what the server made of the connections config file, and
// each target's label, whether it is online, its pre-service check and any problem it reports
// reaching it, such as a connect that failed, or, for a target the file disabled, why it is not
// configured. The operator sees on the laptop what to fix before the service.

const CONFIG_LABELS: Record<ConnectionsStatus['config'], string> = {
  loaded: 'Connections config loaded.',
  missing: 'No connections config.',
  invalid: 'Connections config rejected.',
};

export function ConnectionsSetup({ status }: { status: ConnectionsStatus }) {
  const { configPath, config, problems, connections } = status;
  return (
    <section className="setup-section" aria-labelledby="setup-connections">
      <h2 id="setup-connections">Connections</h2>
      <p className={`connections-config ${config}`}>{CONFIG_LABELS[config]}</p>
      {configPath && (
        <p className="connections-path">
          File: <code>{configPath}</code>
        </p>
      )}
      {problems.length > 0 ? (
        <ConnectionProblems problems={problems} />
      ) : connections.length === 0 ? (
        <p className="status">No connections are configured.</p>
      ) : (
        <ul className="setup-connections">
          {connections.map(({ name, label, configured, problems, connection, check }) => (
            <li key={name} className={configured ? undefined : 'not-configured'} aria-label={label}>
              <span className="setup-connection-label">{label}</span>{' '}
              <span className="setup-connection-status">{!configured ? 'Not configured' : connection === 'online' ? 'Online' : 'Offline'}</span>
              {configured && <CheckResult check={check} />}
              {(!configured || problems.length > 0) && <ConnectionProblems problems={problems} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
