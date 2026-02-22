import { Injectable } from "@nestjs/common";
import { ExportToCsv } from 'export-to-csv';
import { IExportFileService } from "./adapter";
import { CSVOptionDto } from "./dto/csv-option.dto";

@Injectable()
export class ExportFileService implements IExportFileService{
  public exportCSV(options: CSVOptionDto) {
    const isLimitExportData = !!options?.dataLimit && options?.dataLimit >= 0;
    const exportData = isLimitExportData ? options.data.slice(0, options.dataLimit) : options.data;
    const csvExporter = new ExportToCsv({
      useKeysAsHeaders: true,
      title: 'Untitle',
      ...options,
      useTextFile: false,
    });
    return csvExporter.generateCsv(exportData, true);
  }
}