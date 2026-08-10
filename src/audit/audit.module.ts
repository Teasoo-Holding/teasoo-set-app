import { Global, Module } from '@nestjs/common';
import { AUDIT_STORE, PrismaAuditStore } from './audit-store';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [
    { provide: AUDIT_STORE, useClass: PrismaAuditStore },
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
