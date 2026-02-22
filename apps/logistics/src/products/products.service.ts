import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';

export interface PaginatedProductsResult {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findPaginated(page = 1, limit = 20): Promise<PaginatedProductsResult> {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
    const take = Math.min(100, Math.max(1, limit));

    const [data, total] = await this.productRepo.findAndCount({
      order: { name: 'ASC' },
      skip,
      take,
    });

    const totalPages = Math.ceil(total / take) || 1;
    const actualPage = Math.max(1, Math.min(page, totalPages));

    return {
      data,
      total,
      page: actualPage,
      limit: take,
      totalPages,
    };
  }
}
