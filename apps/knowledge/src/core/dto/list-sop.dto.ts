import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ListSopPayload {
    @ApiProperty({
        description:
            "The identity of the agent requesting the SOP (e.g., 'orchestrator')",
        example: "orchestrator",
    })
    @IsString()
    @IsNotEmpty()
    requestingAgent: string;
}
