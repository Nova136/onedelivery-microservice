import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { decode } from 'jsonwebtoken';
@Injectable()
export class ClientAuthGuard implements CanActivate {
  exlcudeRequests = [
    '/login',
    '/signup',
    '/api',
    '/health',
    '/api-docs',
    '/create',
    '/health-check',
    '/health-check',
    '/user/health-check',
    '/logistics/health-check',
    '/order/health-check',
    '/payment/health-check',
    '/audit/health-check'
  ];
  public constructor() {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.getArgByIndex(0);
      if (this.exlcudeRequests.includes(request.url.split('?')[0])) {
        return true;
      }
      const Owner = request.headers['owner'];
      //Check if Owner is null or empty
      // if (!Owner) {
      //   throw new UnauthorizedException();
      // }
      let tokenDecoded;
      const token = request.headers['token'];

      if (!token) {
        throw new UnauthorizedException();
      }
      tokenDecoded = decode(token);
      // Add user id from decoded token into request.userId
      request.userId = tokenDecoded?.userId;

      return true;
    } catch (e) {
      return false;
    }
  }
}
