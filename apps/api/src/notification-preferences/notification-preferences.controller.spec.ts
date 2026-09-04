import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesController - Security', () => {
  let controller: NotificationPreferencesController;
  let service: NotificationPreferencesService;

  const mockService = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const user1Preferences = {
    id: 'pref-1',
    userId: 'user-1',
    inAppEnabled: true,
    emailEnabled: false,
    tradeNotifications: true,
    accountNotifications: true,
    challengeNotifications: true,
    orderNotifications: true,
    systemNotifications: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        {
          provide: NotificationPreferencesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(
      NotificationPreferencesController,
    );
    service = module.get<NotificationPreferencesService>(
      NotificationPreferencesService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return user\'s own preferences', async () => {
      mockService.getPreferences.mockResolvedValue(user1Preferences);

      const result = await controller.getPreferences('user-1');

      expect(result).toEqual(user1Preferences);
      expect(service.getPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updatePreferences', () => {
    it('should allow user to update their own preferences', async () => {
      const updateDto = {
        tradeNotifications: false,
        emailEnabled: true,
      };

      const updated = {
        ...user1Preferences,
        ...updateDto,
      };

      mockService.updatePreferences.mockResolvedValue(updated);

      const result = await controller.updatePreferences('user-1', updateDto);

      expect(result).toEqual(updated);
      expect(service.updatePreferences).toHaveBeenCalledWith('user-1', updateDto);
    });

    it('should only update allowed fields', async () => {
      const updateDto = {
        tradeNotifications: false,
      };

      mockService.updatePreferences.mockResolvedValue({
        ...user1Preferences,
        tradeNotifications: false,
      });

      const result = await controller.updatePreferences('user-1', updateDto);

      // userId should not be changeable
      expect(result.userId).toBe('user-1');
    });
  });
});
