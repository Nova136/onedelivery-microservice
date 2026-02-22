import { SortDirectionEnum } from "../enum/sort.direction.enum";

export class PageRequest{
  page: number;
  limit: number;
  sortDirection: SortDirectionEnum;
  sortField: string;

  constructor(pageRequest: PageRequest){
    this.page = pageRequest.page || 1;
    this.limit = pageRequest.limit;
    this.sortDirection = pageRequest.sortDirection || SortDirectionEnum.ASC;
    this.sortField = pageRequest.sortField;
  }
}
