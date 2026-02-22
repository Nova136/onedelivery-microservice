import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decode, JwtPayload, sign } from 'jsonwebtoken';

export interface IDecodeTokenPayload {
  token: string;
}
export interface ICreateTokenPayload {
  userId: number;
}
export interface ITokenResponse {
  accessToken: string;
  refreshToken: string;
}
export interface IDecodeResponse {
  userId: number;
}

@Injectable()
export class JwtTokenService {
  constructor(private configService: ConfigService) {}

  public createToken(userId: string): ITokenResponse {
    const accessExp = this.configService.get('ACCESS_EXP');
    const refreshExp = this.configService.get('REFRESH_EXP');
    const secretKey = this.configService.get('APP_SECRET');
    const accessToken = sign({ userId }, secretKey, { expiresIn: accessExp });
    const refreshToken = sign({ userId }, secretKey, { expiresIn: refreshExp });
    return {
      accessToken,
      refreshToken,
    };
  }
  public createTempTokenForValidatedCardNumber(userId: string,validated:boolean): ITokenResponse {
    const accessExp = this.configService.get('TEMP_ACCESS_EXP') ?? '3h';
    const refreshExp = this.configService.get('REFRESH_EXP');
    const secretKey = this.configService.get('APP_SECRET');
    const accessToken = sign({ userId, "isTempToken": true,"hasValidatedCardNumber":validated }, secretKey, { expiresIn: accessExp });
    const refreshToken = sign({ userId, "isTempToken": true ,"hasValidatedCardNumber":validated }, secretKey, { expiresIn: refreshExp });
    return {
      accessToken,
      refreshToken,
    };
  }
  public createTempToken(userId: string): ITokenResponse {
    const accessExp = this.configService.get('TEMP_ACCESS_EXP') ?? '3h';
    const refreshExp = this.configService.get('REFRESH_EXP');
    const secretKey = this.configService.get('APP_SECRET');
    const accessToken = sign({ userId, "isTempToken": true }, secretKey, { expiresIn: accessExp });
    const refreshToken = sign({ userId, "isTempToken": true }, secretKey, { expiresIn: refreshExp });
    return {
      accessToken,
      refreshToken,
    };
  }

  public async decodeToken(
    token: string,
  ): Promise<string | JwtPayload | IDecodeResponse> {
    return decode(token);
  }
}
