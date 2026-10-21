import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatGhs,
  parseGhsInput,
  PASSWORD_MIN_LENGTH,
  type FarmerAccessResponse,
  type InviteUserRequest,
  type SettingsPage as Settings,
  type SettingsUpdate,
  type UserView,
} from '@wechiau/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageHeader';
import { Card, Chips, ErrorText, Loading, Notice, Pill } from '../components/ui';
import { ago, ROLE_NAMES } from '../format';

const ghs = (p: number | null) => (p === null ? '' : String(p / 100));
const USES: Record<string, string> = { admin: 'Dashboard, field app', field_agent: 'Field app', vet: 'Vet app', farmer: 'Farmer app' };

/** Settings, prices and people (design: web-dashboard/Settings). Changes reach the phones at their next sync. */
export function SettingsPage() {
  const { data, error, isPending } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/dashboard/settings') });
  if (isPending) return <Loading what="settings" />;
  if (error) return <ErrorText error={error} />;
  return (
    <>
      <PageHeader title="Settings">Changes reach the phones at their next sync.</PageHeader>
      <PricesAndReminders values={data.values} />
      <People users={data.users} farmersWithoutLogin={data.farmersWithoutLogin} />
    </>
  );
}

function PricesAndReminders({ values }: { values: Settings['values'] }) {
  const client = useQueryClient();
  const [buy, setBuy] = useState(ghs(values.buy_price_per_crate));
  const [sell, setSell] = useState(ghs(values.sell_price_per_crate));
  const [dose, setDose] = useState(ghs(values.price_per_dose));
  const [stockAlert, setStockAlert] = useState(String(values.stock_alert_doses));
  const [smsDays, setSmsDays] = useState(values.remind_vaccine_sms_days_before !== null);
  const [voice, setVoice] = useState(values.remind_vaccine_voice);
  const [monthly, setMonthly] = useState(values.monthly_sales_summary_sms);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [buy, sell, dose, stockAlert, smsDays, voice, monthly]);

  const buyP = parseGhsInput(buy);
  const sellP = parseGhsInput(sell);
  const margin = buyP !== null && sellP !== null ? sellP - buyP : null;

  const save = useMutation({
    mutationFn: (update: SettingsUpdate) => api<void>('/dashboard/settings', { method: 'PUT', body: update }),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['settings'] });
      void client.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const doseP = dose.trim() ? parseGhsInput(dose) : null;
    if (buyP === null || sellP === null || (dose.trim() && doseP === null) || !/^\d+$/.test(stockAlert)) return;
    save.mutate({
      buy_price_per_crate: buyP,
      sell_price_per_crate: sellP,
      price_per_dose: doseP,
      stock_alert_doses: Number(stockAlert),
      remind_vaccine_sms_days_before: smsDays ? (values.remind_vaccine_sms_days_before ?? 3) : null,
      remind_vaccine_voice: voice,
      monthly_sales_summary_sms: monthly,
    });
  }

  return (
    <form onSubmit={submit} className="row">
      <Card title="Prices" className="grow-1">
        <label className="field narrow">
          <span>Price paid to farmers per crate (GHS)</span>
          <input inputMode="decimal" value={buy} onChange={(e) => setBuy(e.target.value)} />
        </label>
        <label className="field narrow">
          <span>Selling price to Wa buyers per crate (GHS)</span>
          <input inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} />
        </label>
        {margin !== null && margin > 0 ? (
          <Notice tone="good">
            <strong>Margin: {formatGhs(margin)} per crate</strong>
          </Notice>
        ) : (
          <Notice tone="problem">
            <strong>Selling price must be higher than the price paid to farmers</strong>
          </Notice>
        )}
        <label className="field narrow">
          <span>Vaccine price per dose, paid rounds (GHS)</span>
          <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Not set yet" />
          <span className={dose ? 'muted small' : 'amber small'}>{dose ? 'Copied onto each paid round when it is scheduled.' : 'Not set yet. Round 1 stays free.'}</span>
        </label>
        <label className="field narrow">
          <span>Warn the vets when doses fall below</span>
          <input inputMode="numeric" value={stockAlert} onChange={(e) => setStockAlert(e.target.value)} />
        </label>
      </Card>
      <Card title="Reminders to farmers" className="grow-1">
        <label className="check">
          <input type="checkbox" checked={smsDays} onChange={(e) => setSmsDays(e.target.checked)} />
          SMS {values.remind_vaccine_sms_days_before ?? 3} days before each vaccine round
        </label>
        <label className="check">
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
          Voice message the day before, in Dagaare or Waale
        </label>
        <label className="check">
          <input type="checkbox" checked disabled />
          SMS receipt for every egg collection (always on)
        </label>
        <label className="check">
          <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
          Monthly summary of each farmer's sales
        </label>
        <p className="muted small">Reminders go out once the SMS and voice services are set up.</p>
        <ErrorText error={save.error} />
        <button className={`button ${saved ? 'saved' : 'primary'}`} type="submit" disabled={save.isPending || margin === null || margin <= 0}>
          {saved ? 'Saved' : save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </Card>
    </form>
  );
}

function People({ users, farmersWithoutLogin }: { users: UserView[]; farmersWithoutLogin: Settings['farmersWithoutLogin'] }) {
  const client = useQueryClient();
  const { user: me } = useAuth();
  const [inviting, setInviting] = useState(false);
  const [show, setShow] = useState<'all' | 'staff' | 'farmers'>('all');
  const [newPin, setNewPin] = useState<{ name: string; access: FarmerAccessResponse } | null>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: ['settings'] });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) => api<void>(`/dashboard/users/${id}`, { method: 'PUT', body: { status } }),
    onSuccess: refresh,
  });
  const farmers = users.filter((u) => u.role === 'farmer');
  const shown = users.filter((u) => (show === 'all' ? true : show === 'farmers' ? u.role === 'farmer' : u.role !== 'farmer'));

  return (
    <Card
      title="People and access"
      aside={
        <button type="button" className="button" onClick={() => setInviting((v) => !v)}>
          Invite a person
        </button>
      }
    >
      {inviting ? (
        <Invite
          farmersWithoutLogin={farmersWithoutLogin}
          onDone={(pin) => {
            setInviting(false);
            if (pin) setNewPin(pin);
            refresh();
          }}
        />
      ) : null}
      {newPin ? <PinNotice name={newPin.name} access={newPin.access} onClose={() => setNewPin(null)} /> : null}
      <ErrorText error={update.error} />
      <Chips
        options={[
          { value: 'all', label: `Everyone (${users.length})` },
          { value: 'staff', label: `Staff (${users.length - farmers.length})` },
          { value: 'farmers', label: `Farmers (${farmers.length})` },
        ]}
        value={show}
        onChange={setShow}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Uses</th>
              <th>Status</th>
              <th>Password or PIN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <div className="muted small">
                    {u.phone}
                    {u.email ? ` · ${u.email}` : ''}
                  </div>
                </td>
                <td>{ROLE_NAMES[u.role]}</td>
                <td>{USES[u.role]}</td>
                <td>
                  {u.status === 'active' ? <Pill tone="good">Active</Pill> : u.status === 'invited' ? <Pill tone="comingUp">Invited</Pill> : <Pill tone="neutral">Turned off</Pill>}
                  <div className="muted small">Last seen {ago(u.lastSeen)}</div>
                </td>
                <td>
                  {u.role === 'farmer' ? (
                    <NewPinButton
                      user={u}
                      onDone={(access) => {
                        setNewPin({ name: u.name, access });
                        refresh();
                      }}
                    />
                  ) : (
                    <SetPassword user={u} onDone={refresh} />
                  )}
                </td>
                <td>
                  {u.id === me.id ? (
                    <span className="muted small">You</span>
                  ) : u.status === 'disabled' ? (
                    <button type="button" className="button small" disabled={!u.hasPassword} onClick={() => update.mutate({ id: u.id, status: 'active' })}>
                      Turn on
                    </button>
                  ) : u.status === 'active' ? (
                    <button type="button" className="button small" onClick={() => update.mutate({ id: u.id, status: 'disabled' })}>
                      Turn off
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Give each person their password or PIN yourself. Turning an account off signs that person out on every phone at once. Farmers sign in to the
        farmer app with their phone number and a 6-digit PIN; field agents can also give a PIN from the farmer&apos;s profile in the field app.
      </p>
    </Card>
  );
}

type InviteRole = InviteUserRequest['role'] | 'farmer';

/** Staff get a login with a name, phone and password. A farmer's login comes from their farmer profile, with a PIN. */
function Invite({
  farmersWithoutLogin,
  onDone,
}: {
  farmersWithoutLogin: Settings['farmersWithoutLogin'];
  onDone(pin?: { name: string; access: FarmerAccessResponse }): void;
}) {
  const [role, setRole] = useState<InviteRole>('vet');
  const [form, setForm] = useState<Omit<InviteUserRequest, 'role'>>({ name: '', phone: '', email: null });
  const [farmerId, setFarmerId] = useState(farmersWithoutLogin[0]?.id ?? '');
  const invite = useMutation({
    mutationFn: async () => {
      if (role === 'farmer') {
        const farmer = farmersWithoutLogin.find((f) => f.id === farmerId);
        const access = await api<FarmerAccessResponse>(`/farmers/${farmerId}/app-access`, { method: 'POST' });
        return { name: farmer?.name ?? 'The farmer', access };
      }
      await api<{ id: string }>('/dashboard/users', { method: 'POST', body: { ...form, role } });
      return undefined;
    },
    onSuccess: (pin) => onDone(pin),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
          <option value="vet">Vet</option>
          <option value="field_agent">Field agent</option>
          <option value="admin">Admin</option>
          <option value="farmer">Farmer</option>
        </select>
      </label>
      {role === 'farmer' ? (
        farmersWithoutLogin.length ? (
          <>
            <label className="field">
              <span>Farmer</span>
              <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)}>
                {farmersWithoutLogin.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} · {f.phone}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit" disabled={invite.isPending || !farmerId}>
              Give a PIN
            </button>
            <p className="muted small">The farmer signs in with the phone number on their profile. Field agents register farmers in the field app.</p>
          </>
        ) : (
          <p className="muted">Every registered farmer already has a login. Field agents register new farmers in the field app.</p>
        )
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="024 123 4567" required />
          </label>
          <label className="field">
            <span>Email (admins sign in with it)</span>
            <input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value || null })} required={role === 'admin'} />
          </label>
          <button className="button primary" type="submit" disabled={invite.isPending}>
            Add person
          </button>
        </>
      )}
      <ErrorText error={invite.error} />
    </form>
  );
}

/** A farmer's new PIN, shown once to give to them. */
function PinNotice({ name, access, onClose }: { name: string; access: FarmerAccessResponse; onClose(): void }) {
  return (
    <Notice tone="good">
      <div className="pin-notice">
        <span>PIN for {name}</span>
        <strong className="pin" aria-label={`PIN ${access.pin.split('').join(' ')}`}>
          {access.pin.slice(0, 3)} {access.pin.slice(3)}
        </strong>
        <span>
          {name} signs in to Wechiau Farmer with {access.phone} and this PIN. Write it down for them now: it is not shown again.
        </span>
        <button type="button" className="button small" onClick={onClose}>
          Done
        </button>
      </div>
    </Notice>
  );
}

function NewPinButton({ user, onDone }: { user: UserView; onDone(access: FarmerAccessResponse): void }) {
  const give = useMutation({
    mutationFn: () => api<FarmerAccessResponse>(`/farmers/${user.farmerId}/app-access`, { method: 'POST' }),
    onSuccess: onDone,
  });
  if (user.status === 'disabled') return <span className="muted small">Off</span>;
  return (
    <>
      <button
        type="button"
        className="button small"
        disabled={give.isPending || !user.farmerId}
        onClick={() => {
          if (window.confirm(`Give ${user.name} a new PIN? The old PIN stops working and the farmer app signs out on their phone.`)) give.mutate();
        }}
      >
        New PIN
      </button>
      <ErrorText error={give.error} />
    </>
  );
}

function SetPassword({ user, onDone }: { user: UserView; onDone(): void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const set = useMutation({
    mutationFn: () => api<void>(`/dashboard/users/${user.id}/password`, { method: 'POST', body: { password } }),
    onSuccess: () => {
      setOpen(false);
      setPassword('');
      onDone();
    },
  });
  if (user.status === 'disabled') return <span className="muted small">Off</span>;
  if (!open) {
    return (
      <button type="button" className="button small" onClick={() => setOpen(true)}>
        {user.hasPassword ? 'Change' : 'Set password'}
      </button>
    );
  }
  return (
    <form
      className="password-form"
      onSubmit={(e) => {
        e.preventDefault();
        set.mutate();
      }}
    >
      <label className="visually-hidden" htmlFor={`pw-${user.id}`}>
        New password for {user.name}
      </label>
      <input
        id={`pw-${user.id}`}
        type="text"
        autoComplete="new-password"
        value={password}
        minLength={PASSWORD_MIN_LENGTH}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        required
      />
      <button className="button small primary" type="submit" disabled={set.isPending}>
        Save
      </button>
      <ErrorText error={set.error} />
    </form>
  );
}
