import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
// import crypto from 'crypto';
const { randomInt } = require('crypto');
const unzipper = require('unzipper');
const moment = require('moment');
const momentTimezone = require('moment-timezone');
var cronParser = require('cron-parser');
const crypto = require('crypto');
const util = require('util');

@Injectable()
export class CommonService {
  numbers = '1234567890';
  alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  small_alphabets = 'abcdefghijklmnopqrstuvwxyz';

 
  constructor(private configService: ConfigService) {
   
  }
  //FXXXX001X
  public maskFin(fin: string): string {
    return fin.substring(0, 1) + 'xxxx' + fin.substring(5);
  }
  //65XXXXX080
  public maskContactNo(countryCode: string, contactNo: string): string {
    if (contactNo && contactNo.length > 3) {
      return countryCode + 'X'.repeat(contactNo.length - 3) + contactNo.substring(contactNo.length - 3);
    } else {
      return countryCode + contactNo;
    }
  }
  //XXXX3580
  public maskBuddyContactNo(contactNo: string): string {
    if (contactNo && contactNo.length > 3) {
      return 'XXXX' + contactNo.substring(4);
    } else {
      return contactNo;
    }
  }


  public async GenerateToken(): Promise<string> {
    var characters = this.numbers;
    characters += this.alphabets + this.small_alphabets + this.numbers;
    var length = 32;
    var token = '';
    for (var i = 0; i < length; i++) {
      var character = '';
      do {
        var index: number = await this.RandomIntFromRNG(0, characters.length);
        var array = characters.split('').join('');
        character = array[index];
      } while (token.indexOf(character) !== -1);
      token += character;
    }
    return token;
  }

 
  public async RandomIntFromRNG(min: number, max: number): Promise<number> {
    // const crypto = require('crypto');
    // Generate four random bytes
    // const buf = crypto.randomBytes(4);

    // Convert the bytes to a UInt32
    // var hex = buf.toString('hex');
    // var scale = parseInt(hex, 16);
    // UInt32 scale = BitConverter.ToUInt32(four_bytes, 0);
    var random = randomInt(min, max);
    return random;
    // And use that to pick a random number >= min and < max
    // return (min + (max - min) * (scale / (Number.MAX_SAFE_INTEGER + 1.0)));
  }
 
 
 

  public isValidUUID(uuid: string): boolean {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  }
  // Method to check if the value is a string
  public isString(value: any): boolean {
    return typeof value === 'string';
  }

  // Method to check if the value is a number
  public isNumber(value: any): boolean {
    return !isNaN(Number(value));
  }

  public getRandomSecureDelay(min, max): Promise<number> {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(4, (err, buffer) => {
        if (err) {
          return reject(err);
        }
        const randomValue = buffer.readUInt32BE(0) / 0xffffffff; // Normalize to [0, 1)
        const delay = Math.floor(randomValue * (max - min + 1) + min);
        resolve(delay);
      });
    });
  }
  public async sendViaRMQ<T>(
    client: ClientProxy,
    messagePattern: any,
    data: any,
    maxRetries: number = 5,
  ): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await firstValueFrom(client.send<T>(messagePattern, data));
      } catch (e) {
        attempt++;
        console.error(`Attempt ${attempt} failed. Retrying...`);
        if (attempt >= maxRetries) {
          console.log(
            `Max retries reached. Failed to send ${JSON.stringify(
              messagePattern,
            )} with message: ${e.message}`,
          );
        }
        const delay = await this.getRandomSecureDelay(1000, 3000);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    console.log('Unexpected error. This should not happen.');
  }


}
