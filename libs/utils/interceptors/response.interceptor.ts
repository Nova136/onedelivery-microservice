import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { ResponseStatus } from './response.dto';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  public constructor(private readonly reflector: Reflector) {}

  public async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Retrieve the headers from environment variables
    const csp = process.env.CONTENT_SECURITY_POLICY;

    // Set the headers before the response is sent
    response.setHeader('Content-Security-Policy', csp || "default-src 'self';");
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    const body = await firstValueFrom(next.handle());
    let responseData = body;

    if (!!context.switchToHttp()?.getResponse()?.status) {
      responseData = {
        msg: ResponseStatus.Success,
        data: body,
      };
      context.switchToHttp()?.getResponse()?.status(HttpStatus.OK);
    }

    if (context['contextType'] === 'rpc') {
      return of(responseData || '');
    }

    return of(
      responseData || {
        msg: ResponseStatus.Fail,
        data: [],
      },
    );
  }
}
