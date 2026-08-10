import { Role } from './role';

/**
 * Capabilities a role may hold (PRD §4.1 permission matrix). Named
 * resource:action. Data scope (own vs function vs org) is expressed as distinct
 * permissions (e.g. ANALYTICS_VIEW_FUNCTION vs ANALYTICS_VIEW_ORG) rather than
 * baked into one permission, so scope stays explicit and checkable.
 */
export enum Permission {
  // Stakeholder registry
  STAKEHOLDER_REQUEST = 'stakeholder:request', // REG-4: field submits a request
  STAKEHOLDER_APPROVE = 'stakeholder:approve', // REG-4: lead/admin approve or create directly
  STAKEHOLDER_READ_DIRECTORY = 'stakeholder:read_directory', // REG-5: reduced directory
  STAKEHOLDER_READ_NOTES = 'stakeholder:read_notes', // REG-5: field users may NOT
  TIER_CHANGE_APPROVE = 'tier:change_approve', // REG-2: leadership/admin

  // Engagements & commitments
  ENGAGEMENT_LOG_OWN = 'engagement:log_own',
  ENGAGEMENT_LOG_ANY = 'engagement:log_any', // ENG-11: head and above
  COMMITMENT_READ_OWN = 'commitment:read_own', // COM-2
  COMMITMENT_READ_SCOPE = 'commitment:read_scope', // COM-3: head/leadership

  // Escalations
  ESCALATION_RAISE = 'escalation:raise', // ESC-1: any user
  ESCALATION_RESOLVE = 'escalation:resolve', // ESC-5
  ESCALATION_READ_FUNCTION = 'escalation:read_function', // §4.1

  // Dashboards / analytics
  ANALYTICS_VIEW_FUNCTION = 'analytics:view_function', // §7.7 Function Lead home
  ANALYTICS_VIEW_ORG = 'analytics:view_org', // §7.7 Leadership home

  // Governance (Admin) — §7.8
  EXPORT_DATA = 'export:data', // GOV-5
  GOVERNANCE_MANAGE = 'governance:manage',
  USER_MANAGE = 'user:manage', // GOV-1
  TAXONOMY_MANAGE = 'taxonomy:manage', // GOV-2
  AUDIT_READ = 'audit:read', // GOV-4
  IMPERSONATE = 'impersonate', // AUTH-5
}

// Roles are cumulative: each tier can do everything the tier below it can, plus
// more. This mirrors §7.7 ("Leadership as Function Lead but org-wide", "Admin =
// Leadership plus Governance").
const FIELD: Permission[] = [
  Permission.STAKEHOLDER_REQUEST,
  Permission.STAKEHOLDER_READ_DIRECTORY,
  Permission.ENGAGEMENT_LOG_OWN,
  Permission.COMMITMENT_READ_OWN,
  Permission.ESCALATION_RAISE,
];

const FUNCTION_LEAD: Permission[] = [
  ...FIELD,
  Permission.STAKEHOLDER_APPROVE,
  Permission.STAKEHOLDER_READ_NOTES,
  Permission.ENGAGEMENT_LOG_ANY,
  Permission.COMMITMENT_READ_SCOPE,
  Permission.ESCALATION_RESOLVE,
  Permission.ESCALATION_READ_FUNCTION,
  Permission.ANALYTICS_VIEW_FUNCTION,
  Permission.EXPORT_DATA,
];

const LEADERSHIP: Permission[] = [
  ...FUNCTION_LEAD,
  Permission.TIER_CHANGE_APPROVE,
  Permission.ANALYTICS_VIEW_ORG,
];

const ADMIN: Permission[] = [
  ...LEADERSHIP,
  Permission.GOVERNANCE_MANAGE,
  Permission.USER_MANAGE,
  Permission.TAXONOMY_MANAGE,
  Permission.AUDIT_READ,
  Permission.IMPERSONATE,
];

/**
 * Default role -> permissions matrix. Roles assigned to users are configurable
 * per tenant (PRD §4); this product-level matrix defines what each role means.
 */
export const PERMISSION_MATRIX: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  [Role.FIELD]: new Set(FIELD),
  [Role.FUNCTION_LEAD]: new Set(FUNCTION_LEAD),
  [Role.LEADERSHIP]: new Set(LEADERSHIP),
  [Role.ADMIN]: new Set(ADMIN),
};
