// src/core/dto/execute-logistics-task.dto.ts
import { IsString, IsEnum, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum LogisticsAction {
    CANCEL_ORDER = "cancel_order",
    // Add future actions here like TRACK_ORDER, etc.
}

export class ExecuteLogisticsTaskDto {
    @ApiProperty({
        enum: LogisticsAction,
        description: "The specific task to perform",
    })
    @IsEnum(LogisticsAction)
    action: LogisticsAction;

    @ApiProperty()
    @IsString()
    userId: string;

    @ApiProperty()
    @IsString()
    sessionId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    orderId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;
}
