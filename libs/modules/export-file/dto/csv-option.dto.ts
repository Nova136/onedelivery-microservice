import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, Min } from 'class-validator';
export class CSVOptionDto {
  @ApiProperty()
  @IsNotEmpty()
  data: object[];

  @ApiPropertyOptional()
  @IsOptional()
  fieldSeparator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  quoteStrings?: string;

  @ApiPropertyOptional()
  @IsOptional()
  decimalSeparator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  showLabels?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  showTitle?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  useKeysAsHeaders?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Min(0)
  dataLimit?: number;
}
