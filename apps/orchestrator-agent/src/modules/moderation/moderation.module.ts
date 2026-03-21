import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ModerationService } from "./moderation.service";

/**
 * The @Global() decorator makes this module available everywhere.
 * You won't need to import ModerationModule into every other feature module.
 */
@Global()
@Module({
    imports: [ConfigModule], // Ensures the Service can use ConfigService for API keys
    providers: [ModerationService],
    exports: [ModerationService], // Export so other modules can use the service
})
export class ModerationModule {}
