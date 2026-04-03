import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleAdminInputMessageDto {
    @ApiProperty({
        description: "The unique ID of the user",
        example: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
    })
    userId!: string;

    @ApiProperty({
        description: "The unique ID of the session",
        example: "5c895170-84a7-43bf-9e53-4a7414bbfaf4",
    })
    sessionId!: string;

    @ApiProperty({
        description: "The message content from the user",
        example: "Hello, i want help with my order",
    })
    message!: string;
}
