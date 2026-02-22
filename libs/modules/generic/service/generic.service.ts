import { Injectable, Inject, BadGatewayException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { STATUS_CODES } from 'http';
import { IBaseService } from './generic.IService';
import { TypeOrmGenericRepository } from '../repository/typeorm.generic.repository';
import { PageResponse } from '../dto/page.response';
import { PageRequest } from '../dto/page.request';

export class BaseService<T> implements IBaseService<T>{
  constructor(
    private readonly genericRepository: TypeOrmGenericRepository<T>) {}

  create(entity: any): Promise<T> {
    return this.genericRepository.createOne(entity)
  }

  getAll(options: PageRequest): Promise<PageResponse<T>> {
    return this.genericRepository.getAll(options)
  }

  getOne(id: any): Promise<T> {
    return this.genericRepository.getOneById(id, "id")
  }

  getMany(ids: any[]): Promise<T[]> {
    return this.genericRepository.getManyByIds(ids, "id")
  }

  hardDelete(id: any) {
    return this.genericRepository.hardDeleteOne(id)
  }

  softDelete(id: any) {
    return this.genericRepository.softDeleteOne(id)
  }

  update(id: any, entity: any): Promise<any> {
    return this.genericRepository.updateOne(id, entity)
  }
}
