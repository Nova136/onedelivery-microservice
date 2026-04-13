export const INCIDENT_TYPE_PRIORITY = [
    "LATE_DELIVERY",
    "MISSING_ITEMS",
    "WRONG_ORDER",
    "DAMAGED_PACKAGING",
    "PAYMENT_FAILURE",
    "OTHER",
] as const;

export type IncidentType = (typeof INCIDENT_TYPE_PRIORITY)[number];
export type TrendDirection = "up" | "down" | "stable" | "NA";

export interface TrendIncident {
    type?: string | null;
    summary?: string | null;
    createdAt?: string | Date | null;
}

export interface TrendAnalysisResult {
    totalByThisMonth: number;
    mostCommon: IncidentType | "NA";
    percentage: number;
    trend: TrendDirection;
    peakTime: string;
    issues: string[];
}

const STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "app",
    "are",
    "at",
    "because",
    "by",
    "customer",
    "due",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "item",
    "items",
    "my",
    "of",
    "on",
    "order",
    "our",
    "that",
    "the",
    "their",
    "there",
    "to",
    "too",
    "was",
    "were",
    "with",
]);

function isIncidentType(value: string | null | undefined): value is IncidentType {
    return INCIDENT_TYPE_PRIORITY.includes(value as IncidentType);
}

export function countIncidentTypes(
    incidents: TrendIncident[],
): Record<IncidentType, number> {
    const counts = Object.fromEntries(
        INCIDENT_TYPE_PRIORITY.map((type) => [type, 0]),
    ) as Record<IncidentType, number>;

    for (const incident of incidents) {
        if (isIncidentType(incident.type)) {
            counts[incident.type] += 1;
        }
    }

    return counts;
}

export function resolveMostCommonIncidentType(
    counts: Record<IncidentType, number>,
): IncidentType | "NA" {
    let highestCount = 0;
    let selectedType: IncidentType | "NA" = "NA";

    for (const type of INCIDENT_TYPE_PRIORITY) {
        if (counts[type] > highestCount) {
            highestCount = counts[type];
            selectedType = type;
        }
    }

    return selectedType;
}

function formatPeakTimeBucket(hour: number): string {
    const startHour = Math.floor(hour / 2) * 2;
    const endHour = (startHour + 2) % 24;

    return `${String(startHour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:00`;
}

export function calculatePeakTime(incidents: TrendIncident[]): string {
    const bucketCounts = new Map<number, number>();

    for (const incident of incidents) {
        if (!incident.createdAt) {
            continue;
        }

        const date = new Date(incident.createdAt);
        if (Number.isNaN(date.getTime())) {
            continue;
        }

        const bucket = Math.floor(date.getHours() / 2) * 2;
        bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }

    if (bucketCounts.size === 0) {
        return "NA";
    }

    let bestBucket = 0;
    let bestCount = -1;
    for (const [bucket, count] of bucketCounts.entries()) {
        if (count > bestCount || (count === bestCount && bucket < bestBucket)) {
            bestBucket = bucket;
            bestCount = count;
        }
    }

    return formatPeakTimeBucket(bestBucket);
}

export function calculateTrend(
    currentMonthIncidents: TrendIncident[],
    previousMonthIncidents: TrendIncident[] | null,
): TrendDirection {
    if (previousMonthIncidents === null) {
        return "NA";
    }

    if (currentMonthIncidents.length > previousMonthIncidents.length) {
        return "up";
    }

    if (currentMonthIncidents.length < previousMonthIncidents.length) {
        return "down";
    }

    return "stable";
}

export function analyzeIncidentTrends(
    currentMonthIncidents: TrendIncident[],
    previousMonthIncidents: TrendIncident[] | null,
): Omit<TrendAnalysisResult, "issues"> {
    const counts = countIncidentTypes(currentMonthIncidents);
    const totalByThisMonth = currentMonthIncidents.length;
    const mostCommon = resolveMostCommonIncidentType(counts);
    const mostCommonCount = mostCommon === "NA" ? 0 : counts[mostCommon];
    const percentage =
        totalByThisMonth === 0
            ? 0
            : Number(((mostCommonCount / totalByThisMonth) * 100).toFixed(2));

    return {
        totalByThisMonth,
        mostCommon,
        percentage,
        trend: calculateTrend(currentMonthIncidents, previousMonthIncidents),
        peakTime: calculatePeakTime(currentMonthIncidents),
    };
}

function normalizeSummary(summary: string): string {
    return summary
        .toLowerCase()
        .replace(/fd-\d{4}-\d{6}/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function getFallbackIssueSnippets(
    incidents: TrendIncident[],
    limit = 3,
): string[] {
    const snippetMap = new Map<
        string,
        { count: number; original: string; keywordScore: number }
    >();

    for (const incident of incidents) {
        const original = incident.summary?.trim();
        if (!original) {
            continue;
        }

        const normalized = normalizeSummary(original);
        if (!normalized) {
            continue;
        }

        const keywordScore = normalized
            .split(" ")
            .filter((token) => token.length > 3 && !STOP_WORDS.has(token)).length;

        const existing = snippetMap.get(normalized);
        if (existing) {
            existing.count += 1;
            continue;
        }

        snippetMap.set(normalized, {
            count: 1,
            original,
            keywordScore,
        });
    }

    return [...snippetMap.values()]
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }

            if (right.keywordScore !== left.keywordScore) {
                return right.keywordScore - left.keywordScore;
            }

            return left.original.localeCompare(right.original);
        })
        .slice(0, limit)
        .map((entry) => entry.original);
}