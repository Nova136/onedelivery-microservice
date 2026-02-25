import { ApiProperty } from '@nestjs/swagger';

/** Single item when creating an order */
export class OrderItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Product ID' })
  productId!: string;
  @ApiProperty({ example: 1, minimum: 1 })
  quantity!: number;
  @ApiProperty({ example: 9.99 })
  price!: number;
}
