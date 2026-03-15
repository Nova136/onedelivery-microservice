import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SearchFaqPayload {
    @ApiProperty({
        description:
            "The user query to semantic search against the knowledge base",
        example: "How do I cancel my order?",
    })
    @IsString()
    @IsNotEmpty()
    query: string;
}
