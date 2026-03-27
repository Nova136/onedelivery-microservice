import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KnowledgeService } from './knowledge.service';
import { Faq } from './database/entities/faq.entity';
import { Sop } from './database/entities/sop.entity';

jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
}));

describe('KnowledgeService', () => {
  let service: KnowledgeService;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockFaqRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSopRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: getRepositoryToken(Faq), useValue: mockFaqRepo },
        { provide: getRepositoryToken(Sop), useValue: mockSopRepo },
      ],
    }).compile();

    service = module.get<KnowledgeService>(KnowledgeService);
    jest.clearAllMocks();
    mockFaqRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
  });

  describe('listSops', () => {
    it('should return SOPs for the requesting agent', async () => {
      const sops = [{ intentCode: 'TRACK_ORDER', title: 'Track Order SOP', agentOwner: 'logistics-agent' }];
      mockSopRepo.find.mockResolvedValue(sops);

      const result = await service.listSops('logistics-agent');

      expect(mockSopRepo.find).toHaveBeenCalledWith({ where: { agentOwner: 'logistics-agent' } });
      expect(result).toEqual(sops);
    });

    it('should return empty array when no SOPs for agent', async () => {
      mockSopRepo.find.mockResolvedValue([]);

      const result = await service.listSops('unknown-agent');

      expect(result).toEqual([]);
    });
  });

  describe('searchFAQ', () => {
    it('should return matching FAQs using vector search', async () => {
      const faqs = [{ title: 'How to track', content: 'Use the app' }] as Faq[];
      mockQueryBuilder.getMany.mockResolvedValue(faqs);

      const result = await service.searchFAQ('how to track my order');

      expect(mockFaqRepo.createQueryBuilder).toHaveBeenCalledWith('faq');
      expect(result).toEqual(faqs);
    });

    it('should throw when the query fails', async () => {
      mockQueryBuilder.getMany.mockRejectedValue(new Error('DB error'));

      await expect(service.searchFAQ('test query')).rejects.toThrow(
        'Failed to execute vector search in the database.',
      );
    });
  });

  describe('searchInternalSOP', () => {
    it('should return a SOP matching intentCode and agentOwner', async () => {
      const sop = { intentCode: 'TRACK_ORDER', agentOwner: 'logistics-agent', title: 'Track Order' };
      mockSopRepo.findOne.mockResolvedValue(sop);

      const result = await service.searchInternalSOP('TRACK_ORDER', 'logistics-agent');

      expect(mockSopRepo.findOne).toHaveBeenCalledWith({
        where: { intentCode: 'TRACK_ORDER', agentOwner: 'logistics-agent' },
      });
      expect(result).toEqual(sop);
    });

    it('should return null when SOP not found', async () => {
      mockSopRepo.findOne.mockResolvedValue(null);

      const result = await service.searchInternalSOP('UNKNOWN_INTENT', 'agent');

      expect(result).toBeNull();
    });

    it('should throw when the query fails', async () => {
      mockSopRepo.findOne.mockRejectedValue(new Error('DB error'));

      await expect(service.searchInternalSOP('TRACK_ORDER', 'agent')).rejects.toThrow(
        'Failed to execute SOP lookup in the database.',
      );
    });
  });

  describe('addDocument', () => {
    it('should embed the title and save a new FAQ', async () => {
      const faq = { id: 'faq-1', title: 'My doc', content: 'Some content', embedding: [0.1, 0.2, 0.3] };
      mockFaqRepo.create.mockReturnValue(faq);
      mockFaqRepo.save.mockResolvedValue(faq);

      await service.addDocument('My doc', 'Some content');

      expect(mockFaqRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My doc', content: 'Some content' }),
      );
      expect(mockFaqRepo.save).toHaveBeenCalledWith(faq);
    });
  });
});
