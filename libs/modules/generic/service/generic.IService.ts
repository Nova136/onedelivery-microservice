import { PageRequest } from "../dto/page.request";
import { PageResponse } from "../dto/page.response";

export interface IBaseService<T> {

  getAll(options: PageRequest): Promise<PageResponse<T>>;
  getOne(id: any): Promise<T>;
  getMany(ids : any[]) : Promise<T[]>;
  update(id: any, entity: T): Promise<any>;
  create(entity: T): Promise<T>;
  hardDelete(id: any);
  softDelete(id: any)
}