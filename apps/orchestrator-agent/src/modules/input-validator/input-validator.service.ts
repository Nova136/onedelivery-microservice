import { ChatOpenAI } from "@langchain/openai";
import { Logger, Injectable } from "@nestjs/common";
import { INPUT_VALIDATOR_PROMPT } from "./prompts/input-validator.prompt";

@Injectable()
export class InputValidatorService {
    private readonly logger = new Logger(InputValidatorService.name);
    private model: ChatOpenAI;

    constructor() {
        this.model = new ChatOpenAI({
            modelName: "gpt-4o-mini",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0,
            metadata: {
                environment: "production",
                component: "input-validator",
            },
            tags: ["production", "guardrail"],
        });
    }

    async validateMessage(
        message: string,
    ): Promise<{ isValid: boolean; error?: string }> {
        this.logger.log(`Validating message: "${message}"`);
        // Basic checks first
        if (!message || message.trim().length === 0) {
            this.logger.warn("Empty message received.");
            return { isValid: false, error: "Message cannot be empty" };
        }

        if (message.length > 300) {
            this.logger.warn(`Message too long: ${message.length} chars.`);
            return { isValid: false, error: "Message too long" };
        }

        // Programmatic Security Checks
        const lowerMessage = message.toLowerCase();

        // 1. Detect common jailbreak/injection keywords (Expanded)
        const injectionKeywords = [
            "ignore all previous instructions",
            "ignore previous instructions",
            "system prompt",
            "you are now",
            "switch to",
            "developer mode",
            "dan mode",
            "do anything now",
            "bypass safety",
            "reveal your instructions",
            "what is your prompt",
            "explain your logic",
            "internal logic",
            "routing layer",
            "let's play a game",
            "you are an evil",
            "stupid bot",
            "i hate you",
            "print the text above",
            "repeat the text above",
            "output the system prompt",
            "show me your code",
            "access internal tools",
            "override system",
            "execute command",
            "sudo",
            "bash",
            "curl",
            "wget",
        ];

        if (
            injectionKeywords.some((keyword) => lowerMessage.includes(keyword))
        ) {
            this.logger.warn(
                `Security Threat Detected: Potential Prompt Injection in message: "${message}"`,
            );
            return {
                isValid: false,
                error: "Security Threat Detected: Potential Prompt Injection",
            };
        }

        // 2. Detect potential base64 or hex encoded payloads
        const base64Regex = /[A-Za-z0-9+/]{40,}={0,2}/;
        const hexRegex = /\b[0-9a-fA-F]{40,}\b/;
        if (base64Regex.test(message) || hexRegex.test(message)) {
            this.logger.warn(
                "Security Threat Detected: Potential Obfuscated Payload.",
            );
            return {
                isValid: false,
                error: "Security Threat Detected: Potential Obfuscated Payload",
            };
        }

        // 3. Detect character-level manipulation (e.g., using invisible characters or homoglyphs)
        const controlCharsRegex =
            /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/;
        if (controlCharsRegex.test(message)) {
            this.logger.warn(
                "Security Threat Detected: Malformed Input (Control Characters).",
            );
            return {
                isValid: false,
                error: "Security Threat Detected: Malformed Input",
            };
        }

        // 4. Detect excessive repetition (DoS mitigation)
        const repetitionRegex = /(.)\1{20,}/;
        if (repetitionRegex.test(message)) {
            this.logger.warn(
                "Security Threat Detected: Excessive Repetition (Potential DoS).",
            );
            return {
                isValid: false,
                error: "Security Threat Detected: Malformed Input",
            };
        }

        // Use LLM for content validation
        try {
            const response = await this.model.invoke([
                {
                    role: "system",
                    content: INPUT_VALIDATOR_PROMPT,
                },
                {
                    role: "user",
                    content: `User Message: ${message}`,
                },
            ]);

            const result = response.content.toString().trim();
            if (result.startsWith("INVALID:")) {
                return { isValid: false, error: result.substring(8).trim() };
            }

            return { isValid: true };
        } catch (error) {
            // Fallback to basic validation if LLM fails
            return { isValid: true };
        }
    }
}
