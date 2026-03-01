import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleIncomingMessageDto {
    @ApiProperty({ description: "The unique ID of the user" })
    userId!: string;

    @ApiProperty({ description: "The unique ID of the session" })
    sessionId!: string;

    @ApiProperty({ description: "The message content from the user" })
    message!: string;
}
