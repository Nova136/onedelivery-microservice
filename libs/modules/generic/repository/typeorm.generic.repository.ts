import {
  DataSource,
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOptionsWhere,
  In,
  ObjectLiteral,
  Repository,
  UpdateResult,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PageRequest } from '../dto/page.request';
import { PageResponse } from '../dto/page.response';

export class TypeOrmGenericRepository<Entity extends ObjectLiteral> extends Repository<Entity> {
  constructor(entity, dataSource: DataSource) {
    super(entity, dataSource.createEntityManager());
  }

  public async createOrUpdate(entityLike: DeepPartial<Entity>) {
    return this.save(entityLike);
  }

  public async createOrUpdateMany(entitiesLike: DeepPartial<Entity>[]) {
    return this.save(entitiesLike);
  }

  public async createOne(entityLike: DeepPartial<Entity>): Promise<Entity> {
    let saveEntity = this.create(entityLike);
    return this.save(saveEntity);
  }

  public async createMany(entityLikeArray: DeepPartial<Entity>[]): Promise<Entity[]> {
    let saveEntities = this.create(entityLikeArray);
    return this.save(saveEntities);
  }

  public async updateOne(id: any, entityLike: QueryDeepPartialEntity<Entity>): Promise<UpdateResult> {
    return this.update(id, entityLike);
  }

  public async updateMany(ids: any[], entitiyLike: QueryDeepPartialEntity<Entity>): Promise<UpdateResult> {
    return this.update(ids, entitiyLike);
  }

  public async getAll(options: PageRequest, whereCondition: FindOptionsWhere<Entity> = null) {
    const { limit, page } = options;

    const findAndCountOption: FindManyOptions<Entity> = {};

    if (!!whereCondition) {
      findAndCountOption.where = whereCondition;
    }
    console.log([limit, page]);

    if (!!limit && !!page) {
      findAndCountOption.skip = (page - 1) * limit;
      findAndCountOption.take = limit;
    } else if (!!limit) {
      findAndCountOption.take = limit;
    }

    if (!!options.sortField) {
      const orderOption: any = {
        [options.sortField]: options.sortDirection,
      };
      findAndCountOption.order = orderOption;
    }

    const [data, total] = await this.findAndCount(findAndCountOption);

    return new PageResponse(data, options, total);
  }

  public async getOneById(id: any, itemIdKey: string) {
    const whereOption: any = {
      [itemIdKey]: id,
    };
    // fix nosql_injection for findOne
    return this.find({
      where: whereOption,
      take: 1,
    })[0];
  }

  public async getManyByIds(ids: any[], itemIdKey: string) {
    const whereOption: any = {
      [itemIdKey]: In(ids),
    };
    return this.find({
      where: whereOption,
    });
  }

  public async hardDeleteOne(id: any): Promise<DeleteResult> {
    return this.delete(id);
  }

  public async softDeleteOne(id: any): Promise<UpdateResult> {
    return this.softDelete(id);
  }
}
