export enum ResponseStatus {
  Fail = 0,
  Success = 1,
  Unauthorized = 3,
}

export enum ResponseMessage {
  Unauthorized = 'Unauthorized',
}

export class ResponseObj {
  msg: ResponseStatus;
  data: any;
}
