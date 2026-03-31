import { Module } from "@nestjs/common";
import { IntentClassifierService } from "./intent-classifier.service";
import { KnowledgeClientModule } from "../clients/knowledge-client/knowledge-client.module";

@Module({
    imports: [KnowledgeClientModule],
    providers: [IntentClassifierService],
    exports: [IntentClassifierService],
})
export class IntentClassifierModule {}
