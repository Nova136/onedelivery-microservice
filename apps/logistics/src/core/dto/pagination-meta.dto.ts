import { ApiProperty } from '@nestjs/swagger';

/** Pagination metadata in list response */
export class PaginationMetaDto {
  @ApiProperty()
  page!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  total!: number;
  @ApiProperty()
  totalPages!: number;
}
