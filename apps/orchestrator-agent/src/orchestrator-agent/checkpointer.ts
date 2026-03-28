import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import pg from "pg";

/**
 * Factory to create a checkpointer based on environment
 */
export async function createCheckpointer() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        console.log(
            "DATABASE_URL not found, using MemorySaver for checkpointer.",
        );
        return new MemorySaver();
    }

    try {
        const pool = new pg.Pool({
            connectionString,
        });

        const checkpointer = new PostgresSaver(pool);

        // Ensure tables are created
        await checkpointer.setup();
        console.log("Postgres Checkpointer initialized and setup.");

        return checkpointer;
    } catch (error) {
        console.error(
            "Failed to initialize Postgres Checkpointer, falling back to MemorySaver:",
            error,
        );
        return new MemorySaver();
    }
}
