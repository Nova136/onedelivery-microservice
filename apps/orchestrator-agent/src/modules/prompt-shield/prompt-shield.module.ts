import { Module } from "@nestjs/common";
import { PromptShieldService } from "./prompt-shield.service";

@Module({
    providers: [PromptShieldService],
    exports: [PromptShieldService],
})
export class PromptShieldModule {}
