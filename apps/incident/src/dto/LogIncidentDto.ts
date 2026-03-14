import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IncidentType } from '../constant/constant';

export class LogIncidentDto {
  @ApiProperty({ 
    enum: IncidentType,
    example: IncidentType.LATE_DELIVERY, 
    description: 'The category of the delivery incident' 
  })
  @IsEnum(IncidentType) // Ensures only enum values are accepted
  type: IncidentType;

  @ApiProperty({ 
    example: 'Customer reported fries were missing from the bag.', 
    description: 'A detailed description of the support request' 
  })
  @IsString()
  @IsNotEmpty()
  summary: string;

@ApiProperty({ 
    example: '550e8400-e29b-41d4-a716-446655440000', // Example valid UUID
    required: false, 
    format: 'uuid', // Tells Swagger UI to expect a UUID format
    description: 'The unique identifier of the order' 
  })
  @IsOptional()
  @IsUUID('4') // Validates that the input is a valid UUID (v4)
  orderId?: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    format: 'uuid',
    description: 'The unique identifier of the user who reported the incident',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;
}
