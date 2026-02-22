import { Controller, Get, Post, Delete, Put, Body, Param, Query } from '@nestjs/common';
import { PageRequest } from '../dto/page.request';
import { PageResponse } from '../dto/page.response';
import { IBaseService } from '../service/generic.IService'


export class BaseController<T>{

	constructor(private readonly IBaseService: IBaseService<T>) {}

	@Get()
	async findAll(@Query() options: PageRequest): Promise<PageResponse<T>> {
		return this.IBaseService.getAll(options)
	}

	@Get(':id')
	async findById(@Param('id') id: any): Promise<T> {
		return this.IBaseService.getOne(id)
	}

	@Post('get-multiple')
	async findByIds(@Body() ids: any[]): Promise<T[]> {
		return this.IBaseService.getMany(ids)
	}

	@Post()
	async create(@Body() entity: T): Promise<T> {
		return this.IBaseService.create(entity);
	}

	@Delete(':id/hard-delete')
	async hardDelete(@Param('id') id: any) {
		this.IBaseService.hardDelete(id);
	}

	@Delete(':id/soft-delete')
	async softDelete(@Param('id') id: any) {
		this.IBaseService.softDelete(id);
	}

	@Put(':id')
	async update(@Param('id') id: any, @Body() entity: T): Promise<T> {
		return this.IBaseService.update(id, entity);
	}

}