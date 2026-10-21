import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatAmount,
  formatGhs,
  parseGhsInput,
  type Fund,
  type HandoverRequest,
  type LedgerRecordRequest,
  type MoneyPage as Money,
  type ReminderResponse,
} from '@wechiau/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { Card, Chips, ErrorText, Loading, Notice, Stat } from '../components/ui';
import { day, dayTime, ROLE_NAMES } from '../format';

type Filter = 'all' | 'collection' | 'sale_payment' | 'other';

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Money and the egg fund (design: web-dashboard/Money). Balances are worked out from the ledger, never stored. */
export function MoneyPage() {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [farmerId, setFarmerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['money'] });
    void client.invalidateQueries({ queryKey: ['overview'] });
  };
  const params = new URLSearchParams({ from, ...(to && { to }) }).toString();
  const { data, error, isPending } = useQuery({ queryKey: ['money', from, to], queryFn: () => api<Money>(`/dashboard/money?${params}`) });

  if (isPending) return <Loading what="the money" />;
  if (error) return <ErrorText error={error} />;

  const ledger = data.ledger
    .filter((r) => (filter === 'all' ? true : filter === 'other' ? r.source !== 'collection' && r.source !== 'sale_payment' : r.source === filter))
    .filter((r) => !farmerId || r.farmerId === farmerId);
  // Farmers with entries in these dates, for "By farmer".
  const farmers = [...new Map(data.ledger.filter((r) => r.farmerId).map((r) => [r.farmerId!, r.farmerName ?? 'A farmer'])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const paidToFarmer = farmerId ? -data.ledger.filter((r) => r.farmerId === farmerId).reduce((n, r) => n + r.amount, 0) : 0;

  return (
    <>
      <PageHeader title="Money">
        Egg fund ledger from {day(data.from)} to {day(data.to)}. Balances are worked out from these entries.
      </PageHeader>

      <div className="toolbar">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <a className="button" href={`/api/dashboard/money.csv?${params}`} download>
          Export CSV
        </a>
        <button type="button" className="button" onClick={() => setRecording((v) => !v)}>
          Add a grant or correction
        </button>
      </div>
      {recording ? (
        <RecordMoney
          onDone={() => {
            setRecording(false);
            refresh();
          }}
        />
      ) : null}

      <div className="stats">
        <Stat label="Cash in egg fund" value={formatGhs(data.summary.cash)} sub={`Started at ${formatGhs(data.summary.started)}`} tone={data.summary.cash < 0 ? 'problem' : 'good'} />
        <Stat label="Owed by buyers" value={<span className={data.summary.owed ? 'amber' : ''}>{formatGhs(data.summary.owed)}</span>} />
        <Stat label="Eggs in store" value={`${Math.max(data.summary.inStore, 0)} crates`} sub={`Worth ${formatGhs(data.summary.inStoreWorth)} in Wa`} />
        <Stat label="Gross margin" value={formatGhs(data.summary.margin)} sub={`${data.summary.cratesSold} crates sold`} />
      </div>

      <div className="row">
        <Card
          title="Ledger"
          className="grow-3"
          aside={
            <div className="toolbar">
              <Chips
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'collection', label: 'Collections' },
                  { value: 'sale_payment', label: 'Sales' },
                  { value: 'other', label: 'Other' },
                ]}
                value={filter}
                onChange={setFilter}
              />
              <label className="field">
                <span className="visually-hidden">By farmer</span>
                <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} aria-label="By farmer">
                  <option value="">Every farmer</option>
                  {farmers.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        >
          {farmerId ? (
            <Notice tone="money">
              Paid to {farmers.find(([id]) => id === farmerId)?.[1] ?? 'this farmer'} in these dates: <strong>{formatGhs(paidToFarmer)}</strong>, after corrections.
            </Notice>
          ) : null}
          {ledger.length === 0 ? (
            <p className="muted">No entries in these dates.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entry</th>
                    <th>By</th>
                    <th className="right">Amount (GHS)</th>
                    {farmerId ? null : <th className="right">Egg fund (GHS)</th>}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r) => (
                    <tr key={r.id}>
                      <td className="muted">{dayTime(r.at)}</td>
                      <td>
                        <strong>{r.entry}</strong>
                        {r.fund === 'vaccine' ? <span className="muted small"> · vaccine fund</span> : null}
                      </td>
                      <td className="muted">{r.by ?? ''}</td>
                      <td className={`right strong ${r.amount < 0 ? 'amber' : 'green'}`}>{formatAmount(r.amount, { signed: true })}</td>
                      {farmerId ? null : <td className="right">{r.balance === null ? '' : formatAmount(r.balance)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="column grow-1">
          <Card title="Buyers in Wa">
            {data.buyers.map((b) => (
              <BuyerRow key={b.id} buyer={b} />
            ))}
          </Card>
          <Card title="Cash held by each person">
            {data.people.map((p) => {
              const diff = p.lastCount ? p.lastCount.counted - p.lastCount.expected : 0;
              return (
                <div key={p.id} className="list-item">
                  <div className="spread">
                    <strong>
                      {p.name} <span className="muted small">{ROLE_NAMES[p.role]}</span>
                    </strong>
                    <strong>{formatGhs(p.cash)}</strong>
                  </div>
                  <span className={`small ${p.lastCount && diff !== 0 ? 'red strong' : 'muted'}`}>
                    {p.lastCount
                      ? `Counted ${dayTime(p.lastCount.at)}: ${diff === 0 ? 'matched' : `${formatGhs(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'}`}`
                      : 'Not counted yet'}
                  </span>
                </div>
              );
            })}
            {handingOver ? (
              <Handover
                people={data.people}
                onDone={() => {
                  setHandingOver(false);
                  refresh();
                }}
              />
            ) : (
              <button type="button" className="button" onClick={() => setHandingOver(true)}>
                Hand over cash
              </button>
            )}
            <p className="muted small">Cash you give an agent to pay farmers, or that an agent gives back. You can also record it in the field app, under Cash.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function BuyerRow({ buyer }: { buyer: Money['buyers'][number] }) {
  const remind = useMutation({
    mutationFn: () => api<ReminderResponse>(`/dashboard/sales/${buyer.owedSaleId}/reminder`, { method: 'POST' }),
  });
  return (
    <div className="list-item">
      <div className="spread">
        <strong>{buyer.name}</strong>
        <span className={buyer.owed ? 'amber strong' : ''}>
          {buyer.owed ? `Owes ${formatGhs(buyer.owed)}` : `${buyer.crates} crates · paid`}
        </span>
      </div>
      {buyer.owed && buyer.dueOn ? <span className="muted small">Due {day(buyer.dueOn)}</span> : null}
      {buyer.owed && buyer.owedSaleId ? (
        remind.isSuccess ? (
          <Notice tone="good">
            Reminder queued for {remind.data.to}: “{remind.data.body}” It goes out once the SMS service is set up; you can also send it from your phone.
          </Notice>
        ) : (
          <button type="button" className="button" disabled={!buyer.phone || remind.isPending} onClick={() => remind.mutate()}>
            {buyer.phone ? 'Send payment reminder' : 'No phone number saved'}
          </button>
        )
      ) : null}
      <ErrorText error={remind.error} />
    </div>
  );
}

/** A grant into a fund, or a correction with its reason. Entries are never edited, so a mistake gets another correction. */
function RecordMoney({ onDone }: { onDone(): void }) {
  const [kind, setKind] = useState<LedgerRecordRequest['kind']>('grant');
  const [fund, setFund] = useState<Fund>('egg');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const pesewas = parseGhsInput(amount);
  const record = useMutation({
    mutationFn: (body: LedgerRecordRequest) => api<{ id: string }>('/dashboard/ledger', { method: 'POST', body }),
    onSuccess: onDone,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pesewas) return;
    record.mutate(
      kind === 'grant'
        ? { kind, fund, amount: pesewas, note: note.trim() || null }
        : { kind, fund, amount: direction === 'in' ? pesewas : -pesewas, note: note.trim() },
    );
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <Chips
        options={[
          { value: 'grant', label: 'Grant' },
          { value: 'adjustment', label: 'Correction' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <label className="field">
        <span>Fund</span>
        <select value={fund} onChange={(e) => setFund(e.target.value as Fund)}>
          <option value="egg">Egg fund</option>
          <option value="vaccine">Vaccine fund</option>
        </select>
      </label>
      {kind === 'adjustment' ? (
        <label className="field">
          <span>Change</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
            <option value="in">Adds to the fund</option>
            <option value="out">Takes from the fund</option>
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>Amount (GHS)</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label className="field grow-1">
        <span>{kind === 'grant' ? 'What it is (optional)' : 'Reason'}</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'grant' ? 'Starting grant' : 'Counted GHS 5 short at month end'}
          required={kind === 'adjustment'}
          minLength={kind === 'adjustment' ? 3 : undefined}
          maxLength={300}
        />
      </label>
      <button className="button primary" type="submit" disabled={!pesewas || record.isPending}>
        Add to ledger
      </button>
      <p className="muted small">
        {kind === 'grant'
          ? 'Counts as cash you hold until you hand it to an agent.'
          : 'Ledger entries are never changed. If this one is wrong, add another correction.'}
      </p>
      <ErrorText error={record.error} />
    </form>
  );
}

function Handover({ people, onDone }: { people: Money['people']; onDone(): void }) {
  const { user: me } = useAuth();
  const [from, setFrom] = useState(people.some((p) => p.id === me.id) ? me.id : (people[0]?.id ?? ''));
  const [to, setTo] = useState(people.find((p) => p.id !== from)?.id ?? '');
  const [amount, setAmount] = useState('');
  const pesewas = parseGhsInput(amount);
  const handover = useMutation({
    mutationFn: (body: HandoverRequest) => api<{ id: string }>('/dashboard/handovers', { method: 'POST', body }),
    onSuccess: onDone,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pesewas) handover.mutate({ from_user_id: from, to_user_id: to, amount: pesewas });
  }

  const choices = people.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>From</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {choices}
        </select>
      </label>
      <label className="field">
        <span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {choices}
        </select>
      </label>
      <label className="field">
        <span>Amount (GHS)</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <button className="button primary" type="submit" disabled={!pesewas || from === to || handover.isPending}>
        Save handover
      </button>
      <ErrorText error={handover.error} />
    </form>
  );
}
