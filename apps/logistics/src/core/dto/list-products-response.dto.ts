import { ApiProperty } from '@nestjs/swagger';
import { ProductItemDto } from './product-item.dto';
import { PaginationMetaDto } from './pagination-meta.dto';

/** Response shape for list products */
export class ListProductsResponseDto {
  @ApiProperty({ type: [ProductItemDto] })
  data!: ProductItemDto[];
  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMetaDto;
}
