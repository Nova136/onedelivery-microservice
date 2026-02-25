import { ApiProperty } from '@nestjs/swagger';

/** Request body for listing products (paginated) */
export class ListProductsRequestDto {
  @ApiProperty({ required: false, default: 1, description: 'Page number' })
  page?: number;

  @ApiProperty({ required: false, default: 20, description: 'Items per page' })
  limit?: number;
}
