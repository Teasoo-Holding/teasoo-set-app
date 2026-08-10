/**
 * Pure, side-effect-free tenant-scoping logic, factored out of the Prisma
 * extension so it can be unit-tested without a database or a generated client.
 *
 * Given a Prisma operation's args, it returns a new args object with the
 * tenant filter/value applied.
 */

/**
 * Models that carry a `tenantId` and must be tenant-scoped. As new tenant-owned
 * models are added (EP-2 onward), add them here — a model that should be scoped
 * but is missing from this set is the one bug this design is meant to prevent,
 * so keep it as the single source of truth and cover it with a test.
 */
export const TENANT_SCOPED_MODELS = new Set<string>(['Stakeholder']);

export function isTenantScoped(model?: string): boolean {
  return !!model && TENANT_SCOPED_MODELS.has(model);
}

const CREATE_OPS = new Set(['create', 'createMany']);

// Operations that take a plain `where` we can safely narrow by tenant.
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Return `args` with tenant scoping applied for the given model/operation.
 *
 * - create/createMany: stamp `tenantId` onto the row(s) being written.
 * - where-based reads/bulk writes: add `tenantId` to the `where` filter.
 * - unique-target ops (findUnique/update/delete/upsert by id): left untouched
 *   here. Prisma's unique-where input does not accept an extra scalar filter,
 *   so these rely on the database RLS policy (the second line of defence),
 *   which covers every operation regardless.
 *
 * Non-tenant models are returned unchanged.
 */
export function applyTenantScope(
  model: string | undefined,
  operation: string,
  args: unknown,
  tenantId: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...((args as Record<string, unknown>) ?? {}) };
  if (!isTenantScoped(model)) return next;

  if (CREATE_OPS.has(operation)) {
    if (operation === 'create') {
      next.data = { ...((next.data as Record<string, unknown>) ?? {}), tenantId };
    } else {
      const data = next.data;
      if (Array.isArray(data)) {
        next.data = data.map((row) => ({ ...(row as Record<string, unknown>), tenantId }));
      } else if (data) {
        next.data = { ...(data as Record<string, unknown>), tenantId };
      }
    }
    return next;
  }

  if (WHERE_OPS.has(operation)) {
    next.where = { ...((next.where as Record<string, unknown>) ?? {}), tenantId };
    return next;
  }

  return next;
}
