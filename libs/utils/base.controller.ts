import { BadRequestException, Controller, Get } from '@nestjs/common';
import { AllowUnauthorizedRequest } from './decorators/allow.unauthorized.decorator';
const { existsSync, readFileSync } = require('fs');
const path = require('path');

@Controller()
export class BaseController {
  @AllowUnauthorizedRequest()
  @Get('/version')
  public getServiceCurrentVersion() {
    const filePath = path.join(process.cwd(), 'version.txt');
    if (!existsSync(filePath)) {
      throw new BadRequestException('File is not exists');
    }

    const versionString = readFileSync(filePath, 'utf8');

    // return versionString;
    return versionString;
  }
}
