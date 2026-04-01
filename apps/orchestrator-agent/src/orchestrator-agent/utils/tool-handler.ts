import { StructuredTool } from "@langchain/core/tools";

export async function executeToolCalls(
  toolCalls: any[],
  tools: StructuredTool[],
  loggerName: string = "ToolHandler"
): Promise<any[]> {
  return await Promise.all(
    toolCalls.map(async (tc) => {
      const tool = tools.find((t) => t.name === tc.name);
      if (tool) {
        try {
          return await tool.invoke(tc.args);
        } catch (e) {
          console.error(`[${loggerName}] Tool ${tc.name} execution error:`, e);
          return `Error executing tool ${tc.name}.`;
        }
      }
      console.warn(`[${loggerName}] Tool ${tc.name} not found.`);
      return `Tool ${tc.name} not found.`;
    })
  );
}
