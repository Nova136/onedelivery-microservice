// src/modules/privacy/privacy.service.ts
import { Injectable, Logger } from "@nestjs/common";
import nlp from "compromise";

@Injectable()
export class PrivacyService {
    private readonly logger = new Logger(PrivacyService.name);

    /**
     * Redacts both structured PII (Regex) and unstructured entities (NLP).
     */
    redactPii(text: string): string {
        if (!text) return text;

        let redactedText = text;

        // 1. First Pass: Fast Regex for strictly formatted data
        redactedText = this.redactStructuredData(redactedText);

        // 2. Second Pass: NLP for unstructured entities (Names, Places, Orgs)
        redactedText = this.redactUnstructuredEntities(redactedText);

        return redactedText;
    }

    private redactStructuredData(text: string): string {
        let scrubbed = text;

        // Standard Regex patterns
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneRegex =
            /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g;
        const creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;

        scrubbed = scrubbed.replace(emailRegex, "[EMAIL_REDACTED]");
        scrubbed = scrubbed.replace(phoneRegex, "[PHONE_REDACTED]");
        scrubbed = scrubbed.replace(creditCardRegex, "[CARD_REDACTED]");

        return scrubbed;
    }

    private redactUnstructuredEntities(text: string): string {
        // Parse the text using the NLP engine
        const doc = nlp(text);

        // Extract entities recognized by the NLP engine
        const people = doc.people().out("array");
        const places = doc.places().out("array");
        const organizations = doc.organizations().out("array");

        let scrubbed = text;

        // Replace each recognized entity with a safe tag
        // We sort by length descending so "John Smith" gets replaced before "John"

        const replaceEntities = (entities: string[], tag: string) => {
            entities
                .sort((a, b) => b.length - a.length)
                .forEach((entity) => {
                    // Use a global, case-insensitive regex to replace the exact phrase
                    const regex = new RegExp(
                        `\\b${this.escapeRegExp(entity)}\\b`,
                        "gi",
                    );
                    scrubbed = scrubbed.replace(regex, tag);
                });
        };

        replaceEntities(people, "[NAME_REDACTED]");
        replaceEntities(places, "[LOCATION_REDACTED]");
        replaceEntities(organizations, "[ORG_REDACTED]");

        return scrubbed;
    }

    // Helper to escape regex characters in names (e.g., "O'Connor")
    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
