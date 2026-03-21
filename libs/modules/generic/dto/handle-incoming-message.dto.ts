import { ApiProperty } from "@nestjs/swagger";

/** HTTP request body for POST /order */
export class HandleIncomingMessageDto {
    @ApiProperty({
        description: "The unique ID of the user",
        example: "79eb6c83-1851-466b-9d2f-b74aaa5d0f1c",
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
