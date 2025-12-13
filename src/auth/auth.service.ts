import {
  BadRequestException,
  ConflictException,
  Delete,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtSignOptions } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios'; 
import { firstValueFrom } from 'rxjs'; 
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken'; 
import * as jwkToPem from 'jwk-to-pem'; 
import {
  CreateUserInput,
  SafeUser,
  UpdateUserInput,
  UserService,
} from '../user/user.service';
import { SignupDto } from './dto/signup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { randomInt } from 'crypto';
import { EmailService } from './email.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TwilioService } from './twilio.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthResponse {
  user: SafeUser;
  access_token: string;
  refresh_token: string; // ✨ NOUVEAU : Refresh token pour renouveler l'access token
}

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;
  private appleJwksCache: { keys: any[]; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24h

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly httpService: HttpService,
    private readonly twilioService: TwilioService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly subscriptionsService: SubscriptionsService,

  ) {}

  private readonly DEFAULT_PHONE_PREFIX = '+216';
  private readonly OTP_EXPIRATION_MS = 10 * 60 * 1000;

  private normalizePhoneNumber(raw?: string | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let normalized = trimmed.replace(/\s+/g, '');
    if (normalized.startsWith('00')) {
      normalized = `+${normalized.substring(2)}`;
    }

    if (!normalized.startsWith('+')) {
      normalized = `${this.DEFAULT_PHONE_PREFIX}${normalized.replace(/^\+/, '')}`;
    }

    if (!/^\+\d{6,15}$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private maskPhoneNumber(phoneNumber: string): string {
    const sanitized = phoneNumber.replace(/\s+/g, '');
    if (sanitized.length <= 7) {
      return sanitized;
    }

    const prefix = sanitized.slice(0, Math.min(4, sanitized.length - 3));
    const suffix = sanitized.slice(-3);
    return `${prefix} ** *** ${suffix}`;
  }

  // --- SIGNUP ---
  async signup(signupDto: SignupDto) {
    const emailTaken = await this.userService.existsByEmail(signupDto.email);
    if (emailTaken) throw new ConflictException('Email déjà utilisé');

    const normalizedPhone = this.normalizePhoneNumber(signupDto.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }

    const preferences = signupDto.preferences ?? [];

    const hashedPassword = await bcrypt.hash(signupDto.password, this.saltRounds);
    const verificationCode = randomInt(100000, 999999).toString();

    const tempPayload = {
      email: signupDto.email,
      fullName: signupDto.fullName,
      password: hashedPassword,
      gender: signupDto.gender,
      code: verificationCode,
      phoneNumber: normalizedPhone,
      preferences,
    };

    const tempToken = await this.jwtService.signAsync(tempPayload, { expiresIn: '7d' });

    const emailSubject = 'Votre code Styleto';
    const emailText = [
      `Bonjour ${signupDto.fullName},`,
      '',
      'Merci de rejoindre Styleto.',
      `Votre code de vérification est : ${verificationCode}`,
      '',
      'Ce code expirera dans 10 minutes.',
      '',
      'À très vite,',
      "L'équipe Styleto",
    ].join('\n');

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>${emailSubject}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f9fafb;
              margin: 0;
              padding: 0;
              color: #1f2933;
            }
            .container {
              max-width: 480px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              padding: 32px;
              box-shadow: 0 12px 32px rgba(17, 24, 39, 0.08);
            }
            .logo {
              text-align: center;
              font-size: 28px;
              font-weight: 700;
              color: #c63c66;
              margin-bottom: 8px;
            }
            .greeting {
              font-size: 16px;
              margin-bottom: 16px;
            }
            .code-box {
              text-align: center;
              padding: 18px 24px;
              margin: 24px 0;
              background: linear-gradient(135deg, #c63c66, #7ec8c7);
              border-radius: 14px;
              color: #ffffff;
              font-size: 32px;
              letter-spacing: 6px;
              font-weight: 600;
            }
            .info {
              font-size: 14px;
              line-height: 1.6;
              color: #52606d;
              margin-bottom: 24px;
            }
            .footer {
              font-size: 13px;
              color: #9aa5b1;
              text-align: center;
              margin-top: 24px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Styleto</div>
            <p class="greeting">Bonjour ${signupDto.fullName},</p>
            <p class="info">
              Merci de confirmer votre adresse e-mail pour finaliser la création de votre compte Styleto.
              Utilisez le code ci-dessous dans les 10 prochaines minutes :
            </p>
            <div class="code-box">${verificationCode}</div>
            <p class="info">
              Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
            </p>
            <p class="info">
              À très vite,<br/>
              L'équipe Styleto
            </p>
            <div class="footer">
              © ${new Date().getFullYear()} Styleto. Tous droits réservés.
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await this.emailService.sendEmail(
        signupDto.email,
        emailSubject,
        emailHtml,
        emailText
      );
    } catch (error) {
      console.error('Échec envoi email:', error);
      throw new InternalServerErrorException('Échec envoi email');
    }

    return { message: 'Code envoyé. Vérifiez votre email.', tempToken };
  }

  async verifyEmail(dto: VerifyEmailDto) {
  let payload: any;

  try {
    payload = await this.jwtService.verifyAsync(dto.tempToken);
  } catch {
    throw new UnauthorizedException('Token invalide ou expiré');
  }

  if (payload.code !== dto.code) {
    throw new UnauthorizedException('Code incorrect');
  }

  const existingUser = await this.userService.findByEmail(payload.email);
  if (existingUser) {
    throw new ConflictException('Compte déjà créé');
  }

  const normalizedPhone = this.normalizePhoneNumber(payload.phoneNumber);
  if (!normalizedPhone) {
    throw new BadRequestException('Numéro de téléphone invalide');
  }

  const newUser = await this.userService.create({
    fullName: payload.fullName,
    email: payload.email,
    password: payload.password,
    gender: payload.gender,
    phoneNumber: normalizedPhone,
    preferences: Array.isArray(payload.preferences) ? payload.preferences : undefined,
    isVerified: true,
  });
  await this.subscriptionsService.createDefaultSubscription(newUser.id);

  return {
    message: 'Compte créé avec succès',
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      gender: newUser.gender,
      phoneNumber: newUser.phoneNumber,
      preferences: newUser.preferences,
    },
  };
}

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('Aucun compte associé à cet email');
    }

    if (!user.phoneNumber) {
      throw new BadRequestException('Aucun numéro de téléphone associé à ce compte');
    }

    if (!user.isVerified) {
      throw new BadRequestException("Ce compte n'est pas encore vérifié.");
    }

    const normalizedPhone = this.normalizePhoneNumber(user.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Numéro de téléphone invalide.');
    }

    const otpCode = randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(otpCode, this.saltRounds);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRATION_MS);
    const userId = user.id ?? (user as any)._id?.toString();

    await this.userService.updateById(userId, {
      phoneNumber: normalizedPhone,
      resetOtpCode: hashedOtp,
      resetOtpExpiresAt: expiresAt,
    });

    try {
      await this.twilioService.sendOtpSms(normalizedPhone, otpCode);
    } catch (error) {
      await this.userService.updateById(userId, {
        resetOtpCode: null,
        resetOtpExpiresAt: null,
      });
      throw error;
    }

    return {
      message: 'Code de réinitialisation envoyé par SMS.',
      maskedPhoneNumber: this.maskPhoneNumber(normalizedPhone),
      expiresAt,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user || !user.resetOtpCode || !user.resetOtpExpiresAt) {
      throw new UnauthorizedException('OTP invalide');
    }

    const userId = user.id ?? (user as any)._id?.toString();

    if (user.resetOtpExpiresAt.getTime() < Date.now()) {
      await this.userService.updateById(userId, {
        resetOtpCode: null,
        resetOtpExpiresAt: null,
      });
      throw new UnauthorizedException('Code expiré, demandez un nouveau code');
    }

    const isValid = await bcrypt.compare(dto.code, user.resetOtpCode);
    if (!isValid) {
      throw new UnauthorizedException('Code incorrect');
    }

    await this.userService.updateById(userId, {
      resetOtpCode: null,
      resetOtpExpiresAt: null,
    });

    const resetToken = await this.jwtService.signAsync(
      { sub: userId, email: user.email, purpose: 'reset-password' },
      { expiresIn: '15m' },
    );

    return {
      message: 'Code validé. Vous pouvez réinitialiser votre mot de passe.',
      resetToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.resetToken);
    } catch {
      throw new UnauthorizedException('Lien de réinitialisation invalide ou expiré');
    }

    if (payload.purpose !== 'reset-password') {
      throw new UnauthorizedException('Lien de réinitialisation invalide');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.saltRounds);
    const updatedUser = await this.userService.updateById(payload.sub, {
      password: hashedPassword,
      resetOtpCode: null,
      resetOtpExpiresAt: null,
    });

    if (!updatedUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return { message: 'Mot de passe réinitialisé avec succès.' };
  }

  // --- LOGIN ---
  async login(user: SafeUser): Promise<AuthResponse> {
    if (!user?.id) throw new UnauthorizedException('Invalid user payload');
    const payload: JwtPayload = { sub: user.id, email: user.email };
    
    // ✨ NOUVEAU : Générer access token (expire après 1h)
    const access_token = await this.jwtService.signAsync(payload);
    
    // ✨ NOUVEAU : Générer refresh token (expire après 7 jours)
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    const refresh_token = await this.jwtService.signAsync(payload, {
      expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
    });
    
    return {
      user,
      access_token,
      refresh_token,
    };
  }

  // ✨ NOUVEAU : Méthode pour rafraîchir le token
  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    try {
      // Vérifier le refresh token
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
      
      // Vérifier que l'utilisateur existe toujours
      const user = await this.userService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      
      // Générer un nouveau access token
      const newPayload: JwtPayload = { sub: user.id, email: user.email };
      const access_token = await this.jwtService.signAsync(newPayload);
      
      // ✨ Rotation du refresh token : générer un nouveau refresh token
      const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
      const newRefreshToken = await this.jwtService.signAsync(newPayload, {
        expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
      });
      
      return {
        access_token,
        refresh_token: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // --- VALIDATE USER ---
  async validateUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) return null;
    return user;
  }

  // --- UPDATE PROFILE ---
  // --- MISE À JOUR TEXTE SEULEMENT ---
  async updateProfileText(userId: string, updateDto: UpdateProfileDto): Promise<SafeUser> {
    const updates: any = {};

    if (updateDto.fullName !== undefined) {
      updates.fullName = updateDto.fullName?.trim();
    }
    if (updateDto.phoneNumber !== undefined) {
      updates.phoneNumber = updateDto.phoneNumber?.trim();
    }
    if (updateDto.gender !== undefined) {
      updates.gender = updateDto.gender;
    }
    if (updateDto.password) {
      updates.password = await bcrypt.hash(updateDto.password, 10);
    }

    if (updateDto.preferences !== undefined) {
      updates.preferences = updateDto.preferences;
    }

    if (Object.keys(updates).length === 0) {
      const user = await this.userService.findById(userId);
      if (!user) throw new NotFoundException('User not found');
      return user;
    }

    const updatedUser = await this.userService.updateById(userId, updates);
    if (!updatedUser) throw new NotFoundException('User not found');
    return updatedUser;
  }

  // --- MISE À JOUR PHOTO SEULEMENT ---
  async updateProfilePhoto(userId: string, image: Express.Multer.File): Promise<SafeUser> {
    let profilePicture: string | undefined;

    try {
      const result = await this.cloudinaryService.uploadImage(image);
      profilePicture = result.secure_url;
    } catch (error) {
      console.error('Échec upload:', error);
      throw new InternalServerErrorException('Échec upload image');
    }

    const updatedUser = await this.userService.updateById(userId, { profilePicture });
    if (!updatedUser) throw new NotFoundException('User not found');
    return updatedUser;
  }

  // --- DELETE PROFILE ---
  async deleteProfile(userId: string): Promise<void> {
    const existingUser = await this.userService.findById(userId);
    if (!existingUser) throw new NotFoundException('User not found');
    await this.userService.removeById(userId);
  }

// 4. Modifier googleAuth pour créer subscription
async googleAuth(googleAuthDto: GoogleAuthDto): Promise<AuthResponse> {
  let user = await this.userService.findByGoogleId(googleAuthDto.googleId);

  if (!user) {
    const existingUser = await this.userService.findByEmail(googleAuthDto.email);
    if (existingUser) {
      const updates: UpdateUserInput = {
        googleId: googleAuthDto.googleId,
        authProvider: 'google',
      };

      if (!existingUser.profilePicture && googleAuthDto.profilePicture) {
        updates.profilePicture = googleAuthDto.profilePicture;
      }

      await this.userService.updateById(existingUser.id, updates);
      user = await this.userService.findByGoogleId(googleAuthDto.googleId);
    } else {
      user = await this.userService.create({
        fullName: googleAuthDto.fullName,
        email: googleAuthDto.email,
        gender: googleAuthDto.gender || 'male',
        authProvider: 'google',
        googleId: googleAuthDto.googleId,
        profilePicture: googleAuthDto.profilePicture || undefined,
        isVerified: true,
      });

      // ✨ NOUVEAU : Créer subscription pour nouveau compte Google
      await this.subscriptionsService.createDefaultSubscription(user.id);
    }
  }

  if (!user) throw new UnauthorizedException('Failed to authenticate with Google');
  return this.login(user);
}
  // --- APPLE PUBLIC KEYS ---
  private async getApplePublicKeys() {
    const now = Date.now();
    if (this.appleJwksCache && now - this.appleJwksCache.timestamp < this.CACHE_DURATION) {
      return this.appleJwksCache;
    }

    const response = await firstValueFrom(
      this.httpService.get('https://appleid.apple.com/auth/keys')
    );
    this.appleJwksCache = { keys: response.data.keys, timestamp: now };
    return this.appleJwksCache;
  }

// 5. Modifier appleAuth pour créer subscription
async appleAuth(dto: AppleAuthDto): Promise<AuthResponse> {
  const { identityToken, fullName, email } = dto;

  const decoded = jwt.decode(identityToken) as any;
  if (!decoded || decoded.iss !== 'https://appleid.apple.com') {
    throw new UnauthorizedException('Token Apple invalide');
  }

  const jwks = await this.getApplePublicKeys();
  const key = jwks.keys.find((k: any) => k.kid === decoded.kid);
  if (!key) throw new UnauthorizedException('Clé Apple introuvable');

  const pem = jwkToPem(key);
  jwt.verify(identityToken, pem, { algorithms: ['RS256'] });

  const appleId = decoded.sub;

  let user = await this.userService.findByAppleId(appleId);
  if (!user) {
    user = await this.userService.create({
      appleId,
      email: email || `${appleId}@privaterelay.appleid.com`,
      fullName: fullName || 'Apple User',
      authProvider: 'apple',
      isVerified: true,
    });

    // ✨ NOUVEAU : Créer subscription pour nouveau compte Apple
    await this.subscriptionsService.createDefaultSubscription(user.id);
  }

  return this.login(user);
}

  

  // --- VALIDATE GOOGLE USER (optionnel) ---
  async validateGoogleUser(googleData: {
    googleId: string;
    email: string;
    fullName: string;
    profilePicture?: string;
  }) {
    let user = await this.userService.findByGoogleId(googleData.googleId);

    if (!user) {
      const existingUser = await this.userService.findByEmail(googleData.email);
      if (existingUser) {
        await this.userService.updateById(existingUser.id, {
          googleId: googleData.googleId,
          authProvider: 'google',
          profilePicture: googleData.profilePicture,
        });
        user = await this.userService.findByGoogleId(googleData.googleId);
      } else {
        user = await this.userService.create({
          fullName: googleData.fullName,
          email: googleData.email,
          gender: null as any,
          authProvider: 'google',
          googleId: googleData.googleId,
          profilePicture: googleData.profilePicture,
          isVerified: true,
        });
      }
    }

    if (!user) throw new UnauthorizedException('Échec de l’authentification Google');
    return user;
  }

  // --- DELETE PROFILE PHOTO ---
  async deleteProfilePhoto(userId: string): Promise<SafeUser> {
  const user = await this.userService.findById(userId);
  if (!user) throw new NotFoundException('Utilisateur introuvable');
  
  if (!user.profilePicture) {
    return user;
  }

  // Extraire le publicId
  const urlParts = user.profilePicture.split('/');
  const fileWithExt = urlParts[urlParts.length - 1];
  const publicId = `labasni_profiles/${fileWithExt.split('.')[0]}`;

  try {
    await this.cloudinaryService.deleteImage(publicId);
  } catch (error) {
    console.error('Échec suppression Cloudinary:', error);
  }

  const updatedUser = await this.userService.updateById(userId, {
    profilePicture: undefined
  });

  if (!updatedUser) throw new NotFoundException('Échec mise à jour');
  return updatedUser;
}



  
}