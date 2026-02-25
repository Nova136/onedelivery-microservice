import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ListProductsRequestDto, ListProductsResponseDto } from '../core/dto';
import { IListProductsResponse } from '../core/interface';

@ApiTags('Products')
@Controller('logistics')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @ApiOperation({ summary: 'List products with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Paginated list of products', type: ListProductsResponseDto })
  async listProducts(@Query() query: ListProductsRequestDto): Promise<IListProductsResponse> {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const result = await this.productsService.findPaginated(page, limit);
    const response: IListProductsResponse = {
      data: result.data.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sku: p.sku,
        price: Number(p.price),
        active: p.active,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
    return response;
  }
}
