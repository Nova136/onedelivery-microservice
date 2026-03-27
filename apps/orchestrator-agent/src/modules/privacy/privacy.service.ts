// src/modules/privacy/privacy.service.ts
import { Injectable, Logger } from "@nestjs/common";
import nlp from "compromise";
import { RedisService } from 'nestjs-redis';
import { randomUUID } from 'crypto';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private localCache = new Map<string, string>();
  private redisClient;

  constructor(private readonly redisService: RedisService) {
    try {
      this.redisClient = this.redisService.getClient();
    } catch (error) {
      this.logger.error('Failed to connect to Redis, using in-memory cache as fallback', error);
      this.redisClient = null;
    }
  }

  async saveToken(token: string): Promise<string> {
    const tokenId = randomUUID();
    if (this.redisClient) {
      try {
        await this.redisClient.set(tokenId, token, 'EX', 3600); // 1 hour TTL
        return tokenId;
      } catch (error) {
        this.logger.error('Failed to save token to Redis, falling back to in-memory cache', error);
      }
    }
    
    this.localCache.set(tokenId, token);
    setTimeout(() => this.localCache.delete(tokenId), 3600 * 1000);
    return tokenId;
  }

  async getToken(tokenId: string): Promise<string | null> {
    if (this.redisClient) {
      try {
        const token = await this.redisClient.get(tokenId);
        if (token) {
          return token;
        }
      } catch (error) {
        this.logger.error('Failed to retrieve token from Redis, falling back to in-memory cache', error);
      }
    }

    return this.localCache.get(tokenId) || null;
  }
}

@Injectable()
export class PrivacyService {
    private readonly logger = new Logger(PrivacyService.name);

    constructor(private readonly tokenService: TokenService) {}

    /**
     * Redacts both structured PII (Regex) and unstructured entities (NLP).
     * Returns a redacted version of the text and a token to retrieve the original PII.
     */
    async redactPii(text: string): Promise<{ redactedText: string; token: string }> {
        if (!text) return { redactedText: text, token: '' };

        const piiMap: { [key: string]: string } = {};

        // 1. First Pass: Fast Regex for strictly formatted data
        let redactedText = this.redactStructuredData(text, piiMap);

        // 2. Second Pass: NLP for unstructured entities (Names, Places, Orgs)
        redactedText = this.redactUnstructuredEntities(redactedText, piiMap);

        const token = await this.tokenService.saveToken(JSON.stringify(piiMap));

        return { redactedText, token };
    }

    /**
     * Deanonymizes a text by replacing the tokens with the original PII.
     */
    async deanonymizePii(text: string, token: string): Promise<string> {
        if (!text || !token) return text;

        const piiMapString = await this.tokenService.getToken(token);
        if (!piiMapString) return text;

        const piiMap: { [key: string]: string } = JSON.parse(piiMapString);
        let deanonymizedText = text;

        for (const placeholder in piiMap) {
            const originalText = piiMap[placeholder];
            deanonymizedText = deanonymizedText.replace(placeholder, originalText);
        }

        return deanonymizedText;
    }

    private redactStructuredData(text: string, piiMap: { [key: string]: string }): string {
        let scrubbed = text;

        // Standard Regex patterns
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const phoneRegex =
            /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g;
        const creditCardRegex = /\b(?:\d[ -]*?){13,16}\b/g;

        scrubbed = scrubbed.replace(emailRegex, (match) => {
            const placeholder = `[EMAIL_REDACTED_${Object.keys(piiMap).length}]`;
            piiMap[placeholder] = match;
            return placeholder;
        });
        scrubbed = scrubbed.replace(phoneRegex, (match) => {
            const placeholder = `[PHONE_REDACTED_${Object.keys(piiMap).length}]`;
            piiMap[placeholder] = match;
            return placeholder;
        });
        scrubbed = scrubbed.replace(creditCardRegex, (match) => {
            const placeholder = `[CARD_REDACTED_${Object.keys(piiMap).length}]`;
            piiMap[placeholder] = match;
            return placeholder;
        });

        return scrubbed;
    }

    private redactUnstructuredEntities(text: string, piiMap: { [key: string]: string }): string {
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
                    scrubbed = scrubbed.replace(regex, (match) => {
                        const placeholder = `[${tag}_REDACTED_${Object.keys(piiMap).length}]`;
                        piiMap[placeholder] = match;
                        return placeholder;
                    });
                });
        };

        replaceEntities(people, "NAME");
        replaceEntities(places, "LOCATION");
        replaceEntities(organizations, "ORG");

        return scrubbed;
    }

    // Helper to escape regex characters in names (e.g., "O'Connor")
    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}
