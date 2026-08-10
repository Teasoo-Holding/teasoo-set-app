import { Permission, PERMISSION_MATRIX } from './permission';
import { parseRole, Role } from './role';

describe('permission matrix', () => {
  it('field users can request but not approve/create stakeholders (REG-4)', () => {
    expect(PERMISSION_MATRIX[Role.FIELD].has(Permission.STAKEHOLDER_REQUEST)).toBe(true);
    expect(PERMISSION_MATRIX[Role.FIELD].has(Permission.STAKEHOLDER_APPROVE)).toBe(false);
  });

  it('field users cannot read engagement notes (REG-5)', () => {
    expect(PERMISSION_MATRIX[Role.FIELD].has(Permission.STAKEHOLDER_READ_NOTES)).toBe(false);
    expect(PERMISSION_MATRIX[Role.FUNCTION_LEAD].has(Permission.STAKEHOLDER_READ_NOTES)).toBe(true);
  });

  it('any role can raise an escalation (ESC-1)', () => {
    for (const role of Object.values(Role)) {
      expect(PERMISSION_MATRIX[role].has(Permission.ESCALATION_RAISE)).toBe(true);
    }
  });

  it('logging on any stakeholder is Head and above (ENG-11)', () => {
    expect(PERMISSION_MATRIX[Role.FIELD].has(Permission.ENGAGEMENT_LOG_ANY)).toBe(false);
    expect(PERMISSION_MATRIX[Role.FUNCTION_LEAD].has(Permission.ENGAGEMENT_LOG_ANY)).toBe(true);
  });

  it('tier changes are leadership/admin only (REG-2)', () => {
    expect(PERMISSION_MATRIX[Role.FUNCTION_LEAD].has(Permission.TIER_CHANGE_APPROVE)).toBe(false);
    expect(PERMISSION_MATRIX[Role.LEADERSHIP].has(Permission.TIER_CHANGE_APPROVE)).toBe(true);
  });

  it('org-wide analytics is leadership and above (§7.7)', () => {
    expect(PERMISSION_MATRIX[Role.FUNCTION_LEAD].has(Permission.ANALYTICS_VIEW_ORG)).toBe(false);
    expect(PERMISSION_MATRIX[Role.LEADERSHIP].has(Permission.ANALYTICS_VIEW_ORG)).toBe(true);
  });

  it('governance capabilities are admin only (§7.8)', () => {
    for (const perm of [
      Permission.GOVERNANCE_MANAGE,
      Permission.USER_MANAGE,
      Permission.TAXONOMY_MANAGE,
      Permission.AUDIT_READ,
      Permission.IMPERSONATE,
    ]) {
      expect(PERMISSION_MATRIX[Role.LEADERSHIP].has(perm)).toBe(false);
      expect(PERMISSION_MATRIX[Role.ADMIN].has(perm)).toBe(true);
    }
  });

  it('is cumulative: each role includes every permission of the role below it', () => {
    const order = [Role.FIELD, Role.FUNCTION_LEAD, Role.LEADERSHIP, Role.ADMIN];
    for (let i = 1; i < order.length; i++) {
      const lower = PERMISSION_MATRIX[order[i - 1]];
      const higher = PERMISSION_MATRIX[order[i]];
      for (const perm of lower) {
        expect(higher.has(perm)).toBe(true);
      }
    }
  });
});

describe('parseRole', () => {
  it('parses known roles case-insensitively', () => {
    expect(parseRole('admin')).toBe(Role.ADMIN);
    expect(parseRole('Function_Lead')).toBe(Role.FUNCTION_LEAD);
  });

  it('rejects unknown or missing values', () => {
    expect(parseRole('root')).toBeUndefined();
    expect(parseRole(undefined)).toBeUndefined();
  });
});
