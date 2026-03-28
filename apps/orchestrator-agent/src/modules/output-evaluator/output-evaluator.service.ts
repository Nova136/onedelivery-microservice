import { ChatOpenAI } from "@langchain/openai";
import { Logger, Injectable } from "@nestjs/common";
import { OUTPUT_EVALUATOR_PROMPT } from "./prompts/output-evaluator.prompt";

@Injectable()
export class OutputEvaluatorService {
    private readonly logger = new Logger(OutputEvaluatorService.name);
    private model: ChatOpenAI;

    constructor() {
        this.model = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
            metadata: {
                environment: "production",
                component: "output-evaluator",
            },
            tags: ["production", "guardrail"],
        });
    }

    async evaluateOutput(
        output: string,
        input: string,
        context: string,
    ): Promise<{
        isSafe: boolean;
        isHallucination: boolean;
        score: number;
        issues?: string[];
    }> {
        this.logger.log(`Evaluating output: "${output}"`);
        const issues: string[] = [];

        if (output.length > 5000) {
            this.logger.warn("Output length exceeds 5000 characters.");
            issues.push("Output too long");
        }

        // Use LLM for comprehensive evaluation
        try {
            const prompt = OUTPUT_EVALUATOR_PROMPT.replace(
                "{{context}}",
                context,
            )
                .replace("{{input}}", input)
                .replace("{{output}}", output);

            const response = await this.model.invoke([
                {
                    role: "system",
                    content: prompt,
                },
            ]);

            const result = response.content.toString();
            this.logger.debug(`LLM Evaluation Result: ${result}`);
            const scoreMatch = result.match(/SCORE:\s*([0-9.]+)/i);
            const hallucinationMatch = result.match(
                /HALLUCINATION:\s*(YES|NO)/i,
            );
            const leakageMatch = result.match(/LEAKAGE:\s*(YES|NO)/i);
            const issuesMatch = result.match(/ISSUES:\s*(.+)/i);

            let score = 0.5; // Default
            if (scoreMatch) {
                score = parseFloat(scoreMatch[1]);
            }

            const isHallucination = hallucinationMatch
                ? hallucinationMatch[1].toUpperCase() === "YES"
                : false;
            const isLeakage = leakageMatch
                ? leakageMatch[1].toUpperCase() === "YES"
                : false;

            if (isHallucination) {
                issues.push("Hallucination detected");
            }
            if (isLeakage) {
                issues.push("Internal leakage detected");
            }

            if (issuesMatch && issuesMatch[1].toLowerCase() !== "none") {
                issues.push(...issuesMatch[1].split(",").map((i) => i.trim()));
            }

            return {
                isSafe:
                    score > 0.5 &&
                    !isHallucination &&
                    !isLeakage &&
                    !issues.some(
                        (i) =>
                            i.toLowerCase().includes("harmful") ||
                            i.toLowerCase().includes("inappropriate") ||
                            i.toLowerCase().includes("leakage") ||
                            i.toLowerCase().includes("hallucination"),
                    ),
                isHallucination,
                score: Math.min(Math.max(score, 0), 1),
                issues: issues.length > 0 ? issues : undefined,
            };
        } catch (error) {
            this.logger.error(
                "LLM Evaluation failed, falling back to basic safety check",
                error,
            );
            return {
                isSafe: issues.length === 0,
                isHallucination: false,
                score: 0.5,
                issues: issues.length > 0 ? issues : undefined,
            };
        }
    }
}
