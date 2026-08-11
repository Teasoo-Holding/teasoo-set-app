import { RequestPrincipal } from '../authz/principal-context';
import { Role } from '../authz/role';
import { canViewEscalation, visibleEscalationScope } from './escalation-visibility';

const REGULATORY = 'fn-regulatory';
const COMMUNITY = 'fn-community';

const principal = (role: Role, functionId?: string): RequestPrincipal => ({ userId: 'u', role, functionId });

describe('visibleEscalationScope', () => {
  it('leadership and admin see all functions', () => {
    expect(visibleEscalationScope(principal(Role.LEADERSHIP))).toEqual({ kind: 'all' });
    expect(visibleEscalationScope(principal(Role.ADMIN))).toEqual({ kind: 'all' });
  });

  it('a function lead is scoped to their own function', () => {
    expect(visibleEscalationScope(principal(Role.FUNCTION_LEAD, REGULATORY))).toEqual({
      kind: 'function',
      functionId: REGULATORY,
    });
  });

  it('a function lead with no function sees none', () => {
    expect(visibleEscalationScope(principal(Role.FUNCTION_LEAD))).toEqual({ kind: 'none' });
  });

  it('field users have no escalation board', () => {
    expect(visibleEscalationScope(principal(Role.FIELD))).toEqual({ kind: 'none' });
  });
});

describe('canViewEscalation', () => {
  it('shows an escalation to its own Function Lead and to Leadership simultaneously', () => {
    const escalationFn = REGULATORY;
    // Both independently true — Leadership is not queued behind the Head.
    expect(canViewEscalation(principal(Role.FUNCTION_LEAD, REGULATORY), escalationFn)).toBe(true);
    expect(canViewEscalation(principal(Role.LEADERSHIP), escalationFn)).toBe(true);
  });

  it('hides another function’s escalation from a Function Lead', () => {
    expect(canViewEscalation(principal(Role.FUNCTION_LEAD, COMMUNITY), REGULATORY)).toBe(false);
  });

  it('Leadership sees escalations in every function', () => {
    expect(canViewEscalation(principal(Role.LEADERSHIP), REGULATORY)).toBe(true);
    expect(canViewEscalation(principal(Role.LEADERSHIP), COMMUNITY)).toBe(true);
  });

  it('field users cannot see escalations', () => {
    expect(canViewEscalation(principal(Role.FIELD), REGULATORY)).toBe(false);
  });
});
