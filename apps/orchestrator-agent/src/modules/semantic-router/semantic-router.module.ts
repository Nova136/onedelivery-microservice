import { Module } from "@nestjs/common";
import { SemanticRouterService } from "./semantic-router.service";

@Module({
    providers: [SemanticRouterService],
    exports: [SemanticRouterService],
})
export class SemanticRouterModule {}
