import { Body, Controller, Get, Post } from '@nestjs/common';
import { Permission } from '../authz/permission';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { StakeholdersService } from './stakeholders.service';

@Controller('stakeholders')
export class StakeholdersController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  @RequirePermissions(Permission.STAKEHOLDER_READ_DIRECTORY)
  list() {
    return this.stakeholders.list();
  }

  // REG-4: field users cannot create a stakeholder directly — they submit a
  // request that a Function Lead or Admin approves. Direct creation therefore
  // requires the approve permission.
  @Post()
  @RequirePermissions(Permission.STAKEHOLDER_APPROVE)
  create(@Body('name') name: string) {
    return this.stakeholders.create(name);
  }
}
