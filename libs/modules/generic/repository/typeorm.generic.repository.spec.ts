

import { MockUtils } from '@libs/utils/tests/in-memory-datasource';
import {
  DeleteResult,
  MoreThan,
  UpdateResult
} from 'typeorm';
import { PageRequest } from '../dto/page.request';
import { SortDirectionEnum } from '../enum/sort.direction.enum';
import { TypeOrmGenericRepository } from './typeorm.generic.repository';

export class TestEntity {
  id: number;
  name: string;
}

describe('TypeOrmGenericRepository', () => {
  let repository: TypeOrmGenericRepository<TestEntity>;

  beforeEach(async () => {
    const mock = {
      createEntityManager: () => {},
    };
    const dataSource = MockUtils.setMock(mock);
    const mockEntity = MockUtils.setMock({});
    repository = new TypeOrmGenericRepository(mockEntity, dataSource);
  });

  afterEach(() => {
    jest.resetAllMocks();
  })

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('createOrUpdate', async () => {
    const expectResult = {
      id: 1,
      name: "name"
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "save").mockResolvedValue(expectResult);
    const result = await repository.createOrUpdate(expectResult);

    expect(result.id).toEqual(expectResult.id);
  });

  it('createOrUpdateMany', async () => {
    const expectResults = [
      {
        id: 1,
        name: "name"
      },
      {
        id: 2,
        name: "name2"
      }
    ]
    jest.spyOn(TypeOrmGenericRepository.prototype, "save").mockResolvedValue(expectResults);
    const result = await repository.createOrUpdateMany(expectResults);

    expect(result.length).toEqual(expectResults.length);
    expect(result[0].id).toEqual(expectResults[0].id);
  });

  it('createOne', async () => {
    const expectResult = {
      id: 1,
      name: "name"
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "create").mockResolvedValue(expectResult);
    jest.spyOn(TypeOrmGenericRepository.prototype, "save").mockResolvedValue(expectResult);
    const result = await repository.createOne(expectResult);

    expect(result.id).toEqual(expectResult.id);
  });

  it('createMany', async () => {
    const expectResults = [
      {
        id: 1,
        name: "name"
      },
      {
        id: 2,
        name: "name2"
      }
    ]
    jest.spyOn(TypeOrmGenericRepository.prototype, "create").mockResolvedValue(expectResults);
    jest.spyOn(TypeOrmGenericRepository.prototype, "save").mockResolvedValue(expectResults);
    const result = await repository.createMany(expectResults);

    expect(result.length).toEqual(expectResults.length);
    expect(result[0].id).toEqual(expectResults[0].id);
  });

  it('updateOne', async () => {
    const expectId = 1;
    const entityLike = {
      id: expectId,
    };
    const expectResult: UpdateResult = {
      affected: 1,
      generatedMaps: [entityLike],
      raw: {},
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "update").mockResolvedValue(expectResult);
    const result = await repository.updateOne(expectId, entityLike);

    expect(result.affected).toEqual(expectResult.affected);
    expect(result.generatedMaps[0].id).toEqual(expectResult.generatedMaps[0].id);
  });

  it('updateMany', async () => {
    const expectId = 1;
    const entityLike = {
      id: expectId,
    };
    const expectResult: UpdateResult = {
      affected: 1,
      generatedMaps: [entityLike],
      raw: {},
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "update").mockResolvedValue(expectResult);
    const result = await repository.updateMany([expectId], entityLike);

    expect(result.affected).toEqual(expectResult.affected);
    expect(result.generatedMaps[0].id).toEqual(expectResult.generatedMaps[0].id);
  });

  it('getAll', async () => {
    const expectResult = [{
      id: 1,
      name: 'name 1',
    },
    {
      id: 2,
      name: 'name 2',
    }]
    jest.spyOn(TypeOrmGenericRepository.prototype, "findAndCount").mockResolvedValue([expectResult, expectResult.length]);

    const request: PageRequest = {
      limit: 10,
      page: 1,
      sortDirection: SortDirectionEnum.DESC,
      sortField: 'id',
    }
    const whereCondition = {
      id: MoreThan(0),
    }
    const result = await repository.getAll(request, whereCondition);

    expect(result.totalRecords).toEqual(expectResult.length);
  });

  it('getAll - no options', async () => {
    const expectResult = [{
      id: 1,
      name: 'name 1',
    },
    {
      id: 2,
      name: 'name 2',
    }]
    jest.spyOn(TypeOrmGenericRepository.prototype, "findAndCount").mockResolvedValue([expectResult, expectResult.length]);

    const request: PageRequest = new PageRequest({} as PageRequest);
    const whereCondition = {
      id: MoreThan(0),
    }
    const result = await repository.getAll(request, whereCondition);

    expect(result.totalRecords).toEqual(expectResult.length);
  });

  it('getAll - no page', async () => {
    const expectResult = [{
      id: 1,
      name: 'name 1',
    },
    {
      id: 2,
      name: 'name 2',
    }]
    jest.spyOn(TypeOrmGenericRepository.prototype, "findAndCount").mockResolvedValue([expectResult, expectResult.length]);

    const request: PageRequest = new PageRequest({
      limit: 10,
    } as PageRequest);
    const whereCondition = {
      id: MoreThan(0),
    }

    request.page = null;
    const result = await repository.getAll(request, whereCondition);

    expect(result.totalRecords).toEqual(expectResult.length);
  });

  it('getAll - no where condition', async () => {
    const expectResult = [{
      id: 1,
      name: 'name 1',
    },
    {
      id: 2,
      name: 'name 2',
    }]
    jest.spyOn(TypeOrmGenericRepository.prototype, "findAndCount").mockResolvedValue([expectResult, expectResult.length]);

    const request: PageRequest = {
      limit: 10,
      page: 1,
      sortDirection: SortDirectionEnum.DESC,
      sortField: 'id',
    }
    const result = await repository.getAll(request);

    expect(result.totalRecords).toEqual(expectResult.length);
  });

  it('getOneById', async () => {
    const expectResult = {
      id: "test",
      name: "name"
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "findOne").mockResolvedValue(expectResult);
    const result = await repository.getOneById(expectResult.id, "id");

    expect(result.id).toEqual(expectResult.id);
  });

  it('getManyByIds', async () => {
    const expectResult = [{
      id: 1,
      name: 'name 1',
    },
    {
      id: 2,
      name: 'name 2',
    }];

    jest.spyOn(TypeOrmGenericRepository.prototype, "find").mockResolvedValue(expectResult);

    const request = [1, 2]
    const result = await repository.getManyByIds(request, "id");

    expect(result.length).toEqual(expectResult.length);
    expect(result[0].id).toEqual(expectResult[0].id);
  });

  it('hardDeleteOne', async () => {
    const expectResult: DeleteResult = {
      affected: 1,
      raw: {},
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "delete").mockResolvedValue(expectResult);

    const request = 1;
    const result = await repository.hardDeleteOne(request);

    expect(result.affected).toEqual(expectResult.affected);
  });

  it('softDeleteOne', async () => {
    const expectId = 1;
    const entityLike = {
      id: expectId,
    };
    const expectResult: UpdateResult = {
      affected: 1,
      raw: {},
      generatedMaps: [entityLike],
    }
    jest.spyOn(TypeOrmGenericRepository.prototype, "softDelete").mockResolvedValue(expectResult);

    const result = await repository.softDeleteOne(expectId);

    expect(result.affected).toEqual(expectResult.affected);
  });
});
