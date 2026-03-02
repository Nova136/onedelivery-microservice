import { Module } from "@nestjs/common";
import { MemoryService } from "./memory.service";

@Module({
    // Providers are the things this module creates and manages
    providers: [MemoryService],

    // Exports make the service available to other modules (like your OrchestratorModule!)
    exports: [MemoryService],
})
export class MemoryModule {}
