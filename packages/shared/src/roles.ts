/**
 * The four roles (spec addendum v0.4, section 2).
 *
 * "Operations" in the v0.3 document means admin and field_agent together;
 * "Operations (admin)" means admin only.
 */
export const ROLES = ['admin', 'field_agent', 'vet', 'farmer'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES = ['admin', 'field_agent', 'vet'] as const satisfies readonly Role[];
export const OPERATIONS_ROLES = ['admin', 'field_agent'] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  field_agent: 'Field agent',
  vet: 'Vet',
  farmer: 'Farmer',
};

/** Which app variant each role signs in to. Admin also uses the dashboard. */
export const APP_VARIANTS = ['field', 'vet', 'farmer'] as const;
export type AppVariant = (typeof APP_VARIANTS)[number];

export const ROLES_BY_VARIANT: Record<AppVariant, readonly Role[]> = {
  field: ['admin', 'field_agent'],
  vet: ['vet'],
  farmer: ['farmer'],
};
