import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SigninDto {
  @ApiProperty({ example: 'mahjoub2003@gmail.com' })
  @IsEmail()
  readonly email: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  readonly password: string;
}
