import { PageRequest } from './page.request';

export class PageResponse<E> extends PageRequest {
  data: E[];
  totalRecords: number;
  totalPages: number;

  constructor(data: E[], pageRequest: PageRequest, totalRecords?: number) {
    super(pageRequest);
    this.data = data;
    this.totalRecords = totalRecords;
    this.totalPages = Math.ceil(totalRecords / pageRequest.limit);
  }
}
