import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleGetChatHistoryDto {

    @ApiProperty({ description: "The unique ID of the session" })
    sessionId!: string;
}
