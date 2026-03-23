import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Product } from "../entities/product.entity";

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
                id: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
                name: "Hainanese Chicken Rice",
                description:
                    "Fragrant poached chicken served with seasoned rice, chilli sauce and ginger paste",
                sku: "FOOD-CHICKRICE",
                price: 5.5,
                active: true,
            },
            {
                id: "b2c3d4e5-f6a7-8901-2345-678901bcdef0",
                name: "Laksa",
                description:
                    "Spicy coconut curry noodle soup with prawns, fishcake and cockles",
                sku: "FOOD-LAKSA",
                price: 6.5,
                active: true,
            },
            {
                id: "c3d4e5f6-a7b8-9012-3456-789012cdef01",
                name: "Char Kway Teow",
                description:
                    "Stir-fried flat rice noodles with lap cheong, bean sprouts, cockles and egg",
                sku: "FOOD-CKT",
                price: 5.0,
                active: true,
            },
            {
                id: "d4e5f6a7-b8c9-0123-4567-890123def012",
                name: "Nasi Lemak",
                description:
                    "Coconut rice with fried chicken wing, ikan bilis, peanuts, egg and sambal",
                sku: "FOOD-NASILEMAK",
                price: 4.5,
                active: true,
            },
            {
                id: "e5f6a7b8-c9d0-1234-5678-901234ef0123",
                name: "Roti Prata",
                description:
                    "Crispy pan-fried flatbread served with fish curry dipping sauce",
                sku: "FOOD-PRATA",
                price: 3.0,
                active: true,
            },
            {
                id: "ae61d854-8baa-471c-a8c0-bfdd19ff3e3d",
                name: "Whole Lobster",
                description:
                    "Succulent, butter-poached Atlantic lobster served with a side of clarified garlic butter",
                sku: "FOOD-LOBSTER",
                price: 50.0,
                active: true,
            },
        ];

        await repo.insert(products);
    }
}
