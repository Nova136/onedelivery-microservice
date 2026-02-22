import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, type Role } from '../entities/user.entity';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    role: Role = 'User',
  ): Promise<{ id: string; email: string; role: Role }> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email: normalized } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = this.userRepo.create({ email: normalized, passwordHash, role });
    const saved = await this.userRepo.save(user);
    return { id: saved.id, email: saved.email, role: saved.role };
  }

  async login(email: string, password: string): Promise<{ access_token: string; userId: string; role: Role }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalized } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload);
    return { access_token, userId: user.id, role: user.role };
  }
}
