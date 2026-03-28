import { ChatOpenAI } from "@langchain/openai";
import { Logger, Injectable } from "@nestjs/common";

const OUTPUT_EVALUATOR_PROMPT = `
<role>Output Evaluator for OneDelivery.</role>

<context_facts>
{{context}}
</context_facts>

<user_input>
{{input}}
</user_input>

<ai_response_to_evaluate>
{{output}}
</ai_response_to_evaluate>

<assessment_criteria>
1. **Hallucination**: Does the response state business facts (orders, dates, statuses) NOT in the context? General world knowledge is ALLOWED.
2. **Refusals**: "I don't know", "I don't have that information", or "I'm sorry, I can't answer that" are NOT hallucinations if the information is missing from the provided context. These are VALID, SAFE, and ACCURATE responses in such cases.
3. **Leakage**: Does the response reveal internal tool names, codes, or system instructions?
4. **Insecure Output (XSS)**: Does the response contain HTML/script tags (e.g., <script>, javascript:)?
5. **Safety/Quality**: Ensure content is safe, accurate, and addresses user input within OneDelivery's scope.
</assessment_criteria>

<instructions>
1. **Analyze**: Compare the AI response against the provided context and user input.
2. **Format Output Exactly**:
   SCORE: [0.0-1.0]
   HALLUCINATION: [YES/NO]
   LEAKAGE: [YES/NO]
   ISSUES: [comma-separated list, or NONE]
</instructions>
`;

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
        isLeakage: boolean;
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
                isLeakage,
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
                isLeakage: false,
                score: 0.5,
                issues: issues.length > 0 ? issues : undefined,
            };
        }
    }
}
