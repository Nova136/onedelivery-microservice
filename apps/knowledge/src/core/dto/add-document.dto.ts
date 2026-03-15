// src/knowledge/knowledge.dto.ts
import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AddDocumentPayload {
    @ApiProperty({
        description: "The title of the FAQ document",
        example: "Refund Policy",
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: "The detailed content of the FAQ document",
        example: "Refunds are processed within 3-5 business days...",
    })
    @IsString()
    @IsNotEmpty()
    content: string;
}
