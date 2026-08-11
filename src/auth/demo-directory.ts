import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseRole, Role } from '../authz/role';

export type TenantKind = 'production' | 'sandbox';

export interface Persona {
  userId: string;
  email: string;
  role: Role;
  functionId?: string;
  reportsToId?: string;
}

/** Lookups specific to demo/sandbox mode (AUTH-3). */
export interface DemoDirectory {
  findTenantKind(slug: string): Promise<TenantKind | null>;
  listPersonas(slug: string): Promise<Persona[]>;
  findPersona(slug: string, userId: string): Promise<Persona | null>;
}

export const DEMO_DIRECTORY = Symbol('DEMO_DIRECTORY');

@Injectable()
export class PrismaDemoDirectory implements DemoDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantKind(slug: string): Promise<TenantKind | null> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { slug } });
    if (!tenant) return null;
    return tenant.kind === 'sandbox' ? 'sandbox' : 'production';
  }

  async listPersonas(slug: string): Promise<Persona[]> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { slug } });
    if (!tenant) return [];
    const users = await this.prisma.client.user.findMany({ where: { tenantId: tenant.id, status: 'active' } });
    return users.map((u) => this.toPersona(u)).filter((p): p is Persona => p !== null);
  }

  async findPersona(slug: string, userId: string): Promise<Persona | null> {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { slug } });
    if (!tenant) return null;
    const user = await this.prisma.client.user.findFirst({ where: { id: userId, tenantId: tenant.id } });
    return user ? this.toPersona(user) : null;
  }

  private toPersona(user: {
    id: string;
    email: string;
    role: string;
    functionId: string | null;
    reportsToId: string | null;
  }): Persona | null {
    const role = parseRole(user.role);
    if (!role) return null;
    return {
      userId: user.id,
      email: user.email,
      role,
      functionId: user.functionId ?? undefined,
      reportsToId: user.reportsToId ?? undefined,
    };
  }
}
