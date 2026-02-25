import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
  @ApiProperty({ example: 'secret123', minLength: 1 })
  password!: string;
  @ApiProperty({ enum: ['Admin', 'User'], required: false })
  role?: 'Admin' | 'User';
}
