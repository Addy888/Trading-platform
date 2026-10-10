import { AccountSummaryDto } from '../dto/account-summary.dto';
import { ConnectionStatusDto } from '../dto/connection-status.dto';

/**
 * Credentials required for broker authentication
 */
export interface BrokerCredentials {
  clientId: string;
  password: string;
  apiKey: string;
  totpSecret?: string;
}

/**
 * Session information after successful authentication
 */
export interface BrokerSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  metadata?: any;
}

/**
 * Broker profile information
 */
export interface BrokerProfile {
  clientId: string;
  name?: string;
  email?: string;
  exchanges?: string[];
  metadata?: any;
}

/**
 * Provider-neutral broker adapter interface
 * Each broker (Angel One, Zerodha, etc.) implements this interface
 */
export interface BrokerProvider {
  /**
   * Authenticate with the broker
   * @param credentials - Broker credentials
   * @returns Session information
   */
  connect(credentials: BrokerCredentials): Promise<BrokerSession>;

  /**
   * Check if the current session is valid
   * @param sessionToken - Session token to validate
   * @returns true if session is valid
   */
  isSessionValid(sessionToken: string): Promise<boolean>;

  /**
   * Get broker profile information
   * @param sessionToken - Valid session token
   * @returns Broker profile
   */
  getProfile(sessionToken: string): Promise<BrokerProfile>;

  /**
   * Get account summary (funds, margin, etc.)
   * @param sessionToken - Valid session token
   * @returns Account summary
   */
  getAccountSummary(sessionToken: string): Promise<AccountSummaryDto>;

  /**
   * Disconnect/logout from broker
   * @param sessionToken - Session token to invalidate
   */
  disconnect(sessionToken: string): Promise<void>;
}
