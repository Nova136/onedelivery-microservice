import { Test } from "@nestjs/testing";
import { IExportFileService } from "./adapter";
import { CSVOptionDto } from "./dto/csv-option.dto";
import { ExportFileService } from "./service";

describe('ExportFileService', () => {
  let exportFileService: IExportFileService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [],
      providers: [
        {
          provide: IExportFileService,
          useValue: new ExportFileService(),
        },
      ],
    }).compile();

    exportFileService = module.get(IExportFileService);
  })

  test('should return file sucess with no option', () => {
    const option: CSVOptionDto = {
      data: [
        {
          name: 'Test 1',
          age: 13,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        },
        {
          name: 'Test 2',
          age: 11,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        },
        {
          name: 'Test 4',
          age: 10,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        }
      ],
    }
    const file = exportFileService.exportCSV(option);
    expect(file).not.toBeNull();
  })

  test('should return file sucess with no option', () => {
    const option: CSVOptionDto = {
      data: [
        {
          name: 'Test 1',
          age: 13,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        },
        {
          name: 'Test 2',
          age: 11,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        },
        {
          name: 'Test 4',
          age: 10,
          average: 8.2,
          approved: true,
          description: "using 'Content here, content here' "
        }
      ],
      dataLimit: 1,
    }
    const file = exportFileService.exportCSV(option);
    expect(file).not.toBeNull();
  })

})