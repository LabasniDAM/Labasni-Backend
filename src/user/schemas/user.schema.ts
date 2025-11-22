import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
})
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: false, select: false })
  password?: string;

  @Prop({ required: true, enum: ['male', 'female'] })
  gender: 'male' | 'female';

  @Prop({ type: [String], default: [] })
  preferences?: string[];

  @Prop({ required: false, trim: true })
  phoneNumber?: string;

  // OAuth fields
  @Prop({ type: String, enum: ['local', 'google', 'apple'], default: 'local' })
  authProvider: 'local' | 'google' | 'apple';

  @Prop({ required: false, unique: true, sparse: true })
  googleId?: string;

  @Prop({ required: false, unique: true, sparse: true })
  appleId?: string;

  @Prop({ required: false })
  profilePicture?: string;

  @Prop({ default: false })
isVerified: boolean;

@Prop({ required: false })
verificationCode?: string;

@Prop({ required: false })
verificationCodeExpiresAt?: Date;

  @Prop({ type: String, required: false, default: null })
  resetOtpCode?: string | null;

  @Prop({ type: Date, required: false, default: null })
  resetOtpExpiresAt?: Date | null;

  @Prop({ default: 0, min: 0 })
  balance: number;  // Balance du seller en cents (ex. : 1000 = 10.00 USD)

}

export const UserSchema = SchemaFactory.createForClass(User);

const removeSensitiveFields = (_: unknown, ret: any) => {
  delete ret.password;
  delete ret.resetOtpCode;
  delete ret.resetOtpExpiresAt;
  if (ret._id) {
    ret.id = ret._id;
    delete ret._id;
  }
  delete ret.__v;
  return ret;
};

UserSchema.set('toObject', {
  transform: removeSensitiveFields,
});
UserSchema.set('toJSON', {
  transform: removeSensitiveFields,
});
