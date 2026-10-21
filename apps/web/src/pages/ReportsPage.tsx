import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatAmount, formatGhs, type ReportPage as Report, type ReportView } from '@wechiau/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { Card, ErrorText, Loading, Notice, Pill, Stat } from '../components/ui';
import { day } from '../format';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const n = (value: number) => value.toLocaleString('en-US');

/**
 * The monthly report for funders (v0.3 phase 5): the indicators promised to
 * funders, the egg fund, and the summary Gloria approves. Prints as a clean
 * page, so "Save as PDF" in the print dialog gives the PDF.
 */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? thisMonth();
  const { data, error, isPending } = useQuery({ queryKey: ['report', month], queryFn: () => api<Report>(`/dashboard/reports/${month}`) });

  const picker = (
    <div className="toolbar no-print">
      <label className="field">
        <span>Month</span>
        <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setParams({ month: e.target.value })} />
      </label>
      <a className="button" href={`/api/dashboard/reports/${month}/csv`} download>
        Download CSV
      </a>
      <button className="button" type="button" onClick={() => window.print()}>
        Print or save as PDF
      </button>
    </div>
  );

  if (isPending) return <Loading what="the report" />;
  if (error) return (<>{picker}<ErrorText error={error} /></>);
  const f = data.figures;

  return (
    <>
      <PageHeader title={`Monthly report · ${f.label}`}>
        What was promised to funders: farmers enrolled, doses given, crates sold, margin and bird losses. Worked out from everything recorded so far, so
        the figures change if phones sync late records for this month.
      </PageHeader>
      {picker}

      <div className="stats">
        <Stat label="Farmers enrolled" value={n(f.farmers.enrolled)} sub={`${n(f.farmers.newThisMonth)} new this month`} />
        <Stat label="Vaccine doses given" value={n(f.vaccination.doses)} sub={`On ${n(f.vaccination.farms)} farm${f.vaccination.farms === 1 ? '' : 's'}`} />
        <Stat label="Crates sold in Wa" value={n(f.eggs.cratesSold)} sub={`${n(f.eggs.cratesBought)} bought from farmers`} />
        <Stat label="Gross margin" value={formatGhs(f.eggs.margin)} sub={`On ${formatGhs(f.eggs.salesValue)} of sales`} />
        <Stat
          label="Bird losses"
          value={`${n(f.birds.deaths)} bird${f.birds.deaths === 1 ? '' : 's'}`}
          sub={f.birds.lossPercent === null ? 'No bird counts yet' : `${f.birds.lossPercent}% of ${n(f.birds.counted)} counted`}
        />
      </div>

      <div className="row">
        <Card title="Egg fund" className="grow-1">
          <dl className="figures">
            <Figure label="At the start of the month" value={formatGhs(f.eggFund.opening)} />
            <Figure label="Money in" value={formatGhs(f.eggFund.moneyIn)} sub={f.eggFund.grants ? `including ${formatGhs(f.eggFund.grants)} in grants` : undefined} />
            <Figure label="Money out" value={formatGhs(f.eggFund.moneyOut)} sub="paid to farmers" />
            {f.eggFund.corrections ? (
              <Figure label="Corrections" value={formatAmount(f.eggFund.corrections, { signed: true })} sub="collections and entries put right" />
            ) : null}
            <Figure label="At the end of the month" value={formatGhs(f.eggFund.closing)} strong />
          </dl>
        </Card>
        <Card title="Buyers and health" className="grow-1">
          <dl className="figures">
            <Figure label="Paid by Wa buyers" value={formatGhs(f.eggs.paymentsReceived)} />
            <Figure label="Paid by farmers for vaccine" value={formatGhs(f.vaccination.paymentsReceived)} />
            <Figure label="Health problems reported" value={n(f.cases.opened)} sub={f.cases.urgent ? `${n(f.cases.urgent)} urgent` : undefined} />
            <Figure label="Health cases closed" value={n(f.cases.closed)} />
          </dl>
        </Card>
      </div>

      <Summary key={`${month}:${data.report?.id ?? 'none'}`} month={month} report={data.report} />

      <Card title="Each farmer">
        {f.perFarmer.length === 0 ? (
          <p className="muted">No farmers enrolled by the end of this month.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Farmer</th>
                  <th className="right">Crates sold to us</th>
                  <th className="right">Paid (GHS)</th>
                  <th className="right">Bird deaths</th>
                  <th className="right">Vaccine doses</th>
                  <th className="right">Birds (latest count)</th>
                </tr>
              </thead>
              <tbody>
                {f.perFarmer.map((p) => (
                  <tr key={p.farmerId}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td className="right">{n(p.crates)}</td>
                    <td className="right">{formatGhs(p.paid).replace('GHS ', '')}</td>
                    <td className={`right ${p.deaths ? 'strong' : ''}`}>{n(p.deaths)}</td>
                    <td className="right">{n(p.doses)}</td>
                    <td className="right">{p.birds === null ? <span className="muted">Not counted</span> : n(p.birds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Figure({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={strong ? 'strong' : undefined}>
      <dt>
        {label}
        {sub ? <span className="muted small"> · {sub}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The written summary: the server drafts it, Gloria edits and approves it, then marks it sent. */
function Summary({ month, report }: { month: string; report: ReportView | null }) {
  const client = useQueryClient();
  const saved = report ? (report.finalText ?? report.draftText) : '';
  const [text, setText] = useState(saved);
  const changed = text.trim() !== saved.trim();
  const refresh = () => void client.invalidateQueries({ queryKey: ['report', month] });
  const path = `/dashboard/reports/${month}`;

  const draft = useMutation({
    mutationFn: () => api<ReportView>(`${path}/draft`, { method: 'POST' }),
    onSuccess: (r) => {
      setText(r.draftText);
      refresh();
    },
  });
  const save = useMutation({ mutationFn: () => api<void>(path, { method: 'PUT', body: { final_text: text } }), onSuccess: refresh });
  const approve = useMutation({ mutationFn: () => api<void>(`${path}/approve`, { method: 'POST', body: { final_text: text } }), onSuccess: refresh });
  const sent = useMutation({ mutationFn: () => api<void>(`${path}/sent`, { method: 'POST' }), onSuccess: refresh });
  const busy = draft.isPending || save.isPending || approve.isPending || sent.isPending;

  function redraft() {
    if (changed || report?.finalText) {
      if (!window.confirm('Replace the text below with a new draft from the latest figures? Your own wording will be lost unless you copy it first.')) return;
    }
    draft.mutate();
  }

  const status = !report ? null : report.status === 'draft' ? (
    <Pill tone="comingUp">Draft, not approved yet</Pill>
  ) : (
    <Pill tone={report.status === 'sent' ? 'money' : 'good'}>
      {report.status === 'sent' ? 'Sent to funders' : 'Approved'}
      {report.approvedBy ? ` · ${report.approvedBy}, ${day(report.approvedAt)}` : ''}
    </Pill>
  );

  return (
    <Card title="Summary for funders" aside={status}>
      {!report ? (
        <div className="column no-print">
          <p className="muted">The server writes a first draft from this month's figures. You then edit it in your own words and approve it.</p>
          <button type="button" className="button primary" onClick={() => draft.mutate()} disabled={busy}>
            {draft.isPending ? 'Writing…' : 'Write the draft'}
          </button>
        </div>
      ) : (
        <>
          <label className="field no-print">
            <span className="visually-hidden">Summary for funders</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} maxLength={20000} />
          </label>
          <div className="toolbar no-print">
            <button type="button" className="button" onClick={() => save.mutate()} disabled={busy || !changed || !text.trim()}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => approve.mutate()}
              disabled={busy || !text.trim() || (report.status !== 'draft' && !changed)}
            >
              {approve.isPending ? 'Approving…' : 'Approve'}
            </button>
            {report.status === 'approved' && !changed ? (
              <button type="button" className="button" onClick={() => sent.mutate()} disabled={busy}>
                Mark as sent to funders
              </button>
            ) : null}
            <button type="button" className="button" onClick={redraft} disabled={busy}>
              New draft from the latest figures
            </button>
          </div>
          {changed && report.status !== 'draft' ? (
            <Notice tone="comingUp">Saving or approving changed text replaces the approved version; approve it again before sending.</Notice>
          ) : null}
          <div className="print-only report-text">
            {saved.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </>
      )}
      <ErrorText error={draft.error ?? save.error ?? approve.error ?? sent.error} />
      <p className="muted small no-print">An AI-written draft, for you to check the same way, comes with the AI features after the pilot starts.</p>
    </Card>
  );
}
