// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { ClothesModule } from './clothes/clothes.module';
import { OutfitsModule } from './outfits/outfits.module';
import { EventsModule } from './events/events.module';
import { StoreModule } from './store/store.module';
import { SuitcasesModule } from './suitcases/suitcases.module';
import { AvatarsModule } from './avatars/avatars.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        MONGODB_URI: Joi.string(),
        MONGO_URI: Joi.string(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('1h'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        GOOGLE_CLIENT_ID: Joi.string().required(),
        GOOGLE_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_CALLBACK_URL: Joi.string().required(),

        // EMAIL
        EMAIL_HOST: Joi.string().required(),
        EMAIL_PORT: Joi.number().default(587),
        EMAIL_USER: Joi.string().email().required(),
        EMAIL_PASS: Joi.string().required(),
        EMAIL_FROM: Joi.string().required(),

        // TWILIO
        TWILIO_ACCOUNT_SID: Joi.string().required(),
        TWILIO_AUTH_TOKEN: Joi.string().required(),
        TWILIO_PHONE_NUMBER: Joi.string().required(),

        // CLOUDINARY
        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),

        // PIN
        //PIN_EXPIRATION_MINUTES: Joi.number().default(10),
      }),
      validationOptions: {
        abortEarly: false,
      },
      
    }),

    MongooseModule.forRoot(
      process.env.MONGODB_URI ??
        process.env.MONGO_URI ??
        'mongodb://127.0.0.1:27017/labasni',
    ),

    UserModule,
    AuthModule,
    ClothesModule,
    OutfitsModule,
    EventsModule,
    StoreModule,
    SuitcasesModule,
    AvatarsModule,
    CloudinaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}