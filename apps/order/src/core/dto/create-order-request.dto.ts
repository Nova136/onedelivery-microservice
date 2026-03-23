import { ApiProperty } from '@nestjs/swagger';
import { OrderItemInputDto } from './order-item-input.dto';
import { PriorityOption } from '../../database/entities/order.enum';

/** HTTP request body for POST /order */
export class CreateOrderRequestDto {
  @ApiProperty({ type: [OrderItemInputDto], description: 'Order line items' })
  items!: OrderItemInputDto[];
  @ApiProperty({ example: '123 Main St, City' })
  deliveryAddress!: string;
  @ApiProperty({
    enum: PriorityOption,
    example: PriorityOption.STANDARD,
    description: 'Delivery priority option SKU (PRIO-EXPRESS, PRIO-STD, PRIO-ECON)',
    required: false,
    default: PriorityOption.STANDARD,
  })
  priorityOption?: PriorityOption;
}
