import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, Role } from '../authz/role';
import { normalizePrecedence, TenantAuthPolicy } from './auth-settings';

export interface DirectoryUser {
  userId: string;
  role: Role;
  functionId?: string;
  reportsToId?: string;
  status: string;
}

/** Email-domain → tenant slug. */
export interface TenantDirectory {
  findTenantSlugByDomain(domain: string): Promise<string | null>;
}

/** Tenant + email → the user's authorization attributes. */
export interface UserDirectory {
  findUser(tenantSlug: string, email: string): Promise<DirectoryUser | null>;
}

/** Tenant → its identity-resolution policy (AUTH-2). */
export interface AuthSettingsDirectory {
  findByTenant(tenantSlug: string): Promise<TenantAuthPolicy | null>;
}

export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
export const AUTH_SETTINGS_DIRECTORY = Symbol('AUTH_SETTINGS_DIRECTORY');

@Injectable()
export class PrismaTenantDirectory implements TenantDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantSlugByDomain(domain: string): Promise<string | null> {
    const row = await this.prisma.client.tenantDomain.findUnique({
      where: { domain },
      include: { tenant: true },
    });
    return row?.tenant.slug ?? null;
  }
}

@Injectable()
export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findUser(tenantSlug: string, email: string): Promise<DirectoryUser | null> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return null;

    const user = await this.prisma.client.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user) return null;

    const role = parseRole(user.role);
    if (!role) return null; // an unmappable role must not authorize anything

    return {
      userId: user.id,
      role,
      functionId: user.functionId ?? undefined,
      reportsToId: user.reportsToId ?? undefined,
      status: user.status,
    };
  }
}

@Injectable()
export class PrismaAuthSettingsDirectory implements AuthSettingsDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(tenantSlug: string): Promise<TenantAuthPolicy | null> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return null;

    const settings = await this.prisma.client.tenantAuthSettings.findUnique({
      where: { tenantId: tenant.id },
    });
    if (!settings) return null;

    return {
      precedence: normalizePrecedence(settings.precedence),
      roleClaim: settings.roleClaim ?? undefined,
      functionClaim: settings.functionClaim ?? undefined,
      reportsToClaim: settings.reportsToClaim ?? undefined,
    };
  }
}
