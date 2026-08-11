import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { DEMO_DIRECTORY, DemoDirectory } from './demo-directory';
import { DemoSessionSigner } from './demo-session';

/**
 * The sandbox role-switcher (AUTH-3). Unauthenticated by design — it is the demo
 * sign-in — but STRUCTURALLY refused for production tenants: every route 404s
 * unless the named tenant is a sandbox. This is the prototype's role-switcher,
 * gated so it can never operate on a production tenant.
 */
@Controller('auth/demo')
export class DemoController {
  constructor(
    private readonly signer: DemoSessionSigner,
    @Inject(DEMO_DIRECTORY) private readonly demo: DemoDirectory,
  ) {}

  @Get('personas')
  async personas(@Query('tenant') tenant: string) {
    await this.assertSandbox(tenant);
    const personas = await this.demo.listPersonas(tenant);
    return {
      demo: true,
      personas: personas.map((p) => ({ userId: p.userId, email: p.email, role: p.role })),
    };
  }

  @Post('switch')
  async switch(@Body('tenant') tenant: string, @Body('personaId') personaId: string) {
    if (!tenant || !personaId) throw new BadRequestException('tenant and personaId are required.');
    await this.assertSandbox(tenant);

    const persona = await this.demo.findPersona(tenant, personaId);
    if (!persona) throw new NotFoundException('Persona not found.');

    const { token, expiresAt } = await this.signer.mint({ sub: persona.userId, tenant });
    return { demo: true, token, expiresAt, persona: { userId: persona.userId, role: persona.role } };
  }

  private async assertSandbox(tenant: string): Promise<void> {
    if (!tenant) throw new BadRequestException('tenant is required.');
    // 404 (not 403) so a production tenant is indistinguishable from a missing one.
    if ((await this.demo.findTenantKind(tenant)) !== 'sandbox') {
      throw new NotFoundException('No sandbox tenant by that name.');
    }
  }
}
