import { useServerHealth } from '../api/health';

/** Whether the dashboard can reach the server and its database. */
export function ServerStatusCard() {
  const { data, isPending, isError, refetch, isFetching } = useServerHealth();

  let tone = 'neutral';
  let title = 'Checking the server…';
  let detail = '';
  if (isError) {
    tone = 'problem';
    title = "Can't reach the server";
    detail = 'Start it with npm run dev:server, then check again.';
  } else if (!isPending) {
    tone = data.status === 'ok' ? 'good' : 'coming-up';
    title = data.status === 'ok' ? 'Connected to the server' : 'Server is up, but its database is not';
    detail = `Version ${data.version} · database ${data.database}`;
  }

  return (
    <div className={`status status-${tone}`} role="status">
      <span className="status-title">{title}</span>
      {detail && <span className="status-detail">{detail}</span>}
      <button className="button" type="button" onClick={() => void refetch()} disabled={isFetching}>
        {isFetching ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}
