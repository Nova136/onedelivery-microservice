import { DataSource } from "typeorm";
import { Seeder } from "typeorm-extension";
import { Faq } from "../entities/faq.entity";
import { OpenAIEmbeddings } from "@langchain/openai";

export default class FaqSeeder implements Seeder {
    public async run(dataSource: DataSource): Promise<void> {
        const repo = dataSource.getRepository(Faq);

        // Avoid duplicating seed data if it already exists
        const existing = await repo.count();
        if (existing > 0) {
            console.log("FAQ data already seeded. Skipping...");
            return;
        }

        const embeddings = new OpenAIEmbeddings();

        const faqs: Partial<Faq>[] = [
            {
                title: "Can I cancel my food delivery order? ",
                content: `Yes, but you can only cancel your order before the restaurant accepts it and starts preparing your food. Once the kitchen has started cooking, or if a delivery driver has already been assigned and picked up the food, the order cannot be cancelled on the app. If you have an emergency, please connect with our support team, though refunds are not guaranteed for food that is already being prepared.`,
                embedding: await embeddings.embedQuery(
                    "Can I cancel my food delivery order?",
                ),
            },
            {
                title: "What do I do if my order is missing an item or I received the wrong food? ",
                content: `We are so sorry about the mix-up! Please report the missing or incorrect items within 12 hours of receiving your delivery. Go to your order history, select the order, and choose "Report Issue". For incorrect items, please take a clear photo of the food you received and the receipt attached to the bag. Our team will review it and issue a refund or credit for the affected items.`,
                embedding: await embeddings.embedQuery(
                    "What do I do if my order is missing an item or I received the wrong food?",
                ),
            },
            {
                title: "My food arrived completely spilled or damaged. What now? ",
                content: `Nobody likes ruined food! If your meal arrives spilled, crushed, or damaged, please report it within 12 hours of delivery. Take a clear picture showing the damaged items and the condition of the packaging. We review these on a case-by-case basis and will compensate you accordingly. We also share this feedback with the restaurant and driver so it doesn't happen again.`,
                embedding: await embeddings.embedQuery(
                    "My food arrived completely spilled or damaged. What now?",
                ),
            },
            {
                title: "How much is the delivery fee and how is it calculated?",
                content: `Your delivery fee is dynamic! It is calculated based on a few factors: the distance between the restaurant and your drop-off location, the time of day, and how busy our delivery network is right now (surge pricing). You will always see the exact delivery fee upfront on the checkout page before you confirm your order.`,
                embedding: await embeddings.embedQuery(
                    "How much is the delivery fee and how is it calculated?",
                ),
            },
            {
                title: "How can I pay for my delivery?",
                content: `We accept a variety of payment methods including major Credit/Debit Cards, our native in-app Wallet, and PayPal. We also accept Cash on Delivery for orders under $50. If you are paying with cash, please try to have exact change ready for your driver. Note: Some international cards or specific digital wallets might not be supported yet.`,
                embedding: await embeddings.embedQuery(
                    "How can I pay for my delivery?",
                ),
            },
            {
                title: "Can I change my delivery address after I place the order?",
                content: `To ensure your food arrives hot and our drivers aren't sent off-route, you cannot manually change your delivery address in the app once the order is confirmed. If you accidentally entered the wrong address, please reach out to support immediately. If the new address is very close to the original one, we might be able to accommodate it, but if it is too far, the order may need to be cancelled.`,
                embedding: await embeddings.embedQuery(
                    "Can I change my delivery address after I place the order?",
                ),
            },
        ];

        await repo.insert(faqs);
        console.log("Successfully seeded FAQ documents!");
    }
}
