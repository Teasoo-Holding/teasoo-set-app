import { Body, Controller, Get, Post } from '@nestjs/common';
import { StakeholdersService } from './stakeholders.service';

@Controller('stakeholders')
export class StakeholdersController {
  constructor(private readonly stakeholders: StakeholdersService) {}

  @Get()
  list() {
    return this.stakeholders.list();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.stakeholders.create(name);
  }
}
