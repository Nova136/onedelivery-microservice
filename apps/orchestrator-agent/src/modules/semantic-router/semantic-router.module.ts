import { Module } from "@nestjs/common";
import { SemanticRouterService } from "./semantic-router.service";
import { KnowledgeClientModule } from "../clients/knowledge-client/knowledge-client.module";

@Module({
    imports: [KnowledgeClientModule],
    providers: [SemanticRouterService],
    exports: [SemanticRouterService],
})
export class SemanticRouterModule {}
