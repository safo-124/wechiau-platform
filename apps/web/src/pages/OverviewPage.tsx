import { useQuery } from '@tanstack/react-query';
import { formatGhs, type OverviewPage as Overview } from '@wechiau/shared';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { ServerStatusCard } from '../components/ServerStatusCard';
import { Card, ErrorText, Loading, Progress, Stat } from '../components/ui';
import { ago, monthName } from '../format';

/** Overview (design: web-dashboard/Main): this month's figures and what needs attention. */
export function OverviewPage() {
  const navigate = useNavigate();
  const { data, error, isPending } = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/dashboard/overview') });

  if (isPending) return <Loading what="the overview" />;
  if (error) return <ErrorText error={error} />;

  const maxWeek = Math.max(1, ...data.weeklyCrates.map((w) => w.crates));
  const crates = data.weeklyCrates.reduce((n, w) => n + w.crates, 0);

  return (
    <>
      <PageHeader title="Overview">
        {monthName(data.month)} · last change from the field {ago(data.lastChangeAt)}
      </PageHeader>

      <div className="stats">
        <Stat
          label="Farmers enrolled"
          value={
            <>
              {data.farmers.enrolled} <small>of {data.farmers.target} target</small>
            </>
          }
          sub={<Progress value={data.farmers.enrolled} max={data.farmers.target} />}
          onClick={() => navigate('/farmers')}
        />
        <Stat label="Crates bought / sold" value={`${data.crates.bought} / ${data.crates.sold}`} sub={`${data.crates.inStore} in store`} onClick={() => navigate('/money')} />
        <Stat
          label="Gross margin on eggs"
          value={formatGhs(data.margin.pesewas)}
          sub={data.margin.perCrate !== null ? `${formatGhs(data.margin.perCrate)} a crate` : 'No sales yet this month'}
          onClick={() => navigate('/money')}
        />
        <Stat
          label="Egg fund cash"
          value={formatGhs(data.fund.cash)}
          tone={data.fund.cash < 0 ? 'problem' : undefined}
          sub={data.fund.owedByBuyers ? <span className="amber">{formatGhs(data.fund.owedByBuyers)} owed by buyers</span> : 'Nothing owed'}
          onClick={() => navigate('/money')}
        />
        <Stat
          label="Vaccine doses left"
          value={
            <>
              {data.doses.left} <small>of {data.doses.received}</small>
            </>
          }
          sub={data.doses.round ? `Round ${data.doses.round.number}: ${data.doses.round.done} of ${data.doses.round.total} farms` : 'No round yet'}
          onClick={() => navigate('/health')}
        />
        <Stat
          label="Open health cases"
          value={data.cases.open}
          sub={data.cases.urgent ? `${data.cases.urgent} urgent` : 'None urgent'}
          tone={data.cases.urgent ? 'problem' : undefined}
          onClick={() => navigate('/health')}
        />
      </div>

      <div className="row">
        <Card title="Crates collected per week" aside={<span className="muted small">{crates} this month</span>} className="grow-2">
          <div className="bars" role="img" aria-label={data.weeklyCrates.map((w) => `${w.label}, ${w.crates}`).join('; ')}>
            {data.weeklyCrates.map((w) => (
              <div key={w.label} className="bar">
                <span className="bar-value">{w.crates}</span>
                <div className="bar-fill" style={{ height: `${Math.max(4, (w.crates / maxWeek) * 160)}px` }} />
                <span className="bar-label">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Needs your attention" className="grow-1">
          {data.attention.map((item, i) => (
            <button key={i} type="button" className={`attention notice-${item.tone}`} onClick={() => navigate(`/${item.page}`)}>
              {item.text}
            </button>
          ))}
        </Card>
      </div>

      <Card title="Monthly report for funders">
        <p className="muted">Farmers enrolled, doses given, crates sold, margin and bird losses for {monthName(data.month)}, with a summary you approve before it goes out.</p>
        <button type="button" className="button" onClick={() => navigate(`/reports?month=${data.month}`)}>
          Open the monthly report
        </button>
      </Card>
      <ServerStatusCard />
    </>
  );
}
