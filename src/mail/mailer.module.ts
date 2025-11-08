// src/mail/mailer.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('EMAIL_HOST'),
          port: config.get('EMAIL_PORT'),
          secure: false,
          auth: {
            user: config.get('EMAIL_USER'),
            pass: config.get('EMAIL_PASS'),
          },
        },
        defaults: {
          from: config.get('EMAIL_FROM'),
        },
        template: {
          dir: join(process.cwd(), 'dist', 'mailer', 'templates'),
          options: { strict: true },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [MailerModule],
})
export class MailerCustomModule {}