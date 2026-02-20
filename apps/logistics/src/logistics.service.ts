import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveryTracking } from './entities/delivery-tracking.entity';

@Injectable()
export class LogisticsService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(DeliveryTracking)
    private readonly trackingRepo: Repository<DeliveryTracking>,
  ) {}

  async trackByOrderId(orderId: string) {
    return this.deliveryRepo.findOne({
      where: { orderId },
      relations: ['tracking'],
    });
  }

  async createDelivery(orderId: string) {
    const delivery = this.deliveryRepo.create({
      orderId,
      status: 'PENDING',
    });
    return this.deliveryRepo.save(delivery);
  }

  async updateDelivery(orderId: string, status: string, location?: { lat: number; lng: number }) {
    const delivery = await this.deliveryRepo.findOne({ where: { orderId } });
    if (!delivery) return null;
    delivery.status = status;
    await this.deliveryRepo.save(delivery);
    if (location) {
      const tracking = this.trackingRepo.create({
        deliveryId: delivery.id,
        lat: location.lat,
        lng: location.lng,
      });
      await this.trackingRepo.save(tracking);
    }
    return this.deliveryRepo.findOne({
      where: { id: delivery.id },
      relations: ['tracking'],
    });
  }
}
