// Mock entities to avoid circular references (ChatSession <-> Sentiment, ChatSession <-> ChatMessage)
jest.mock('../database/entities/chat-session.entity', () => {
  class ChatSession {}
  return { ChatSession };
});
jest.mock('../database/entities/chat-message.entity', () => {
  class ChatMessage {}
  return { ChatMessage };
});
jest.mock('../database/entities/sentiment.entity', () => {
  class Sentiment {}
  return { Sentiment };
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatSession } from '../database/entities/chat-session.entity';

describe('ChatService', () => {
  let service: ChatService;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };

  const mockChatMessageRepo = {
    save: jest.fn(),
  };

  const mockChatSessionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatMessage), useValue: mockChatMessageRepo },
        { provide: getRepositoryToken(ChatSession), useValue: mockChatSessionRepo },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    jest.clearAllMocks();
    mockChatSessionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.leftJoinAndSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.addOrderBy.mockReturnThis();
  });

  describe('getHistory', () => {
    it('should return empty history for new session', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await service.getHistory({ userId: 'user-1', sessionId: 'session-1' });

      expect(result).toEqual(
        expect.objectContaining({
          id: 'session-1',
          userId: 'user-1',
          status: 'OPEN',
          messages: [],
          summary: '',
          lastSummarizedSequence: 0,
        }),
      );
    });

    it('should return session with mapped messages when session exists', async () => {
      const now = new Date();
      const session = {
        id: 'session-1',
        userId: 'user-1',
        status: 'OPEN',
        reviewed: false,
        createdAt: now,
        updatedAt: now,
        summary: 'test summary',
        lastSummarizedSequence: 3,
        messages: [
          { id: 'msg-1', type: 'human', content: 'Hello', toolCallId: null, sequence: 1, createdAt: now },
        ],
      };
      mockQueryBuilder.getOne.mockResolvedValue(session);

      const result = await service.getHistory({ userId: 'user-1', sessionId: 'session-1' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        id: 'msg-1',
        type: 'human',
        content: 'Hello',
        toolCallId: null,
        sequence: 1,
        createdAt: now,
      });
      expect(result.summary).toBe('test summary');
    });
  });

  describe('saveHistory', () => {
    it('should create a new session and save message if session does not exist', async () => {
      const session = { id: 'session-1', userId: 'user-1', status: 'OPEN' };
      mockChatSessionRepo.findOne.mockResolvedValue(null);
      mockChatSessionRepo.create.mockReturnValue(session);
      mockChatSessionRepo.save.mockResolvedValue(session);
      mockChatMessageRepo.save.mockResolvedValue({});

      await service.saveHistory({
        userId: 'user-1',
        sessionId: 'session-1',
        message: { type: 'human', content: 'Hi', sequence: 1 },
      });

      expect(mockChatSessionRepo.create).toHaveBeenCalledWith({
        id: 'session-1',
        status: 'OPEN',
        userId: 'user-1',
      });
      expect(mockChatMessageRepo.save).toHaveBeenCalled();
    });

    it('should reuse existing session', async () => {
      const session = { id: 'session-1', userId: 'user-1', status: 'OPEN' };
      mockChatSessionRepo.findOne.mockResolvedValue(session);
      mockChatMessageRepo.save.mockResolvedValue({});

      await service.saveHistory({
        userId: 'user-1',
        sessionId: 'session-1',
        message: { type: 'ai', content: 'Hello back', sequence: 2 },
      });

      expect(mockChatSessionRepo.create).not.toHaveBeenCalled();
      expect(mockChatMessageRepo.save).toHaveBeenCalled();
    });
  });

  describe('updateSession', () => {
    it('should update the reviewed flag for a session', async () => {
      mockChatSessionRepo.update.mockResolvedValue({});

      await service.updateSession({ id: 'session-1', reviewed: true });

      expect(mockChatSessionRepo.update).toHaveBeenCalledWith('session-1', { reviewed: true });
    });
  });

  describe('updateSummary', () => {
    it('should update summary and lastSummarizedSequence', async () => {
      mockChatSessionRepo.update.mockResolvedValue({});

      await service.updateSummary({ id: 'session-1', summary: 'recap', lastSummarizedSequence: 5 });

      expect(mockChatSessionRepo.update).toHaveBeenCalledWith('session-1', {
        summary: 'recap',
        lastSummarizedSequence: 5,
      });
    });
  });

  describe('endChatSession', () => {
    it('should set session status to CLOSED', async () => {
      mockChatSessionRepo.update.mockResolvedValue({});

      await service.endChatSession('user-1', 'session-1');

      expect(mockChatSessionRepo.update).toHaveBeenCalledWith(
        { id: 'session-1', userId: 'user-1' },
        { status: 'CLOSED' },
      );
    });
  });

  describe('getChatHistoryListing', () => {
    it('should return session list without messages', async () => {
      const now = new Date();
      const sessions = [
        { id: 's-1', userId: 'user-1', status: 'CLOSED', reviewed: true, createdAt: now, updatedAt: now },
      ];
      mockChatSessionRepo.find.mockResolvedValue(sessions);

      const result = await service.getChatHistoryListing('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].messages).toEqual([]);
      expect(result[0].id).toBe('s-1');
    });
  });
});
