import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    logoutAllOtherSessions: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const expected = {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.register.mockResolvedValue(expected);

      const result = await controller.register(registerDto);

      expect(result).toEqual(expected);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    it('should login a user with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123',
      };

      const expected = {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expected);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('changePassword', () => {
    it('should change password with valid current password', async () => {
      const changePasswordDto = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      };

      const expected = {
        message: 'Password changed successfully. Please log in again.',
      };

      mockAuthService.changePassword.mockResolvedValue(expected);

      const result = await controller.changePassword(mockUser, changePasswordDto);

      expect(result).toEqual(expected);
      expect(authService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
        changePasswordDto.confirmPassword,
      );
    });

    it('should reject password change with incorrect current password', async () => {
      const changePasswordDto = {
        currentPassword: 'WrongPassword',
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      };

      mockAuthService.changePassword.mockRejectedValue(
        new UnauthorizedException('Current password is incorrect'),
      );

      await expect(
        controller.changePassword(mockUser, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject password change when passwords do not match', async () => {
      const changePasswordDto = {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
        confirmPassword: 'DifferentPassword123',
      };

      mockAuthService.changePassword.mockRejectedValue(
        new BadRequestException('New passwords do not match'),
      );

      await expect(
        controller.changePassword(mockUser, changePasswordDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout', () => {
    it('should logout user and invalidate refresh tokens', async () => {
      const expected = { message: 'Logged out successfully' };

      mockAuthService.logout.mockResolvedValue(expected);

      const result = await controller.logout(mockUser);

      expect(result).toEqual(expected);
      expect(authService.logout).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('logoutAllOtherSessions', () => {
    it('should logout all other sessions except current', async () => {
      const refreshToken = 'current-refresh-token';
      const expected = {
        message: 'Logged out from all other sessions successfully',
      };

      mockAuthService.logoutAllOtherSessions.mockResolvedValue(expected);

      const result = await controller.logoutAllOtherSessions(mockUser, refreshToken);

      expect(result).toEqual(expected);
      expect(authService.logoutAllOtherSessions).toHaveBeenCalledWith(
        mockUser.id,
        refreshToken,
      );
    });
  });
});
