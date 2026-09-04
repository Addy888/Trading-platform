import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WebSocket Authentication Service
 * 
 * Handles authentication of WebSocket connections using JWT.
 * 
 * SECURITY:
 * - Validates JWT tokens
 * - Extracts user identity from verified tokens
 * - Does NOT trust client-provided userId
 * - Rejects invalid or expired tokens
 * - Stores authenticated user data on socket
 */
@Injectable()
export class WebSocketAuthService {
  private readonly logger = new Logger(WebSocketAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticate a WebSocket connection
   * 
   * @param socket Socket connection to authenticate
   * @returns Authenticated user data
   * @throws UnauthorizedException if authentication fails
   */
  async authenticateSocket(socket: Socket): Promise<{
    userId: string;
    email: string;
    role: string;
  }> {
    try {
      // Extract token from handshake
      const token = this.extractToken(socket);
      
      if (!token) {
        throw new UnauthorizedException('No authentication token provided');
      }

      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Fetch user from database to verify existence and status
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('User account is inactive');
      }

      // Store authenticated user data on socket
      socket.data.userId = user.id;
      socket.data.email = user.email;
      socket.data.role = user.role;

      this.logger.log(`Socket authenticated: ${socket.id} - User: ${user.email} (${user.role})`);

      return {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
    } catch (error) {
      this.logger.error(`Socket authentication failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Extract JWT token from socket handshake
   * 
   * Supports multiple token locations:
   * - Authorization header: Bearer <token>
   * - Query parameter: token=<token>
   * - Auth object: auth.token
   */
  private extractToken(socket: Socket): string | null {
    // Try authorization header
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try query parameter
    const queryToken = socket.handshake.query.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    // Try auth object
    const authToken = socket.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    return null;
  }

  /**
   * Verify user ownership of a trading account
   * 
   * @param userId User ID
   * @param accountId Trading account ID
   * @returns true if user owns account, false otherwise
   */
  async verifyAccountOwnership(userId: string, accountId: string): Promise<boolean> {
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
      select: { id: true },
    });

    return !!account;
  }

  /**
   * Check if user has admin role
   * 
   * @param socket Socket connection
   * @returns true if user is admin
   */
  isAdmin(socket: Socket): boolean {
    return socket.data.role === 'ADMIN';
  }

  /**
   * Get authenticated user ID from socket
   * 
   * @param socket Socket connection
   * @returns User ID or null if not authenticated
   */
  getUserId(socket: Socket): string | null {
    return socket.data.userId || null;
  }
}
