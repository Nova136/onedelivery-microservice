import "dotenv/config";
import { PiiRedactionService } from "../../../src/modules/pii-redaction/pii-redaction.service";
import * as path from "path";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";

require("dotenv").config({
    path: path.resolve(__dirname, "../../../../../.env"),
});

const DATASET_NAME = "Orchestrator-PII-Redaction-Functional-Tests";
const service = new PiiRedactionService();

const testCases = [
    {
        inputs: {
            text: "My email is john.doe@example.com, please contact me there.",
        },
        outputs: {
            expected_tokens: ["REDACTED_EMAIL_"],
            forbidden_strings: ["john.doe@example.com"],
            required_strings: [],
        },
        metadata: { category: "Email Redaction" },
    },
    {
        inputs: { text: "Call me at +1 (555) 123-4567 or +65 9123 4567." },
        outputs: {
            expected_tokens: ["REDACTED_PHONE_", "REDACTED_PHONE_"],
            forbidden_strings: ["555", "9123"],
            required_strings: [],
        },
        metadata: {
            category: "Phone Redaction",
            description: "US & International",
        },
    },
    {
        inputs: { text: "My local number is 81234567 or 9123 4567." },
        outputs: {
            expected_tokens: ["REDACTED_PHONE_", "REDACTED_PHONE_"],
            forbidden_strings: ["81234567", "9123"],
            required_strings: [],
        },
        metadata: {
            category: "Phone Redaction",
            description: "Singapore Local",
        },
    },
    {
        inputs: { text: "My order number is 12345678." },
        outputs: {
            expected_tokens: [],
            forbidden_strings: ["REDACTED_PHONE_"],
            required_strings: ["12345678"],
        },
        metadata: {
            category: "False Positive Check",
            description: "Order Number",
        },
    },
    {
        inputs: { text: "My card number is 1234-5678-9012-3456." },
        outputs: {
            expected_tokens: ["REDACTED_CARD_"],
            forbidden_strings: ["1234-5678", "REDACTED_PHONE_"],
            required_strings: [],
        },
        metadata: {
            category: "Card Redaction",
            description: "Priority over Phone",
        },
    },
    {
        inputs: { text: "Hello, my name is Alice Smith and I live in London." },
        outputs: {
            expected_tokens: ["REDACTED_NAME_"],
            forbidden_strings: ["Alice", "Smith"],
            required_strings: ["London"],
        },
        metadata: {
            category: "Name Redaction",
            description: "NLP Person Extraction",
        },
    },
    {
        inputs: { text: "I am flying with Air Asia today." },
        outputs: {
            expected_tokens: [],
            forbidden_strings: ["REDACTED_"],
            required_strings: ["Air Asia"],
        },
        metadata: {
            category: "False Positive Check",
            description: "Company Name",
        },
    },
    {
        inputs: {
            text: "Contact Bob at bob@gmail.com regarding the delivery to New York.",
        },
        outputs: {
            expected_tokens: ["REDACTED_NAME_", "REDACTED_EMAIL_"],
            forbidden_strings: ["Bob", "bob@gmail.com"],
            required_strings: ["New York"],
        },
        metadata: { category: "Mixed PII" },
    },
    {
        inputs: { text: "My email is test@example.com", action: "retrieval" },
        outputs: {
            expected_tokens: [],
            forbidden_strings: [],
            required_strings: ["test@example.com"],
        },
        metadata: {
            category: "De-tokenization",
            description: "Retrieval check",
        },
    },
];

async function target(inputs: { text: string; action?: string }) {
    if (inputs.action === "retrieval") {
        const redacted = await service.redact(inputs.text);
        const tokenMatch = redacted.match(/REDACTED_EMAIL_[a-z0-9]+/);
        if (!tokenMatch) return { output: "NO_TOKEN_FOUND" };
        const retrieved = await service.retrieve(tokenMatch[0]);
        return { output: retrieved };
    }
    const redacted = await service.redact(inputs.text);
    return { output: redacted };
}

const piiRulesEvaluator = async ({ run, example }: any) => {
    const prediction = run.outputs?.output || "";
    const { expected_tokens, forbidden_strings, required_strings } =
        example.outputs;

    let passed = true;
    let reasoning = "Passed all checks.";

    // Validate expected token occurrences
    const tokenCounts = (expected_tokens || []).reduce(
        (acc: Record<string, number>, val: string) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        },
        {},
    );

    for (const [token, count] of Object.entries(tokenCounts)) {
        const occurrences = prediction.split(token).length - 1;
        if (occurrences < (count as number)) {
            passed = false;
            reasoning = `Expected at least ${count} of ${token}, found ${occurrences}`;
            break;
        }
    }

    if (passed) {
        for (const forbidden of forbidden_strings || []) {
            if (prediction.includes(forbidden)) {
                passed = false;
                reasoning = `Contains forbidden string: ${forbidden}`;
                break;
            }
        }
    }

    if (passed) {
        for (const req of required_strings || []) {
            if (!prediction.includes(req)) {
                passed = false;
                reasoning = `Missing required string: ${req}`;
                break;
            }
        }
    }

    return {
        key: "pii_redaction_accuracy",
        score: passed ? 1 : 0,
        comment: reasoning,
    };
};

async function main() {
    const client = new Client();
    console.log(`Syncing LangSmith dataset: ${DATASET_NAME}...`);

    try {
        await client.readDataset({ datasetName: DATASET_NAME });
        console.log("Dataset already exists. Skipping creation.");
    } catch {
        const dataset = await client.createDataset(DATASET_NAME, {
            description:
                "Functional tests evaluating deterministic PII Tokenization & rules.",
        });
        await Promise.all(
            testCases.map((tc) =>
                client.createExample(tc.inputs, tc.outputs, {
                    datasetId: dataset.id,
                    metadata: tc.metadata,
                }),
            ),
        );
        console.log("Dataset populated successfully.");
    }

    console.log("Running evaluation...");
    await evaluate(target, {
        data: DATASET_NAME,
        evaluators: [piiRulesEvaluator],
        experimentPrefix: "pii-redaction-functional",
        client,
    });
    console.log("Evaluation complete! Check your LangSmith dashboard.");
}

main().catch(console.error);
