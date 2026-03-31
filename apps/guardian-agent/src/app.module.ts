import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "@libs/modules/health-check/health-check.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    HealthModule,
    KnowledgeModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
