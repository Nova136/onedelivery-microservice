import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { Role } from '../database/entities/role.enum';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockUserRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      const saved = { id: 'user-1', email: 'test@example.com', role: Role.User };
      mockUserRepo.create.mockReturnValue(saved);
      mockUserRepo.save.mockResolvedValue(saved);

      const result = await service.register('test@example.com', 'password123');

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(result).toEqual({ id: 'user-1', email: 'test@example.com', role: Role.User });
    });

    it('should normalize email to lowercase', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      const saved = { id: 'user-1', email: 'test@example.com', role: Role.User };
      mockUserRepo.create.mockReturnValue(saved);
      mockUserRepo.save.mockResolvedValue(saved);

      await service.register('  TEST@EXAMPLE.COM  ', 'password');

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('should throw ConflictException if email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.register('test@example.com', 'password')).rejects.toThrow(ConflictException);
    });

    it('should default to Role.User when no role provided', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      const saved = { id: 'user-1', email: 'test@example.com', role: Role.User };
      mockUserRepo.create.mockReturnValue(saved);
      mockUserRepo.save.mockResolvedValue(saved);

      await service.register('test@example.com', 'password');

      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.User }),
      );
    });
  });

  describe('login', () => {
    it('should return access token and userId on valid credentials', async () => {
      const user = { id: 'user-1', email: 'test@example.com', passwordHash: 'hashed', role: Role.User };
      mockUserRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('test@example.com', 'password');

      expect(result).toEqual({
        access_token: 'mock-token',
        userId: 'user-1',
        role: Role.User,
      });
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.login('unknown@example.com', 'password')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      const user = { id: 'user-1', email: 'test@example.com', passwordHash: 'hashed', role: Role.User };
      mockUserRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('test@example.com', 'wrong-password')).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize email before lookup', async () => {
      const user = { id: 'user-1', email: 'test@example.com', passwordHash: 'hashed', role: Role.User };
      mockUserRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('  TEST@EXAMPLE.COM  ', 'password');

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });
  });
});
