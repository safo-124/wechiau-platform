import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatGhs, type FarmersPage as Farmers } from '@wechiau/shared';
import { useState } from 'react';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { Card, ErrorText, Loading, Notice, Pill, Progress } from '../components/ui';
import { ago, LANGUAGES } from '../format';

/** Farmers and vet assignment (design: web-dashboard/Farmers). Only the admin assigns vets; every farmer needs one. */
export function FarmersPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, error, isPending } = useQuery({ queryKey: ['farmers'], queryFn: () => api<Farmers>('/dashboard/farmers') });
  const assign = useMutation({
    mutationFn: ({ farmerId, vetId }: { farmerId: string; vetId: string }) =>
      api<void>(`/dashboard/farmers/${farmerId}/vet`, { method: 'POST', body: { vet_id: vetId } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['farmers'] });
      void client.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  if (isPending) return <Loading what="farmers" />;
  if (error) return <ErrorText error={error} />;

  const query = search.trim().toLowerCase();
  const rows = data.farmers.filter(
    (f) => !query || f.name.toLowerCase().includes(query) || (f.digitalAddress ?? '').toLowerCase().includes(query),
  );
  const noVet = data.farmers.filter((f) => !f.vetId);
  const mostFarmers = Math.max(1, ...data.vets.map((v) => v.farmers));

  return (
    <>
      <PageHeader title="Farmers">Assign each farmer a vet. The vet and the farmer's phone get the change at their next sync.</PageHeader>
      <div className="row">
        <Card className="grow-3">
          <label className="field narrow">
            <span>Search farmers</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or digital address" />
          </label>
          <ErrorText error={assign.error} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Farmer</th>
                  <th>Birds (checked / reported)</th>
                  <th>Vet</th>
                  <th>Location</th>
                  <th>This month</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.name}</strong>
                      <div className="muted small">{f.language ? LANGUAGES[f.language] : ''}</div>
                    </td>
                    <td>
                      <strong>{f.verified ?? '–'}</strong> /{' '}
                      <span className={f.reported !== null && f.verified !== null && f.reported < f.verified ? 'red strong' : 'muted'}>{f.reported ?? '–'}</span>
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`vet-${f.id}`}>
                        Vet for {f.name}
                      </label>
                      <select
                        id={`vet-${f.id}`}
                        className={f.vetId ? '' : 'select-problem'}
                        value={f.vetId ?? ''}
                        disabled={assign.isPending}
                        onChange={(e) => e.target.value && assign.mutate({ farmerId: f.id, vetId: e.target.value })}
                      >
                        {!f.vetId ? <option value="">No vet</option> : null}
                        {data.vets.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <strong className={f.digitalAddress ? '' : 'amber'}>{f.digitalAddress ?? 'Missing'}</strong>
                      <div className="muted small">{f.landmark ?? ''}</div>
                    </td>
                    <td>
                      {f.monthCrates} crates · {formatGhs(f.monthPaid)}
                    </td>
                    <td>
                      <Pill tone={f.tag.tone}>{f.tag.label}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Reported counts come from farmers. Checked counts come from vets and field visits.</p>
        </Card>

        <div className="column grow-1">
          <Card title="Vet workload">
            {data.vets.length === 0 ? <p className="muted">No active vets. Add them in Settings.</p> : null}
            {data.vets.map((v) => (
              <div key={v.id} className="workload">
                <div className="spread">
                  <strong>{v.name}</strong>
                  <span>
                    {v.farmers} farmer{v.farmers === 1 ? '' : 's'} · {v.openCases} open case{v.openCases === 1 ? '' : 's'}
                  </span>
                </div>
                <Progress value={v.farmers} max={mostFarmers} />
                <span className="muted small">Last seen {ago(v.lastSeen)}</span>
              </div>
            ))}
          </Card>
          {noVet.length ? (
            <Notice tone="problem">
              <strong>
                {noVet.length} farmer{noVet.length === 1 ? ' has' : 's have'} no vet. Choose one in the table.
              </strong>
            </Notice>
          ) : (
            <Notice tone="good">
              <strong>Every farmer has a vet</strong>
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}
