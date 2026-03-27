import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorAgentController } from './orchestrator-agent.controller';
import { OrchestratorAgentService } from './orchestrator-agent.service';
import { MemoryService } from './modules/memory/memory.service';

describe('OrchestratorAgentController', () => {
  let controller: OrchestratorAgentController;

  const mockOrchestratorService = {
    processChat: jest.fn(),
  };

  const mockMemoryService = {
    getHistoryListing: jest.fn(),
    getChatHistory: jest.fn(),
    endChatSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestratorAgentController],
      providers: [
        { provide: OrchestratorAgentService, useValue: mockOrchestratorService },
        { provide: MemoryService, useValue: mockMemoryService },
      ],
    }).compile();

    controller = module.get<OrchestratorAgentController>(OrchestratorAgentController);
    jest.clearAllMocks();
  });

  describe('handleIncomingMessage', () => {
    it('should call processChat and return reply', async () => {
      mockOrchestratorService.processChat.mockResolvedValue('Hello!');

      const result = await controller.handleIncomingMessage({
        userId: 'user-1',
        sessionId: 'session-1',
        message: 'Hi',
      });

      expect(mockOrchestratorService.processChat).toHaveBeenCalledWith('user-1', 'session-1', 'Hi');
      expect(result).toEqual({ reply: 'Hello!' });
    });
  });

  describe('handleUserInputMessage', () => {
    it('should call processChat with customer id from guard', async () => {
      mockOrchestratorService.processChat.mockResolvedValue('Response from agent');

      const result = await controller.handleUserInputMessage('cust-1', {
        sessionId: 'session-1',
        message: 'Track my order',
      });

      expect(mockOrchestratorService.processChat).toHaveBeenCalledWith('cust-1', 'session-1', 'Track my order');
      expect(result).toEqual({ message: 'Response from agent' });
    });
  });

  describe('getUserChatSession', () => {
    it('should return history listing for user', async () => {
      const listing = [{ id: 's-1', status: 'OPEN' }];
      mockMemoryService.getHistoryListing.mockResolvedValue(listing);

      const result = await controller.getUserChatSession('cust-1');

      expect(mockMemoryService.getHistoryListing).toHaveBeenCalledWith('cust-1');
      expect(result).toEqual(listing);
    });
  });

  describe('getChatHistory', () => {
    it('should return chat history for a session', async () => {
      const history = { messages: [], summary: '' };
      mockMemoryService.getChatHistory.mockResolvedValue(history);

      const result = await controller.getChatHistory('cust-1', { sessionId: 'session-1' });

      expect(mockMemoryService.getChatHistory).toHaveBeenCalledWith('cust-1', 'session-1');
      expect(result).toEqual(history);
    });
  });

  describe('endChatSession', () => {
    it('should end the chat session', async () => {
      mockMemoryService.endChatSession.mockResolvedValue(undefined);

      await controller.endChatSession('cust-1', { sessionId: 'session-1' });

      expect(mockMemoryService.endChatSession).toHaveBeenCalledWith('cust-1', 'session-1');
    });
  });
});
