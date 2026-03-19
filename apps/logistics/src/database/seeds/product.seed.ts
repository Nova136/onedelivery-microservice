
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
        name: 'Hainanese Chicken Rice',
        description: 'Fragrant poached chicken served with seasoned rice, chilli sauce and ginger paste',
        sku: 'FOOD-CHICKRICE',
        price: 5.50,
        active: true,
      },
      {
        name: 'Laksa',
        description: 'Spicy coconut curry noodle soup with prawns, fishcake and cockles',
        sku: 'FOOD-LAKSA',
        price: 6.50,
        active: true,
      },
      {
        name: 'Char Kway Teow',
        description: 'Stir-fried flat rice noodles with lap cheong, bean sprouts, cockles and egg',
        sku: 'FOOD-CKT',
        price: 5.00,
        active: true,
      },
      {
        name: 'Nasi Lemak',
        description: 'Coconut rice with fried chicken wing, ikan bilis, peanuts, egg and sambal',
        sku: 'FOOD-NASILEMAK',
        price: 4.50,
        active: true,
      },
      {
        name: 'Roti Prata',
        description: 'Crispy pan-fried flatbread served with fish curry dipping sauce',
        sku: 'FOOD-PRATA',
        price: 3.00,
        active: true,
      },
    ];

    await repo.insert(products);
  }
}