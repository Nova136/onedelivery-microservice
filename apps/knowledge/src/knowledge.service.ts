import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Faq } from "./database/entities/faq.entity";
import { Sop } from "./database/entities/sop.entity";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class KnowledgeService {
    constructor(
        @InjectRepository(Faq)
        private readonly faqRepository: Repository<Faq>,
        @InjectRepository(Sop)
        private readonly sopRepository: Repository<Sop>,
    ) {}

    private embeddings = new OpenAIEmbeddings();
    private readonly SIMILARITY_THRESHOLD =
        process.env.SIMILARITY_THRESHOLD || 0.25; // Tune this based on your embedding model and needs

    async listSops(requestingAgent: string): Promise<Sop[]> {
        return this.sopRepository.find({
            where: { agentOwner: requestingAgent },
        });
    }

    async searchFAQ(query: string): Promise<Faq[]> {
        try {
            const queryEmbedding = await this.embeddings.embedQuery(query);
            const faqs = await this.faqRepository
                .createQueryBuilder("faq")
                .select(["faq.title", "faq.content"])
                .where("faq.embedding <=> :queryEmbedding < :threshold", {
                    queryEmbedding: JSON.stringify(queryEmbedding),
                    threshold: this.SIMILARITY_THRESHOLD,
                })
                .orderBy("faq.embedding <=> :queryEmbedding", "ASC")
                .limit(3)
                .getMany();
            return faqs;
        } catch (error) {
            console.error("Error searching FAQ:", error);
            throw new Error("Failed to execute vector search in the database.");
        }
    }

    async searchInternalSOP(
        intentCode: string,
        requestingAgent: string,
    ): Promise<Sop> {
        try {
            const sop = await this.sopRepository.findOne({
                where: {
                    intentCode: intentCode,
                    agentOwner: requestingAgent,
                },
            });

            return sop || null;
        } catch (error) {
            console.error(
                `Error fetching SOP for intent ${intentCode}:`,
                error,
            );
            throw new Error("Failed to execute SOP lookup in the database.");
        }
    }

    async addDocument(title: string, content: string) {
        const embeddings = new OpenAIEmbeddings();
        const embedding = await embeddings.embedQuery(title);
        const faq = this.faqRepository.create({
            title: title,
            content: content,
            embedding,
        });
        await this.faqRepository.save(faq);
    }
}
