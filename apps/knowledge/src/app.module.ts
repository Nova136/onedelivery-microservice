import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RolesGuard } from "@libs/utils/guards/roles.guard";
import { HealthModule } from "@libs/modules/health-check/health-check.module";
import { ClientAuthGuard } from "@libs/utils/guards/auth.guard";
import { KnowledgeModule } from "./knowledge.module";
import { Faq } from "./database/entities/faq.entity";
import { Sop } from "./database/entities/sop.entity";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env"],
        }),
        HealthModule,
        KnowledgeModule,
        PassportModule.register({ defaultStrategy: "jwt" }),
        TypeOrmModule.forRoot({
            type: "postgres",
            url:
                process.env.DATABASE_URL ??
                "postgresql://postgres:postgres@localhost:5432/onedelivery",
            schema: "logistics",
            entities: [Faq, Sop],
            synchronize: process.env.NODE_ENV !== "production",
        }),
        TypeOrmModule.forFeature([Faq, Sop]),
    ],
    controllers: [KnowledgeController],
    providers: [KnowledgeService, ClientAuthGuard],
})
export class AppModule {}
