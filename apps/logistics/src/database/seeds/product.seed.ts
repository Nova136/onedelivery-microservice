
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';
import { Product } from '../entities/product.entity';

export default class ProductSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Product);

    // Avoid duplicating seed data if it already exists
    const existing = await repo.count();
    if (existing > 0) {
      return;
    }

    const products: Partial<Product>[] = [
      {
        name: 'Express Delivery',
        description: 'Same-day delivery for urgent orders',
        sku: 'DELIV-EXPRESS',
        price: 12.99,
        active: true,
      },
      {
        name: 'Standard Delivery',
        description: '2–3 business days',
        sku: 'DELIV-STD',
        price: 5.99,
        active: true,
      },
      {
        name: 'Economy Shipping',
        description: '5–7 business days',
        sku: 'DELIV-ECON',
        price: 2.99,
        active: true,
      },
    ];

    await repo.insert(products);
  }
}