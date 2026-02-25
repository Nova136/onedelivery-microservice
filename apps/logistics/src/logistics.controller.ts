import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { LogisticsService } from './logistics.service';
import { TrackDeliveryDto, UpdateDeliveryDto } from './core/dto';

@ApiTags('Logistics')
@Controller()
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @MessagePattern({ cmd: 'logistics.track' })
  async trackDelivery(@Payload() data: TrackDeliveryDto) {
    const delivery = await this.logisticsService.trackByOrderId(data.orderId);
    if (!delivery)
      return {
        orderId: data.orderId,
        found: false,
        message: 'Logistics microservice: no delivery found',
      };
    return {
      orderId: delivery.orderId,
      status: delivery.status,
      estimatedArrival: delivery.estimatedArrival?.toISOString() ?? null,
      tracking: delivery.tracking,
      message: 'Logistics microservice: tracking info',
    };
  }

  @MessagePattern({ cmd: 'logistics.update' })
  async updateDelivery(@Payload() data: UpdateDeliveryDto) {
    const delivery = await this.logisticsService.updateDelivery(
      data.orderId,
      data.status,
      data.location,
    );
    return {
      orderId: data.orderId,
      status: delivery?.status ?? data.status,
      message: 'Logistics microservice: delivery updated',
    };
  }

  @MessagePattern({ cmd: 'logistics.predictDelay' })
  async predictDelay(@Payload() data: { orderId: string }) {
    const delivery = await this.logisticsService.trackByOrderId(data.orderId);
    return {
      orderId: data.orderId,
      delayMinutes: 0,
      reason: delivery ? 'On time' : 'No delivery record',
      message: 'Logistics microservice: delay prediction',
    };
  }
}
