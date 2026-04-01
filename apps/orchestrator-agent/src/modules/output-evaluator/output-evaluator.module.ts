import { Module } from "@nestjs/common";
import { OutputEvaluatorService } from "./output-evaluator.service";

@Module({
    providers: [OutputEvaluatorService],
    exports: [OutputEvaluatorService],
})
export class OutputEvaluatorModule {}
