import { IProductItem } from './product-item.interface';

export interface IListProductsResponsePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface IListProductsResponse {
  data: IProductItem[];
  pagination: IListProductsResponsePagination;
}
