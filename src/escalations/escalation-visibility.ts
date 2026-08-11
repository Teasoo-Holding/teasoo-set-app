import { RequestPrincipal } from '../authz/principal-context';
import { Role } from '../authz/role';

/**
 * Who can see which escalations (PRD §4.1). This is the foundational rule EP-6
 * will apply when querying the escalation board; it is defined here, and tested,
 * so the "visible to the Function Lead AND Leadership simultaneously" guarantee
 * is a property of the code from the start.
 */
export type EscalationScope =
  | { kind: 'all' }
  | { kind: 'function'; functionId: string }
  | { kind: 'none' };

/**
 * The set of escalations a principal may see:
 *  - Leadership / Admin  → ALL functions, org-wide (they are never gated behind
 *    a Function Lead — Leadership is not surprised because a Head sat on it).
 *  - Function Lead       → only their own function's escalations.
 *  - Field               → none (the field home has no escalation board).
 *
 * Because Leadership resolves to `all` independently of the Function Lead's
 * `function` scope, both see a given escalation at the same time — it does not
 * queue behind the Head.
 */
export function visibleEscalationScope(principal: RequestPrincipal): EscalationScope {
  switch (principal.role) {
    case Role.ADMIN:
    case Role.LEADERSHIP:
      return { kind: 'all' };
    case Role.FUNCTION_LEAD:
      return principal.functionId
        ? { kind: 'function', functionId: principal.functionId }
        : { kind: 'none' };
    case Role.FIELD:
    default:
      return { kind: 'none' };
  }
}

/** Whether a principal can see an escalation raised in a given function. */
export function canViewEscalation(principal: RequestPrincipal, escalationFunctionId: string): boolean {
  const scope = visibleEscalationScope(principal);
  switch (scope.kind) {
    case 'all':
      return true;
    case 'function':
      return scope.functionId === escalationFunctionId;
    case 'none':
      return false;
  }
}
