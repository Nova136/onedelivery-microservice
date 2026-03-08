// src/knowledge/knowledge.dto.ts
import { IsString, IsNotEmpty } from "class-validator";

export class AddDocumentDto {
    @IsString()
    @IsNotEmpty()
    content: string;

    @IsString()
    @IsNotEmpty()
    category: string;

    @IsString()
    @IsNotEmpty()
    title: string;
}
