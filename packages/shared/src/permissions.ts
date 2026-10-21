/**
 * Who can read and change each table (spec addendum v0.4, section 3).
 *
 * The server enforces these rules on every sync push and dashboard request.
 * The apps and dashboard read the same map to hide buttons a person can't use.
 */
import type { Role } from './roles.js';
import { SYNC_COLUMN_NAMES, type TableName } from './schemas/index.js';
import type { SettingKey } from './settings.js';

/**
 * all          every row
 * summary      every row, but only `summaryColumns`
 * limited      only the setting rows in `limitedKeys`
 * own_farm     rows about the farmer's own farm
 * own_records  rows the person entered (`recorded_by`)
 * involving_me cash handovers to or from the person
 */
export type ReadScope = 'all' | 'summary' | 'limited' | 'own_farm' | 'own_records' | 'involving_me' | 'none';

/**
 * any          any row
 * own_farm     rows about the farmer's own farm
 * own_records  rows the person entered
 */
export type WriteScope = 'any' | 'own_farm' | 'own_records' | 'none';

type PerRole<T> = Record<Role, T>;

/** In `fixedValues`: the id of the person making the change. */
export const SELF = '$self';

export interface TableRule {
  /** Plural, lower case, for messages: "egg collections". */
  label: string;
  /** The owning role, as written in the addendum. */
  owner: string;
  /** Rows are never changed or deleted through sync; mistakes get a new correcting row. */
  appendOnly: boolean;
  read: PerRole<ReadScope>;
  create: PerRole<WriteScope>;
  /** Also covers soft delete (setting `deleted_at`). */
  update: PerRole<WriteScope>;
  /** Columns sent to roles with the `summary` read scope, besides the sync columns. */
  summaryColumns?: readonly string[];
  /** Setting keys sent to roles with the `limited` read scope. */
  limitedKeys?: Partial<PerRole<readonly SettingKey[]>>;
  /** Values a role must use when creating a row. */
  fixedValues?: Partial<PerRole<Readonly<Record<string, unknown>>>>;
  /** Columns that can't change after the row is created, by anyone. */
  immutableColumns?: readonly string[];
  /**
   * Whenever `when` is set or changed, `stamp` must be the person making the
   * change: for example, whoever sets a case's urgency is the vet who confirmed it.
   */
  selfStamped?: readonly { when: string; stamp: string }[];
  /** Filled by the server. Values pushed by phones are ignored. */
  serverFields?: readonly string[];
  /** Roles that may create rows only together with the record they come from, in the same push. */
  sourceRequired?: readonly Role[];
}

const perRole = <T>(admin: T, field_agent: T, vet: T, farmer: T): PerRole<T> => ({ admin, field_agent, vet, farmer });
const NO_ONE = perRole<WriteScope>('none', 'none', 'none', 'none');

export const PERMISSIONS: Record<TableName, TableRule> = {
  user: {
    label: 'user accounts',
    owner: 'Admin',
    appendOnly: false,
    // Names and phones, so apps can show "My vet: Kofi" and call people.
    // The server sends farmers only their own login and the vets.
    read: perRole('all', 'summary', 'summary', 'summary'),
    create: perRole('any', 'none', 'none', 'none'),
    update: perRole('any', 'none', 'none', 'none'),
    // farmer_id lets the field app show which farmers have the farmer app set up.
    summaryColumns: ['name', 'phone', 'role', 'status', 'farmer_id'],
  },
  farmer: {
    label: 'farmer profiles',
    owner: 'Operations',
    appendOnly: false,
    read: perRole('all', 'all', 'all', 'own_farm'),
    create: perRole('any', 'any', 'none', 'none'),
    update: perRole('any', 'any', 'none', 'none'),
  },
  vet_assignment: {
    label: 'vet assignments',
    owner: 'Admin (append only)',
    appendOnly: true,
    read: perRole('all', 'all', 'all', 'own_farm'),
    create: perRole('any', 'none', 'none', 'none'),
    update: NO_ONE,
  },
  visit: {
    label: 'visits',
    owner: 'Whoever adds it (append only)',
    appendOnly: true,
    read: perRole('all', 'all', 'all', 'own_farm'),
    create: perRole('any', 'any', 'any', 'none'),
    update: NO_ONE,
  },
  bird_count: {
    label: 'bird counts',
    owner: 'Whoever adds it (append only)',
    appendOnly: true,
    read: perRole('all', 'all', 'all', 'own_farm'),
    create: perRole('any', 'any', 'any', 'own_farm'),
    update: NO_ONE,
    fixedValues: {
      admin: { kind: 'verified' },
      field_agent: { kind: 'verified' },
      vet: { kind: 'verified' },
      farmer: { kind: 'reported', source_type: 'farmer_app' },
    },
  },
  vaccination_round: {
    label: 'vaccination rounds',
    owner: 'Admin',
    appendOnly: false,
    // Gloria schedules rounds once (dashboard), so two vets offline can't both start "Round 2".
    // Vets never see prices; the server copies the price from Settings.
    read: perRole('all', 'all', 'summary', 'all'),
    create: perRole('any', 'none', 'none', 'none'),
    update: perRole('any', 'none', 'none', 'none'),
    summaryColumns: ['number', 'date', 'is_free'],
    serverFields: ['price_per_dose'],
  },
  vaccination: {
    label: 'vaccinations',
    owner: 'Vet',
    appendOnly: false,
    read: perRole('all', 'summary', 'all', 'own_farm'),
    create: perRole('none', 'none', 'any', 'none'),
    update: perRole('none', 'none', 'any', 'none'),
    summaryColumns: ['farmer_id', 'round_id', 'birds_vaccinated', 'vaccinated_at'],
    fixedValues: { vet: { vet_id: SELF } },
    immutableColumns: ['vet_id', 'farmer_id', 'round_id'],
  },
  vaccine_batch: {
    label: 'vaccine batches',
    owner: 'Vet',
    appendOnly: false,
    read: perRole('all', 'none', 'all', 'none'),
    create: perRole('any', 'none', 'any', 'none'),
    update: perRole('none', 'none', 'any', 'none'),
  },
  vaccine_stock_entry: {
    label: 'vaccine stock entries',
    owner: 'Vet (append only)',
    appendOnly: true,
    read: perRole('all', 'none', 'all', 'none'),
    create: perRole('any', 'none', 'any', 'none'),
    update: NO_ONE,
  },
  cold_chain_reading: {
    label: 'cold-box readings',
    owner: 'Vet (append only)',
    appendOnly: true,
    read: perRole('all', 'none', 'all', 'none'),
    create: perRole('none', 'none', 'any', 'none'),
    update: NO_ONE,
  },
  vaccine_payment: {
    label: 'vaccine payments',
    owner: 'Operations (append only)',
    appendOnly: true,
    read: perRole('all', 'all', 'none', 'own_farm'),
    create: perRole('any', 'any', 'none', 'none'),
    update: NO_ONE,
  },
  health_case: {
    label: 'health cases',
    owner: 'Vet (farmer creates)',
    appendOnly: false,
    read: perRole('all', 'summary', 'all', 'own_farm'),
    create: perRole('none', 'none', 'any', 'own_farm'),
    update: perRole('none', 'none', 'any', 'none'),
    summaryColumns: ['farmer_id', 'status', 'triage', 'assigned_vet_id', 'follow_up_on'],
    // A farmer only reports. The server assigns the farmer's vet; a vet confirms the urgency.
    fixedValues: {
      farmer: {
        channel: 'app',
        status: 'open',
        triage: null,
        triage_confirmed_by: null,
        assigned_vet_id: null,
        diagnosis: null,
        treatment: null,
        follow_up_on: null,
        closed_at: null,
      },
    },
    immutableColumns: ['farmer_id', 'channel'],
    selfStamped: [{ when: 'triage', stamp: 'triage_confirmed_by' }],
    serverFields: ['triage_suggested'],
  },
  case_note: {
    label: 'case notes',
    owner: 'Whoever writes it (append only)',
    appendOnly: true,
    // The vets' working history of a case. Farmers hear from vets through messages.
    read: perRole('all', 'none', 'all', 'none'),
    create: perRole('none', 'none', 'any', 'none'),
    update: NO_ONE,
  },
  message: {
    label: 'messages',
    owner: 'Whoever adds it (append only)',
    appendOnly: true,
    read: perRole('all', 'none', 'all', 'own_farm'),
    create: perRole('any', 'none', 'any', 'own_farm'),
    update: NO_ONE,
    fixedValues: {
      admin: { direction: 'to_farmer', sender_id: SELF },
      vet: { direction: 'to_farmer', sender_id: SELF },
      farmer: { direction: 'from_farmer', sender_id: SELF, delivery: 'app' },
    },
    serverFields: ['transcript', 'translation'],
  },
  collection: {
    label: 'egg collections',
    owner: 'Operations',
    appendOnly: false,
    read: perRole('all', 'all', 'none', 'own_farm'),
    create: perRole('any', 'any', 'none', 'none'),
    update: perRole('any', 'own_records', 'none', 'none'),
    // The receipt already went to this farmer. A wrong farmer is fixed by deleting and re-entering.
    immutableColumns: ['farmer_id'],
  },
  buyer: {
    label: 'buyers',
    owner: 'Operations',
    appendOnly: false,
    read: perRole('all', 'all', 'none', 'none'),
    create: perRole('any', 'any', 'none', 'none'),
    update: perRole('any', 'none', 'none', 'none'),
  },
  sale: {
    label: 'sales',
    owner: 'Operations',
    appendOnly: false,
    read: perRole('all', 'all', 'none', 'none'),
    create: perRole('any', 'any', 'none', 'none'),
    update: perRole('any', 'own_records', 'none', 'none'),
    immutableColumns: ['buyer_id'],
  },
  sale_payment: {
    label: 'sale payments',
    owner: 'Operations (append only)',
    appendOnly: true,
    read: perRole('all', 'all', 'none', 'none'),
    create: perRole('any', 'any', 'none', 'none'),
    update: NO_ONE,
  },
  ledger_entry: {
    label: 'ledger entries',
    owner: 'Operations (append only)',
    appendOnly: true,
    // A field agent sees only the entries behind the cash they hold.
    read: perRole('all', 'own_records', 'none', 'none'),
    create: perRole('any', 'own_records', 'none', 'none'),
    update: NO_ONE,
    sourceRequired: ['field_agent'],
  },
  cash_handover: {
    label: 'cash handovers',
    owner: 'Admin (append only)',
    appendOnly: true,
    read: perRole('all', 'involving_me', 'none', 'none'),
    create: perRole('any', 'none', 'none', 'none'),
    update: NO_ONE,
  },
  cash_count: {
    label: 'cash counts',
    owner: 'Whoever counts (append only)',
    appendOnly: true,
    // A count is of the person's own cash. The admin sees everyone's.
    read: perRole('all', 'own_records', 'none', 'none'),
    create: perRole('any', 'own_records', 'none', 'none'),
    update: NO_ONE,
  },
  sms_outbox: {
    label: 'SMS messages',
    owner: 'Whoever queues it',
    appendOnly: false,
    read: perRole('all', 'own_records', 'own_records', 'none'),
    create: perRole('any', 'any', 'any', 'none'),
    update: perRole('any', 'own_records', 'own_records', 'none'),
  },
  setting: {
    label: 'settings',
    owner: 'Admin',
    appendOnly: false,
    read: perRole('all', 'all', 'limited', 'limited'),
    create: perRole('any', 'none', 'none', 'none'),
    update: perRole('any', 'none', 'none', 'none'),
    limitedKeys: {
      vet: ['stock_alert_doses', 'cold_chain_min_c', 'cold_chain_max_c'],
      farmer: ['buy_price_per_crate', 'price_per_dose'],
    },
    immutableColumns: ['key'],
  },
  monthly_report: {
    label: 'monthly reports',
    owner: 'Admin',
    appendOnly: false,
    // The server writes the AI draft; the admin edits and approves it on the dashboard.
    read: perRole('all', 'none', 'none', 'none'),
    create: NO_ONE,
    update: perRole('any', 'none', 'none', 'none'),
    serverFields: ['draft_text'],
  },
};

/** The person making a request, from their login. */
export interface Actor {
  userId: string;
  role: Role;
  /** Set only for farmers. */
  farmerId: string | null;
}

export type Row = Readonly<Record<string, unknown>>;
export type Decision = { ok: true } | { ok: false; reason: string };

const ROLE_PLURALS: Record<Role, string> = {
  admin: 'Admins',
  field_agent: 'Field agents',
  vet: 'Vets',
  farmer: 'Farmers',
};

const allow: Decision = { ok: true };
const deny = (reason: string): Decision => ({ ok: false, reason });

function resolveFixed(value: unknown, actor: Actor): unknown {
  return value === SELF ? actor.userId : value;
}

/** The column that says which farm a row is about. */
function farmColumn(table: TableName): string {
  return table === 'farmer' ? 'id' : 'farmer_id';
}

function isOwnFarm(actor: Actor, table: TableName, row: Row): boolean {
  return actor.farmerId !== null && row[farmColumn(table)] === actor.farmerId;
}

export function readScope(role: Role, table: TableName): ReadScope {
  return PERMISSIONS[table].read[role];
}

/** Whether a role receives this table at all. The vet app never receives money tables. */
export function canSeeTable(role: Role, table: TableName): boolean {
  return readScope(role, table) !== 'none';
}

/** Columns a role may see, or 'all'. */
export function visibleColumns(role: Role, table: TableName): readonly string[] | 'all' {
  const rule = PERMISSIONS[table];
  if (rule.read[role] !== 'summary') return 'all';
  return [...SYNC_COLUMN_NAMES, ...(rule.summaryColumns ?? [])];
}

export function canRead(actor: Actor, table: TableName, row: Row): boolean {
  const rule = PERMISSIONS[table];
  switch (rule.read[actor.role]) {
    case 'all':
    case 'summary':
      return true;
    case 'limited':
      return (rule.limitedKeys?.[actor.role] ?? []).includes(row.key as SettingKey);
    case 'own_farm':
      return isOwnFarm(actor, table, row);
    case 'own_records':
      return row.recorded_by === actor.userId;
    case 'involving_me':
      return row.from_user_id === actor.userId || row.to_user_id === actor.userId;
    case 'none':
      return false;
  }
}

/** For hiding "Add" buttons: can this role create any rows in the table? */
export function canCreateIn(role: Role, table: TableName): boolean {
  return PERMISSIONS[table].create[role] !== 'none';
}

export function checkCreate(actor: Actor, table: TableName, row: Row): Decision {
  const rule = PERMISSIONS[table];
  const plural = ROLE_PLURALS[actor.role];
  const scope = rule.create[actor.role];

  if (scope === 'none') return deny(`${plural} can't add ${rule.label}.`);
  if (row.recorded_by !== actor.userId) return deny('Records must be saved under your own login.');
  if (scope === 'own_farm' && !isOwnFarm(actor, table, row)) {
    return deny(`You can only add ${rule.label} for your own farm.`);
  }

  for (const { when, stamp } of rule.selfStamped ?? []) {
    if (row[when] != null && row[stamp] !== actor.userId) {
      return deny(`The ${when.replaceAll('_', ' ')} of ${rule.label} must be recorded under your own name.`);
    }
  }

  const fixed = rule.fixedValues?.[actor.role];
  if (fixed) {
    for (const [column, expected] of Object.entries(fixed)) {
      if (row[column] !== resolveFixed(expected, actor)) {
        return deny(`${plural} can't set ${column.replaceAll('_', ' ')} on ${rule.label}.`);
      }
    }
  }
  return allow;
}

export function checkUpdate(actor: Actor, table: TableName, existing: Row, next: Row): Decision {
  const rule = PERMISSIONS[table];
  const plural = ROLE_PLURALS[actor.role];

  if (rule.appendOnly) {
    return deny(`Saved ${rule.label} can't be changed. Add a correction instead.`);
  }
  const scope = rule.update[actor.role];
  if (scope === 'none') return deny(`${plural} can't change ${rule.label}.`);
  if (scope === 'own_records' && existing.recorded_by !== actor.userId) {
    return deny(`You can only change ${rule.label} you entered yourself.`);
  }
  if (scope === 'own_farm' && !isOwnFarm(actor, table, existing)) {
    return deny(`You can only change ${rule.label} for your own farm.`);
  }
  if (next.id !== existing.id) return deny("A record's id can't change.");
  if (next.recorded_by !== existing.recorded_by) return deny("Who entered a record can't change.");
  if (next.created_at !== existing.created_at) return deny("When a record was created can't change.");

  for (const column of rule.immutableColumns ?? []) {
    if (next[column] !== existing[column]) {
      return deny(`The ${column.replaceAll('_', ' ')} of saved ${rule.label} can't change.`);
    }
  }
  for (const { when, stamp } of rule.selfStamped ?? []) {
    if (next[when] != null && next[when] !== existing[when] && next[stamp] !== actor.userId) {
      return deny(`The ${when.replaceAll('_', ' ')} of ${rule.label} must be recorded under your own name.`);
    }
  }
  return allow;
}

/** For enabling "Edit" buttons on a row the person is looking at. */
export function canUpdateRow(actor: Actor, table: TableName, row: Row): boolean {
  return checkUpdate(actor, table, row, row).ok;
}

/** Drops columns a role may not see, before sending a row to them. */
export function projectRow<T extends Row>(role: Role, table: TableName, row: T): Partial<T> {
  const columns = visibleColumns(role, table);
  if (columns === 'all') return row;
  const projected: Partial<T> = {};
  for (const column of columns) {
    if (column in row) (projected as Record<string, unknown>)[column] = row[column];
  }
  return projected;
}

/** Replaces server-filled columns in a pushed row with the server's own values. */
export function keepServerFields<T extends Row>(table: TableName, pushed: T, existing: Row | null): T {
  const serverFields = PERMISSIONS[table].serverFields;
  if (!serverFields?.length) return pushed;
  const merged: Record<string, unknown> = { ...pushed };
  for (const column of serverFields) merged[column] = existing ? existing[column] : null;
  return merged as T;
}
