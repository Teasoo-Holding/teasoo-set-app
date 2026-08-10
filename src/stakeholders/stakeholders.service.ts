import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal sample service that exists to demonstrate TEN-1 end to end: notice
 * that neither method mentions a tenant. Scoping comes entirely from
 * `withTenant` + the tenant-scope extension. The real registry is EP-2.
 */
@Injectable()
export class StakeholdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(name: string) {
    return this.prisma.withTenant((tx) =>
      // tenantId is injected by the tenant-scope extension, so it is
      // intentionally absent from the data passed here.
      tx.stakeholder.create({ data: { name } as never }),
    );
  }

  list() {
    return this.prisma.withTenant((tx) =>
      tx.stakeholder.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }
}
