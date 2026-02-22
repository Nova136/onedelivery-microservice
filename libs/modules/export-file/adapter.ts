import { CSVOptionDto } from "./dto/csv-option.dto";

export abstract class IExportFileService {
  abstract exportCSV(options: CSVOptionDto):any;
}