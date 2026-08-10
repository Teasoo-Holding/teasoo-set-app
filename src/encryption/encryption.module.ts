import { Module } from '@nestjs/common';
import { CryptoService, loadMasterKey } from './crypto.service';
import { KEY_STORE, KeyStore, PrismaKeyStore } from './key-store';
import { TenantKeyService } from './tenant-key.service';
import { TenantFieldCrypto } from './tenant-field-crypto';

@Module({
  providers: [
    { provide: CryptoService, useFactory: () => new CryptoService(loadMasterKey()) },
    { provide: KEY_STORE, useClass: PrismaKeyStore },
    {
      provide: TenantKeyService,
      useFactory: (crypto: CryptoService, store: KeyStore) => new TenantKeyService(crypto, store),
      inject: [CryptoService, KEY_STORE],
    },
    TenantFieldCrypto,
  ],
  exports: [TenantFieldCrypto, TenantKeyService],
})
export class EncryptionModule {}
