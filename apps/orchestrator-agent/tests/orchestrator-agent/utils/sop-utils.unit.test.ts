import {
    buildZodSchema,
    getMissingData,
    getZodType,
} from "../../../src/orchestrator-agent/utils/sop-utils";
import { z } from "zod";

describe("SOP Utils", () => {
    it("getZodType should return ZodString for string type", () => {
        const schema = getZodType({
            name: "test",
            type: "string",
            description: "A test string",
        });
        expect(schema).toBeInstanceOf(z.ZodString);
    });

    it("getZodType should return ZodEnum for enum type", () => {
        const schema = getZodType({
            name: "test",
            type: "string",
            enum: ["a", "b"],
            description: "A test enum",
        });
        expect(schema).toBeInstanceOf(z.ZodEnum);
    });

    it("getZodType should return ZodNumber for number type", () => {
        const schema = getZodType({
            name: "test",
            type: "number",
            description: "A test number",
        });
        expect(schema).toBeInstanceOf(z.ZodNumber);
    });

    it("getMissingData should detect missing basic fields", () => {
        const missing = getMissingData(
            [{ name: "f1", type: "string", description: "A test field" }],
            {},
        );
        expect(missing).toContain("f1 (A test field)");
    });

    it("getMissingData should detect missing nested fields", () => {
        const missing = getMissingData(
            [
                {
                    name: "u",
                    type: "object",
                    properties: [
                        {
                            name: "n",
                            type: "string",
                            description: "A test nested field",
                        },
                    ],
                    description: "A test object",
                },
            ],
            { u: {} },
        );
        expect(missing).toContain("u (n (A test nested field))");
    });

    it("buildZodSchema should build schema with multiple fields", () => {
        const requiredData: any[] = [
            { name: "field1", type: "string", description: "A test field" },
            { name: "field2", type: "number", description: "A test number" },
        ];
        const schema = buildZodSchema(requiredData);
        expect(schema.shape.field1).toBeDefined();
        expect(schema.shape.field2).toBeDefined();
    });
});
