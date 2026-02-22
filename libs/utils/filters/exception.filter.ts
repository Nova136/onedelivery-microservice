import { ILoggerService } from '@libs/modules/logger/adapter';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Request, Response } from 'express';
import { ResponseMessage, ResponseObj, ResponseStatus } from '../interceptors/response.dto';

@Catch(Error)
@Catch(HttpException)
@Catch(RpcException)
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: ILoggerService) {}
  
  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const contextHttp = host.switchToHttp();
    const response = contextHttp.getResponse<Response>() as any;
    const request = ctx.getRequest<Request>() as any;
    let statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let stack = exception.stack.split('\n').reduce(function (obj, str, index) {
      if (str) {
        let stackIndex = 'stack' + index;
        obj[stackIndex] = str.indexOf('/dist/apps') > 0 ? str : str.replace(/\(.*?\)/g, '');
      }
      return obj;
    }, {});

    let errorDetail: any = {
      url: request.method + ' ' + request.url + ' (statusCode ' + statusCode + ')',
      body: request.body,
      headers: {
        userId: request?.headers?.userid,
        owner: request?.headers?.owner,
        apiversion: request?.headers?.apiversion,
        token: request?.headers?.token,
        'user-agent': request?.headers['user-agent'],
        'content-type': request?.headers['content-type'],
      },
      msg: response?.msg,
      stack
    };

    // Automatically log the exception to log file
    this.logger.error(exception.message, errorDetail);

    let message = 'Internal server error';
    let msg = ResponseStatus.Fail;

    switch (statusCode) {
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        message = ResponseMessage.Unauthorized;
        msg = ResponseStatus.Unauthorized;
        break;
      case HttpStatus.BAD_REQUEST:
        message = exception["response"]?.ExceptionMessage || exception.message;
        break;
      default:
        break;
    }

    const resultResponse: ResponseObj = {
      msg,
      data: message,
    };
    response.status(HttpStatus.OK).json(resultResponse);
  }

  
}