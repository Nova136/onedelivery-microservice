import { Module } from "@nestjs/common";
import { IExportFileService } from "./adapter";
import { ExportFileService } from "./service";

@Module({
  providers: [
    {
      provide: IExportFileService,
      useFactory: () => {
        return new ExportFileService()
      },
    },
  ],
  exports: [IExportFileService],
})
export class ExportFileModule {}
