import { ApiProperty } from '@nestjs/swagger';

/** Single product in list response */
export class ProductItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty()
  sku!: string;
  @ApiProperty({ example: 9.99 })
  price!: number;
  @ApiProperty()
  active!: boolean;
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt!: string;
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  updatedAt!: string;
}
