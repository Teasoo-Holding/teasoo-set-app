/**
 * The four role archetypes (PRD §4). Role is DECOUPLED from job title and is
 * assigned per user, per tenant — the prototype's MD-as-Superadmin is a
 * deployment choice, not a rule (the recommendation is a Corporate Affairs
 * operations owner as Admin, with the MD holding Leadership).
 */
export enum Role {
  FIELD = 'FIELD',
  FUNCTION_LEAD = 'FUNCTION_LEAD',
  LEADERSHIP = 'LEADERSHIP',
  ADMIN = 'ADMIN',
}

/** Parse an external role claim (e.g. an IdP group) into a Role, case-insensitively. */
export function parseRole(value: string | undefined): Role | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  return (Object.values(Role) as string[]).includes(upper) ? (upper as Role) : undefined;
}
