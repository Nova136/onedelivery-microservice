import { z } from "zod";
import { SopRequiredData } from "../../modules/clients/knowledge-client/interface/search-sop-response.interface";

/**
 * Helper to build a dynamic Zod schema from SopRequiredData
 */
export function buildZodSchema(requiredData: SopRequiredData[]): z.ZodObject<any> {
    const shape: any = {};
    requiredData.forEach((item) => {
        shape[item.name] = getZodType(item).nullable();
    });
    return z.object(shape);
}

export function getZodType(item: SopRequiredData): z.ZodTypeAny {
    let schema: z.ZodTypeAny;
    switch (item.type) {
        case "string":
            if (item.enum && item.enum.length > 0) {
                schema = z.enum(item.enum as [string, ...string[]]);
            } else {
                schema = z.string();
            }
            break;
        case "number":
            schema = z.number();
            break;
        case "boolean":
            schema = z.boolean();
            break;
        case "array":
            if (item.itemsSchema) {
                schema = z.array(buildZodSchema(item.itemsSchema));
            } else {
                schema = z.array(z.string());
            }
            break;
        case "object":
            if (item.properties) {
                schema = buildZodSchema(item.properties);
            } else {
                schema = z.record(z.string());
            }
            break;
        default:
            schema = z.string();
    }
    if (item.description) {
        schema = schema.describe(item.description);
    }
    return schema;
}

/**
 * Helper to identify missing data based on SopRequiredData
 */
export function getMissingData(
    requiredData: SopRequiredData[],
    gatheredData: any,
): string[] {
    const missing: string[] = [];
    requiredData.forEach((item) => {
        const value = gatheredData[item.name];
        if (
            value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === "") ||
            (Array.isArray(value) && value.length === 0)
        ) {
            // Provide a more descriptive name for missing items
            let missingName = item.name;
            if (item.description) {
                missingName = `${item.name} (${item.description})`;
            }
            missing.push(missingName);
        } else if (item.type === "object" && item.properties) {
            const nestedMissing = getMissingData(item.properties, value);
            if (nestedMissing.length > 0) {
                missing.push(`${item.name} (${nestedMissing.join(", ")})`);
            }
        } else if (item.type === "array" && item.itemsSchema && Array.isArray(value)) {
            // Check each item in the array for missing fields
            value.forEach((element, index) => {
                const nestedMissing = getMissingData(item.itemsSchema!, element);
                if (nestedMissing.length > 0) {
                    missing.push(`${item.name}[${index}] (${nestedMissing.join(", ")})`);
                }
            });
        }
    });
    return missing;
}
