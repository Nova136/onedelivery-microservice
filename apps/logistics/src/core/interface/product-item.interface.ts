export interface IProductItem {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
