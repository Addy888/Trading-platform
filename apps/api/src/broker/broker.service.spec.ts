import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { BrokerService } from './broker.service';
import { BrokerConnectionService } from './broker-connection.service';
import { AngelOneAdapter } from './providers/angelone/angelone.adapter';
import { BrokerStatus } from './dto/connection-status.dto';
import { BrokerCredentials, BrokerSession } from './interfaces/broker-provider.interface';

describe('BrokerService', () => {
  let service: BrokerService;
  let connectionService: BrokerConnectionService;
  let angelOneAdapter: AngelOneAdapter;

  const mockUserId = 'user-123';
  const mockProvider = 'ANGELONE';

  const mockSession: BrokerSession = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    metadata: {},
  };

  const mockCredentials: BrokerCredentials = {
    clientId: 'TEST123',
    password: 'password123',
    apiKey: 'api-key-123',
    totpSecret: 'JBSWY3DPEHPK3PXP',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerService,
        {
          provide: BrokerConnectionService,
          useValue: {
            getConnectionStatus: jest.fn(),
            saveConnection: jest.fn(),
            getSessionToken: jest.fn(),
            updateConnectionStatus: jest.fn(),
            deleteConnection: jest.fn(),
          },
        },
        {
          provide: AngelOneAdapter,
          useValue: {
            connect: jest.fn(),
            getProfile: jest.fn(),
            isSessionValid: jest.fn(),
            getAccountSummary: jest.fn(),
            disconnect: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BrokerService>(BrokerService);
    connectionService = module.get<BrokerConnectionService>(BrokerConnectionService);
    angelOneAdapter = module.get<AngelOneAdapter>(AngelOneAdapter);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConnectionStatus', () => {
    it('should return NOT_CONFIGURED when no connection exists', async () => {
      jest.spyOn(connectionService, 'getConnectionStatus').mockResolvedValue({
        provider: mockProvider,
        status: BrokerStatus.NOT_CONFIGURED,
      });

      const result = await service.getConnectionStatus(mockUserId);

      expect(result.status).toBe(BrokerStatus.NOT_CONFIGURED);
      // Default provider is 'ANGELONE'
      expect(connectionService.getConnectionStatus).toHaveBeenCalledWith(mockUserId, 'ANGELONE');
    });

    it('should return CONNECTED when connection exists and valid', async () => {
      jest.spyOn(connectionService, 'getConnectionStatus').mockResolvedValue({
        provider: mockProvider,
        status: BrokerStatus.CONNECTED,
        lastConnectedAt: new Date(),
      });

      const result = await service.getConnectionStatus(mockUserId, mockProvider);

      expect(result.status).toBe(BrokerStatus.CONNECTED);
      expect(result.lastConnectedAt).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should successfully connect to broker', async () => {
      jest.spyOn(angelOneAdapter, 'connect').mockResolvedValue(mockSession);
      jest.spyOn(angelOneAdapter, 'getProfile').mockResolvedValue({
        clientId: 'TEST123',
        name: 'Test User',
        email: 'test@example.com',
      });
      jest.spyOn(connectionService, 'saveConnection').mockResolvedValue();

      const result = await service.connect(mockUserId, mockCredentials, mockProvider);

      expect(result.status).toBe(BrokerStatus.CONNECTED);
      expect(angelOneAdapter.connect).toHaveBeenCalledWith(mockCredentials);
      expect(connectionService.saveConnection).toHaveBeenCalled();
    });

    it('should handle authentication failure', async () => {
      const authError = new HttpException(
        {
          error: 'BROKER_AUTH_FAILED',
          message: 'Authentication failed',
        },
        HttpStatus.UNAUTHORIZED,
      );

      jest.spyOn(angelOneAdapter, 'connect').mockRejectedValue(authError);
      jest.spyOn(connectionService, 'updateConnectionStatus').mockResolvedValue();

      await expect(service.connect(mockUserId, mockCredentials, mockProvider)).rejects.toThrow(authError);

      expect(connectionService.updateConnectionStatus).toHaveBeenCalledWith(
        mockUserId,
        mockProvider,
        BrokerStatus.ERROR,
        'Authentication failed',
        undefined,
      );
    });

    it('should handle network timeout', async () => {
      const timeoutError = new HttpException(
        {
          error: 'BROKER_CONNECTION_FAILED',
          message: 'Failed to connect to broker',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );

      jest.spyOn(angelOneAdapter, 'connect').mockRejectedValue(timeoutError);

      await expect(service.connect(mockUserId, mockCredentials, mockProvider)).rejects.toThrow(timeoutError);
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect from broker', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('mock-token');
      jest.spyOn(angelOneAdapter, 'disconnect').mockResolvedValue();
      jest.spyOn(connectionService, 'deleteConnection').mockResolvedValue();

      await service.disconnect(mockUserId, mockProvider);

      expect(angelOneAdapter.disconnect).toHaveBeenCalledWith('mock-token');
      expect(connectionService.deleteConnection).toHaveBeenCalledWith(mockUserId, mockProvider);
    });

    it('should delete connection even if broker disconnect fails', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('mock-token');
      jest.spyOn(angelOneAdapter, 'disconnect').mockRejectedValue(new Error('API error'));
      jest.spyOn(connectionService, 'deleteConnection').mockResolvedValue();

      await service.disconnect(mockUserId, mockProvider);

      expect(connectionService.deleteConnection).toHaveBeenCalled();
    });
  });

  describe('getAccountSummary', () => {
    it('should return account summary when session is valid', async () => {
      const mockSummary = {
        provider: mockProvider,
        clientId: 'TEST123',
        name: 'Test User',
        availableFunds: 100000,
        usedMargin: 5000,
      };

      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('mock-token');
      jest.spyOn(angelOneAdapter, 'isSessionValid').mockResolvedValue(true);
      jest.spyOn(angelOneAdapter, 'getAccountSummary').mockResolvedValue(mockSummary);

      const result = await service.getAccountSummary(mockUserId, mockProvider);

      expect(result).toEqual(mockSummary);
      expect(angelOneAdapter.getAccountSummary).toHaveBeenCalledWith('mock-token');
    });

    it('should throw when session is expired', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('expired-token');
      jest.spyOn(angelOneAdapter, 'isSessionValid').mockResolvedValue(false);
      jest.spyOn(connectionService, 'updateConnectionStatus').mockResolvedValue();

      await expect(service.getAccountSummary(mockUserId, mockProvider)).rejects.toThrow(
        new HttpException(
          {
            error: 'BROKER_SESSION_EXPIRED',
            message: 'Session expired, please reconnect',
          },
          HttpStatus.UNAUTHORIZED,
        ),
      );

      expect(connectionService.updateConnectionStatus).toHaveBeenCalledWith(
        mockUserId,
        mockProvider,
        BrokerStatus.EXPIRED,
        'Session expired',
      );
    });
  });

  describe('validateSession', () => {
    it('should return true for valid session', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('valid-token');
      jest.spyOn(angelOneAdapter, 'isSessionValid').mockResolvedValue(true);

      const result = await service.validateSession(mockUserId, mockProvider);

      expect(result).toBe(true);
    });

    it('should return false for invalid session', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockResolvedValue('invalid-token');
      jest.spyOn(angelOneAdapter, 'isSessionValid').mockResolvedValue(false);

      const result = await service.validateSession(mockUserId, mockProvider);

      expect(result).toBe(false);
    });

    it('should return false when connection does not exist', async () => {
      jest.spyOn(connectionService, 'getSessionToken').mockRejectedValue(new Error('Not found'));

      const result = await service.validateSession(mockUserId, mockProvider);

      expect(result).toBe(false);
    });
  });
});
