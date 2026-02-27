import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { decode } from 'jsonwebtoken';
@Injectable()
export class ClientAuthGuard implements CanActivate {
  exlcudeRequests = [
    '/login',
    '/signup',
    '/api',
    '/health',
    '/user/api',
    '/order/api',
    '/logistics/api',
    '/payment/api',
    '/audit/api',
    '/incident/api',
    '/api-docs',
    '/create',
    '/health-check',
    '/health-check',
    '/user/health-check',
    '/logistics/health-check',
    '/order/health-check',
    '/payment/health-check',
    '/audit/health-check',
    '/incident/health-check'
  ];
  public constructor() {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.getArgByIndex(0);
      if (this.exlcudeRequests.includes(request.url.split('?')[0])) {
        return true;
      }
      // Accept token from custom header or Authorization: Bearer <token>
      let token = request.headers['token'];
      if (!token && request.headers['authorization']) {
        const auth = request.headers['authorization'] as string;
        if (auth.startsWith('Bearer ')) {
          token = auth.slice(7);
        }
      }
      if (!token) {
        throw new UnauthorizedException();
      }
      const tokenDecoded = decode(token) as { sub?: string; userId?: string } | null;
      if (!tokenDecoded) {
        throw new UnauthorizedException();
      }
      // JWT from user service uses 'sub' for user id; support both
      request.userId = tokenDecoded.sub ?? tokenDecoded.userId;
      request.user = tokenDecoded; // for RolesGuard if used

      return true;
    } catch (e) {
      return false;
    }
  }
}
