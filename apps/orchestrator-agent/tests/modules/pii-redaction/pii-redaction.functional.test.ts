import { PiiRedactionService } from "../../../src/modules/pii-redaction/pii-redaction.service";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") });

async function runTests() {
    console.log("🛡️ Starting PII Redaction Functional Tests...");
    const service = new PiiRedactionService();

    const testCases = [
        {
            name: "Email Redaction",
            input: "My email is john.doe@example.com, please contact me there.",
            validate: (redacted: string) =>
                redacted.includes("REDACTED_EMAIL_") &&
                !redacted.includes("john.doe@example.com"),
        },
        {
            name: "Phone Number Redaction (US & International)",
            input: "Call me at +1 (555) 123-4567 or +65 9123 4567.",
            validate: (redacted: string) =>
                redacted.split("REDACTED_PHONE_").length > 2 &&
                !redacted.includes("555") &&
                !redacted.includes("9123"),
        },
        {
            name: "Phone Number Redaction (Singapore Local)",
            input: "My local number is 81234567 or 9123 4567.",
            validate: (redacted: string) =>
                redacted.split("REDACTED_PHONE_").length > 2 &&
                !redacted.includes("81234567") &&
                !redacted.includes("9123"),
        },
        {
            name: "Order Number (No Redaction)",
            input: "My order number is 12345678.",
            validate: (redacted: string) =>
                redacted.includes("12345678") &&
                !redacted.includes("REDACTED_PHONE_"),
        },
        {
            name: "Credit Card Redaction (Priority over Phone)",
            input: "My card number is 1234-5678-9012-3456.",
            validate: (redacted: string) =>
                redacted.includes("REDACTED_CARD_") &&
                !redacted.includes("1234-5678") &&
                !redacted.includes("REDACTED_PHONE_"),
        },
        {
            name: "Name Redaction (NLP)",
            input: "Hello, my name is Alice Smith and I live in London.",
            validate: (redacted: string) =>
                redacted.includes("REDACTED_NAME_") &&
                !redacted.includes("Alice") &&
                redacted.includes("London"), // London should NOT be redacted
        },
        {
            name: "Company Name (No Redaction)",
            input: "I am flying with Air Asia today.",
            validate: (redacted: string) =>
                redacted.includes("Air Asia") &&
                !redacted.includes("REDACTED_"),
        },
        {
            name: "Mixed PII and Scope",
            input: "Contact Bob at bob@gmail.com regarding the delivery to New York.",
            validate: (redacted: string) =>
                redacted.includes("REDACTED_NAME_") &&
                redacted.includes("REDACTED_EMAIL_") &&
                redacted.includes("New York"), // New York should NOT be redacted
        },
        {
            name: "De-tokenization (Retrieval)",
            input: "My secret is 'banana'.",
            // We need to manually mock/test retrieval since redact() uses random tokens
            customTest: async () => {
                const text = "My email is test@example.com";
                const redacted = await service.redact(text);
                const tokenMatch = redacted.match(/REDACTED_EMAIL_[a-z0-9]+/);
                if (!tokenMatch) return false;
                const token = tokenMatch[0];
                const retrieved = await service.retrieve(token);
                return retrieved === "test@example.com";
            },
        },
    ];

    let passed = 0;
    for (const test of testCases) {
        process.stdout.write(`Testing: ${test.name.padEnd(35)} `);
        try {
            let result = false;
            if (test.customTest) {
                result = await test.customTest();
            } else if (test.input && test.validate) {
                const redacted = await service.redact(test.input);
                result = test.validate(redacted);
                if (!result) {
                    console.log(`\n   Input: ${test.input}`);
                    console.log(`   Redacted: ${redacted}`);
                }
            }

            if (result) {
                console.log("✅ PASSED");
                passed++;
            } else {
                console.log("❌ FAILED");
            }
        } catch (error) {
            console.log(`💥 ERROR: ${error}`);
        }
    }

    console.log(
        `\n--- TESTS COMPLETED: ${passed}/${testCases.length} PASSED ---`,
    );
    process.exit(passed === testCases.length ? 0 : 1);
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
