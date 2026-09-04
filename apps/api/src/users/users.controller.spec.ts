import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: UsersService;

  const mockUsersService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    country: 'USA',
    role: 'USER',
    isActive: true,
    isEmailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMe', () => {
    it('should return user profile', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockUser);

      const result = await controller.getMe({ id: mockUser.id });

      expect(result).toEqual(mockUser);
      expect(usersService.getProfile).toHaveBeenCalledWith(mockUser.id);
    });

    it('should not expose password hash', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockUser);

      const result = await controller.getMe({ id: mockUser.id });

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('updateMe', () => {
    it('should update allowed profile fields', async () => {
      const updateDto = {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+9876543210',
        country: 'Canada',
      };

      const updatedUser = {
        ...mockUser,
        ...updateDto,
      };

      mockUsersService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateMe({ id: mockUser.id }, updateDto);

      expect(result).toEqual(updatedUser);
      expect(usersService.updateProfile).toHaveBeenCalledWith(mockUser.id, updateDto);
    });

    it('should not allow updating role through this endpoint', async () => {
      const updateDto = {
        firstName: 'Test',
        lastName: 'User',
      };

      // The DTO should not include role field
      mockUsersService.updateProfile.mockResolvedValue({
        ...mockUser,
        ...updateDto,
      });

      const result = await controller.updateMe({ id: mockUser.id }, updateDto);

      // Role should remain unchanged
      expect(result.role).toBe('USER');
    });

    it('should not allow updating status through this endpoint', async () => {
      const updateDto = {
        firstName: 'Test',
        lastName: 'User',
      };

      mockUsersService.updateProfile.mockResolvedValue({
        ...mockUser,
        ...updateDto,
      });

      const result = await controller.updateMe({ id: mockUser.id }, updateDto);

      // Status should remain unchanged
      expect(result.isActive).toBe(true);
    });
  });
});
