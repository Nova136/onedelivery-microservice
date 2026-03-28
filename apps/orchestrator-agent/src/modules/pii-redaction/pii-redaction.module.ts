import { Module } from "@nestjs/common";
import { PiiRedactionService } from "./pii-redaction.service";

@Module({
    providers: [PiiRedactionService],
    exports: [PiiRedactionService],
})
export class PiiRedactionModule {}
