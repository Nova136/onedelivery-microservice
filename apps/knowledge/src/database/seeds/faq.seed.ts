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

        // 1. Just define the raw text (No overlapping operational SOPs!)
        const rawFaqs = [
            {
                title: "How much is the delivery fee and how is it calculated?",
                content:
                    "Your delivery fee is dynamic! It is calculated based on a few factors: the distance between the restaurant and your drop-off location, the time of day, and how busy our delivery network is right now (surge pricing). You will always see the exact delivery fee upfront on the checkout page before you confirm your order.",
            },
            {
                title: "How can I pay for my delivery?",
                content:
                    "We accept a variety of payment methods including major Credit/Debit Cards, our native in-app Wallet, and PayPal. We also accept Cash on Delivery for orders under $50. If you are paying with cash, please try to have exact change ready for your driver. Note: Some international cards or specific digital wallets might not be supported yet.",
            },
            {
                title: "Can I change my delivery address after I place the order?",
                content:
                    "To ensure your food arrives hot and our drivers aren't sent off-route, you cannot manually change your delivery address in the app once the order is confirmed. If you accidentally entered the wrong address, please reach out to support immediately. If the new address is very close to the original one, we might be able to accommodate it, but if it is too far, the order may need to be cancelled.",
            },
        ];

        // 2. Generate the embeddings in a clean, automated loop
        const faqs: Partial<Faq>[] = await Promise.all(
            rawFaqs.map(async (faq) => {
                // Combine Title and Content for a massive RAG accuracy boost!
                const textToEmbed = `Question: ${faq.title}\nAnswer: ${faq.content}`;

                return {
                    title: faq.title.trim(), // Cleans up those accidental trailing spaces
                    content: faq.content,
                    embedding: await embeddings.embedQuery(textToEmbed),
                };
            }),
        );

        await repo.insert(faqs);
        console.log("Successfully seeded FAQ documents!");
    }
}
