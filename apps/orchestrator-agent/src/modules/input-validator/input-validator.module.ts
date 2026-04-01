import { Module } from "@nestjs/common";
import { InputValidatorService } from "./input-validator.service";

@Module({
    providers: [InputValidatorService],
    exports: [InputValidatorService],
})
export class InputValidatorModule {}
