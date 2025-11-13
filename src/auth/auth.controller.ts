import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SafeUser } from '../user/user.service';
import { AuthResponse, AuthService } from './auth.service';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // --- Signup ---
  @Post('signup')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: SignupDto })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  // --- Signin ---
  @UseGuards(AuthGuard('local'))
  @Post('signin')
  @ApiOperation({ summary: 'Sign in using email and password' })
  @ApiBody({ type: SigninDto })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful. Returns JWT token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async signin(@Request() req: { user: SafeUser }, @Body() _dto: SigninDto) {
    return this.authService.login(req.user);
  }

  // --- Get Profile ---
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated user profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Returns authenticated user profile.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid authentication token.' })
  getProfile(@Request() req: { user: SafeUser }) {
    return req.user;
  }

  // --- Update Profile ---
  // --- UPDATE PROFILE (texte) ---
@UseGuards(JwtAuthGuard)
@Patch('profile')
@ApiConsumes('application/json')
@ApiBearerAuth()
@ApiOperation({ summary: 'Mettre à jour les informations textuelles du profil' })
async updateProfileText(
  @Request() req,
  @Body() updateDto: UpdateProfileDto,
) {
  return this.authService.updateProfileText(req.user.id, updateDto);
}

// --- UPDATE PROFILE PHOTO (image seulement) ---
@UseGuards(JwtAuthGuard)
@Patch('profile/photo')
@UseInterceptors(FileInterceptor('image'))
@ApiConsumes('multipart/form-data')
@ApiBearerAuth()
@ApiOperation({ summary: 'Mettre à jour uniquement la photo de profil' })
@ApiBody({
  description: 'Image de profil',
  type: 'multipart/form-data',
  schema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        format: 'binary',
      },
    },
  },
})
async updateProfilePhoto(
  @Request() req,
  @UploadedFile() image: Express.Multer.File,
) {
  if (!image) {
    throw new BadRequestException('Aucune image fournie');
  }
  return this.authService.updateProfilePhoto(req.user.id, image);
}
  // --- Delete Profile ---
  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  @ApiOperation({ summary: 'Delete authenticated user account' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid authentication token.' })
  async deleteProfile(@Request() req: { user: SafeUser }) {
    await this.authService.deleteProfile(req.user.id);
    return { message: 'User deleted successfully' };
  }
    // --- Delete Profile Photo ---

  

  // --- Google Auth ---
  @Post('google')
  @ApiOperation({ summary: 'Authenticate or register via Google (iOS)' })
  @ApiBody({ type: GoogleAuthDto })
  @ApiResponse({ status: 200, description: 'Google authentication successful.' })
  @ApiResponse({ status: 401, description: 'Google authentication failed.' })
  async googleAuth(@Body() googleAuthDto: GoogleAuthDto) {
    return this.authService.googleAuth(googleAuthDto);
  }

  @Get('google/callback')
  @ApiOperation({ 
  summary: 'Google OAuth callback endpoint',
  description: 'Callback endpoint for Google OAuth 2.0 authentication. Handles the redirect from Google after successful user authentication.'
  })
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Request() req: { user: SafeUser }) {
    return this.authService.login(req.user);
  }

  // --- Apple Auth ---
  @Post('apple')
  @ApiOperation({ summary: 'Authenticate via Apple (iOS)' })
  @ApiBody({ type: AppleAuthDto })
  @ApiResponse({ status: 200, description: 'Apple authentication successful.' })
  async appleAuth(@Body() appleAuthDto: AppleAuthDto) {
    return this.authService.appleAuth(appleAuthDto);
  }



  // --- Verify Email ---
  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Demander un OTP SMS pour réinitialiser le mot de passe' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 201, description: 'Code OTP envoyé sur le numéro associé.' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Valider le code OTP envoyé par SMS' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ status: 201, description: 'OTP validé, renvoie un jeton temporaire.' })
  async verifyOtp(@Body() body: VerifyOtpDto) {
    return this.authService.verifyOtp(body);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Réinitialiser le mot de passe via le jeton temporaire' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé avec succès.' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }
}
