import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatGhs, type ConversationSummary, type HealthPage as Health } from '@wechiau/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { Card, Chips, ErrorText, Loading, Notice, Pill, Progress } from '../components/ui';
import { ago, CHANNELS, day, dayTime, TRIAGE, TRIAGE_TONE } from '../format';

type Filter = 'open' | 'closed' | 'all';

/** Health, vets and vaccination (design: web-dashboard/Health). Vets make the health decisions; Gloria sees everything. */
export function HealthPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');
  const { data, error, isPending } = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/dashboard/health') });

  if (isPending) return <Loading what="health" />;
  if (error) return <ErrorText error={error} />;

  const cases = data.cases.filter((c) => filter === 'all' || c.status === filter);
  const unsafe = data.readings.filter((r) => !r.safe);
  const lowStock = data.stock.left < data.stock.alertBelow;

  return (
    <>
      <PageHeader title="Health and vets">Cases, vaccination rounds and the cold chain. The vets make the health decisions; you can see everything.</PageHeader>
      <div className="row">
        <Card
          title="Health cases"
          className="grow-3"
          aside={
            <Chips
              options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          }
        >
          {cases.length === 0 ? (
            <p className="muted">No cases here.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Urgency</th>
                    <th>Farmer and problem</th>
                    <th>Reported by</th>
                    <th>Vet</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.status === 'closed' ? (
                          <Pill tone="neutral">Closed</Pill>
                        ) : c.triage ? (
                          <Pill tone={TRIAGE_TONE[c.triage] ?? 'neutral'}>{TRIAGE[c.triage]}</Pill>
                        ) : c.triageSuggested ? (
                          <Pill tone={TRIAGE_TONE[c.triageSuggested] ?? 'neutral'}>AI: {TRIAGE[c.triageSuggested]?.toLowerCase()}</Pill>
                        ) : (
                          <Pill tone="neutral">Not checked</Pill>
                        )}
                      </td>
                      <td>
                        <strong>
                          {c.farmerName}: {c.summary}
                        </strong>
                        {c.followUpOn ? <div className="muted small">Follow up {day(c.followUpOn)}</div> : null}
                      </td>
                      <td>{CHANNELS[c.channel ?? ''] ?? 'Report'}</td>
                      <td>{c.vetName ?? <span className="red strong">No vet</span>}</td>
                      <td className="muted">{ago(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Urgency starts as an AI suggestion and is confirmed by a vet.</p>
        </Card>

        <div className="column grow-1">
          <Card title="Vets">
            {data.vets.map((v) => (
              <div key={v.id} className="list-item">
                <strong>{v.name}</strong>
                <span className="muted small">
                  {v.farmers} farmer{v.farmers === 1 ? '' : 's'} · {v.openCases} open case{v.openCases === 1 ? '' : 's'} · last seen {ago(v.lastSeen)}
                </span>
              </div>
            ))}
          </Card>
          <Card title="Cold chain, last 7 days">
            {data.readings.length === 0 ? (
              <p className="muted">No readings yet.</p>
            ) : unsafe.length ? (
              unsafe.map((r) => (
                <Notice key={r.id} tone="problem">
                  <strong>
                    {r.tempC}°C at {r.where}
                  </strong>{' '}
                  ({r.vetName ?? 'a vet'}, {dayTime(r.readAt)}). The vaccine should not be used.
                </Notice>
              ))
            ) : (
              <p className="green strong">All {data.readings.length} readings were in the safe range.</p>
            )}
            <span className="muted small">Safe range 2 to 8°C.</span>
          </Card>
        </div>
      </div>

      <MessagesCard />
      <StockHistory entries={data.stockHistory} />

      <Card title="Vaccination rounds" aside={<span className={lowStock ? 'red strong' : 'muted small'}>{data.stock.left} of {data.stock.received} doses left</span>}>
        <div className="rounds">
          {data.rounds.map((r, i) => (
            <div key={r.id} className="round">
              <div className="spread">
                <strong>
                  Round {r.number} · {r.isFree ? 'free' : r.pricePerDose ? `${formatGhs(r.pricePerDose)} a dose` : 'paid (price not set)'}
                </strong>
                <span>
                  {r.done} of {r.total} farms · {r.doses} doses
                </span>
              </div>
              <Progress value={r.done} max={r.total} />
              <span className="muted small">{r.date ? `From ${day(r.date)}` : ''}</span>
              <span className={r.deaths ? 'amber small strong' : 'muted small'}>
                {r.deaths} bird{r.deaths === 1 ? '' : 's'} found dead on visits {i < data.rounds.length - 1 ? 'before the next round' : 'since this round'}
              </span>
            </div>
          ))}
        </div>
        <ScheduleRound
          nextNumber={Math.min(3, (data.rounds.at(-1)?.number ?? 0) + 1)}
          full={data.rounds.length >= 3}
          onDone={() => void client.invalidateQueries({ queryKey: ['health'] })}
        />
      </Card>
    </>
  );
}

const STOCK_REASONS: Record<string, string> = { received: 'Received', used: 'Used', wasted: 'Wasted', adjustment: 'Stock count correction' };

/** Doses in and out, newest first (v0.3 phase 4: the vaccine stock ledger). */
function StockHistory({ entries }: { entries: Health['stockHistory'] }) {
  return (
    <Card title="Vaccine stock history">
      {entries.length === 0 ? (
        <p className="muted">No vaccine recorded yet. Vets add each batch in the vet app, under Stock.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Batch</th>
                <th>What happened</th>
                <th>By</th>
                <th className="right">Doses</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{dayTime(e.at)}</td>
                  <td>
                    <strong>{e.batchNo}</strong>
                    <div className="muted small">{e.vaccineName}</div>
                  </td>
                  <td>
                    {STOCK_REASONS[e.reason] ?? e.reason}
                    {e.farmerName ? ` · ${e.farmerName}'s farm` : ''}
                  </td>
                  <td className="muted">{e.by ?? ''}</td>
                  <td className={`right strong ${e.reason === 'wasted' ? 'red' : e.doses < 0 ? 'amber' : 'green'}`}>{e.doses > 0 ? `+${e.doses}` : e.doses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">The latest 50 entries. Doses left are worked out from these, never typed in.</p>
    </Card>
  );
}

/** Farmers' conversations with the vet team, newest first. Each opens on its own page. */
function MessagesCard() {
  const { data, error, isPending } = useQuery({ queryKey: ['messages'], queryFn: () => api<ConversationSummary[]>('/dashboard/messages') });
  return (
    <Card title="Messages from farmers">
      {isPending ? <Loading what="messages" /> : null}
      <ErrorText error={error} />
      {data && data.length === 0 ? <p className="muted">No messages yet. They appear here when farmers write or record a message in the farmer app.</p> : null}
      {data?.map((c) => (
        <Link key={c.farmerId} to={`/health/messages/${c.farmerId}`} className="list-item conversation-row">
          <div className="spread">
            <strong>{c.farmerName}</strong>
            <span className="muted small">{ago(c.lastAt)}</span>
          </div>
          <span className="small">
            {c.lastDirection === 'to_farmer' ? 'Vet team: ' : ''}
            {c.lastPreview}
          </span>
          <span className="muted small">
            {c.vetName ? `Vet: ${c.vetName}` : 'No vet yet'} · {c.fromFarmer} from the farmer
            {c.openCase ? ' · ' : ''}
            {c.openCase ? <Pill tone="comingUp">Open case</Pill> : null}
          </span>
        </Link>
      ))}
    </Card>
  );
}

function ScheduleRound({ nextNumber, full, onDone }: { nextNumber: number; full: boolean; onDone(): void }) {
  const [date, setDate] = useState('');
  const [free, setFree] = useState(nextNumber === 1);
  const schedule = useMutation({
    mutationFn: () => api<void>('/dashboard/rounds', { method: 'POST', body: { number: nextNumber, date, is_free: free } }),
    onSuccess: () => {
      setDate('');
      onDone();
    },
  });
  if (full) return <p className="muted small">All three rounds are scheduled.</p>;

  function submit(event: FormEvent) {
    event.preventDefault();
    schedule.mutate();
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <strong>Schedule round {nextNumber}</strong>
      <label className="field">
        <span>Starts on</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="check">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
        Free for farmers
      </label>
      <button className="button primary" type="submit" disabled={schedule.isPending}>
        Schedule
      </button>
      <ErrorText error={schedule.error} />
    </form>
  );
}
