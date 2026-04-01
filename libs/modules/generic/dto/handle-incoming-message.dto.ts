import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleIncomingMessageDto {
    @ApiProperty({
        description: "The unique ID of the user",
        example: "83593ca4-b975-4fef-a521-4a2a8d72dd81",
    })
    userId!: string;

    @ApiProperty({
        description: "The unique ID of the session",
        example: "5d6a61f4-7ad1-49be-a74b-7d709108cb68",
    })
    sessionId!: string;

    @ApiProperty({
        description: "The message content from the user",
        example: "Hello, I have a question about my order.",
    })
    message!: string;
}
