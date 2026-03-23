import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleEndChatSessionDto {
    @ApiProperty({ description: "The unique ID of the session" })
    sessionId!: string;
}
