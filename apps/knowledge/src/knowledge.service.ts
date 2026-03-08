import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Faq } from "./database/entities/faq.entity";
import { Sop } from "./database/entities/sop.entity";
import { OpenAIEmbeddings } from "@langchain/openai";

@Injectable()
export class KnowledgeService {
    constructor(
        @InjectRepository(Faq)
        private readonly faqRepository: Repository<Faq>,
        @InjectRepository(Sop)
        private readonly sopRepository: Repository<Sop>,
    ) {}

    async getAllFaqs(): Promise<Faq[]> {
        return this.faqRepository.find();
    }

    async getAllSops(): Promise<Sop[]> {
        return this.sopRepository.find();
    }

    async searchFAQ(query: string): Promise<string> {
        try {
            const embeddings = new OpenAIEmbeddings();
            const queryEmbedding = await embeddings.embedQuery(query);

            const faq = await this.faqRepository
                .createQueryBuilder("faq")
                .select("faq.content")
                .where("faq.embedding <=> :queryEmbedding < 0.5", {
                    queryEmbedding: JSON.stringify(queryEmbedding),
                })
                .orderBy("faq.embedding <=> :queryEmbedding", "ASC")
                .getOne();

            return faq ? faq.content : "No relevant FAQ found.";
        } catch (error) {
            console.error("Error searching FAQ:", error);
            return "An error occurred while searching for the FAQ.";
        }
    }

    async searchInternalSOP(query: string): Promise<string> {
        try {
            const embeddings = new OpenAIEmbeddings();
            const queryEmbedding = await embeddings.embedQuery(query);

            const sop = await this.sopRepository
                .createQueryBuilder("sop")
                .select("sop.content")
                .where("sop.embedding <=> :queryEmbedding < 0.5", {
                    queryEmbedding: JSON.stringify(queryEmbedding),
                })
                .orderBy("sop.embedding <=> :queryEmbedding", "ASC")
                .getOne();

            return sop ? sop.content : "No relevant SOP found.";
        } catch (error) {
            console.error("Error searching SOP:", error);
            return "An error occurred while searching for the SOP.";
        }
    }

    async addDocument(category: string, title: string, content: string) {
        const embeddings = new OpenAIEmbeddings();

        if (category === "faq") {
            const embedding = await embeddings.embedQuery(title);
            const faq = this.faqRepository.create({
                title: title,
                content: content,
                embedding,
            });
            await this.faqRepository.save(faq);
        } else if (category === "sop") {
            const embedding = await embeddings.embedQuery(content);
            const sop = this.sopRepository.create({
                title,
                content: content,
                embedding,
            });
            await this.sopRepository.save(sop);
        }
    }
}
