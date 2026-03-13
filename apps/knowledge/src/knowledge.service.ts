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

            // 1. If the database found absolutely nothing
            if (!faq) {
                return "No relevant FAQ found. STRICT RULE: DO NOT guess or make up an answer. Reply EXACTLY with: 'I'm sorry, I don't have the answer to that specific question. Would you like me to connect you with a human agent?'";
            }

            // 2. If it found something, wrap it in the hallucination-killer prompt
            return `
### SEARCH RESULT ###
${faq.content}

### STRICT RULE ###
If the user's exact question is not clearly answered by the text above, DO NOT guess or use outside knowledge. Reply EXACTLY with: "I'm sorry, I don't have the answer to that specific question. Would you like me to connect you with a human agent?"
            `.trim();
        } catch (error) {
            console.error("Error searching FAQ:", error);
            return "An error occurred while searching for the FAQ. STRICT RULE: Tell the user you are experiencing technical difficulties and ask if they need a human agent.";
        }
    }

    async searchInternalSOP(
        intentCode: string,
        requestingAgent: string,
    ): Promise<string> {
        try {
            // 1. Lightning-fast exact match (No embeddings needed!)
            // We also enforce the agentOwner guardrail here so agents don't read each other's rules.
            const sop = await this.sopRepository.findOne({
                where: {
                    intentCode: intentCode,
                    agentOwner: requestingAgent,
                },
            });

            // 2. Safe fallback if the LLM hallucinates a weird intent code
            if (!sop) {
                return `Error: No internal rules found for intent '${intentCode}'. Please ask the user to clarify their request.`;
            }

            // 3. Format the JSON structure into a strict string for the LLM to read
            const formattedSop = `
### INTERNAL RULEBOOK: ${sop.title} ###

REQUIRED DATA TO COLLECT FIRST:
${sop.requiredData.length > 0 ? sop.requiredData.map((item) => `- ${item}`).join("\n") : "None. You may proceed."}

WORKFLOW STEPS (FOLLOW EXACTLY):
${sop.workflowSteps.join("\n")}

PERMITTED TOOLS:
${sop.permittedTools.length > 0 ? sop.permittedTools.join(", ") : "None."}
      `.trim();

            return formattedSop;
        } catch (error) {
            console.error(
                `Error fetching SOP for intent ${intentCode}:`,
                error,
            );
            return "An internal database error occurred while fetching the workflow rules.";
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
