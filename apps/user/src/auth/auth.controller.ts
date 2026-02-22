import { Body, Controller, Get, Post, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser, type JwtPayload } from '@libs/utils/decorators/get-user.decorator';
import { Roles } from '@libs/utils/decorators/roles.decorator';
import { AuthService } from './auth.service';
import { AllowUnauthorizedRequest } from '@libs/utils/decorators/allow.unauthorized.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
  @ApiProperty({ example: 'secret123', minLength: 1 })
  password!: string;
  @ApiProperty({ enum: ['Admin', 'User'], required: false })
  role?: 'Admin' | 'User';
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
  @ApiProperty({ example: 'secret123', minLength: 1 })
  password!: string;
}

@ApiTags('Auth')
@Controller('user')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

@AllowUnauthorizedRequest()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User registered' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async register(@Body() dto: RegisterDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('email and password are required');
    }
    const role = dto.role === 'Admin' ? 'Admin' : 'User';
    return this.authService.register(dto.email, dto.password, role);
  }

  @AllowUnauthorizedRequest()
  @Post('login')
  @ApiOperation({ summary: 'Login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Returns access token' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async login(@Body() dto: LoginDto) {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('email and password are required');
    }
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  me(@GetUser() user: JwtPayload) {
    return { userId: user.sub, email: user.email, role: user.role };
  }

  @Roles('Admin')
  @Get('admin-only')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin-only endpoint' })
  @ApiResponse({ status: 200, description: 'Admin access granted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  adminOnly() {
    return { message: 'Admin access granted' };
  }
}
