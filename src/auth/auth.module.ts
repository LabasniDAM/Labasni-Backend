import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JWT_SECRET, JWT_SIGN_OPTIONS } from './auth.constants';
import { EmailService } from './email.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { HttpModule } from '@nestjs/axios';
import { AppleStrategy } from './strategies/apple.strategy';
import { TwilioService } from './twilio.service';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';

@Module({
  imports: [
    UserModule,
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: JWT_SIGN_OPTIONS,
    }),
    HttpModule,
    CloudinaryModule,
    SubscriptionsModule, // <-- AJOUTÉ
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, GoogleStrategy, AppleStrategy, TwilioService, EmailService],
  exports: [AuthService],
})
export class AuthModule {}
