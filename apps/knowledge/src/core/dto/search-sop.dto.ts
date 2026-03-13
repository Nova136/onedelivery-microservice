import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SearchSopDto {
    @ApiProperty({
        description:
            "The unique intent code identifying the SOP (e.g., 'CANCEL_ORDER')",
        example: "CANCEL_ORDER",
    })
    @IsString()
    @IsNotEmpty()
    intentCode: string;

    @ApiProperty({
        description:
            "The identity of the agent requesting the SOP (e.g., 'orchestrator')",
        example: "orchestrator",
    })
    @IsString()
    @IsNotEmpty()
    requestingAgent: string;
}
