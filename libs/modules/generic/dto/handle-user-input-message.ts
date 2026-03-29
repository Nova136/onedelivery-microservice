import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleUserInputMessageDto {
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
