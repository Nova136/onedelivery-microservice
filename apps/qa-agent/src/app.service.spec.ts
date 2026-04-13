import { AppService } from './app.service';

const mockLlmInvoke = jest.fn();
const mockAgentInvoke = jest.fn();
const mockStructuredInvoke = jest.fn();
const mockBindTools = jest.fn(() => ({ invoke: mockAgentInvoke }));
const mockWithStructuredOutput = jest.fn(() => ({ invoke: mockStructuredInvoke }));
const mockLogIncidentInvoke = jest.fn();
const mockSaveSentimentInvoke = jest.fn();
const mockGetIncidentsByDateRangeInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockLlmInvoke,
    bindTools: mockBindTools,
    withStructuredOutput: mockWithStructuredOutput,
  })),
}));

jest.mock('./tools/log-Incident.tool', () => ({
  createLogIncidentTool: jest.fn(() => ({
    name: 'log_incident',
    invoke: mockLogIncidentInvoke,
  })),
}));

jest.mock('./tools/save-sentiment.tool', () => ({
  createSaveSentimentTool: jest.fn(() => ({
    name: 'save_sentiment',
    invoke: mockSaveSentimentInvoke,
  })),
}));

jest.mock('./tools/get-incidents-by-date-range.tool', () => ({
  createGetIncidentsByDateRangeTool: jest.fn(() => ({
    name: 'get_incidents_by_date_range',
    invoke: mockGetIncidentsByDateRangeInvoke,
  })),
}));

describe('AppService', () => {
  let service: AppService;
  const memoryService = {
    getHistory: jest.fn(),
    saveHistory: jest.fn(),
  };
  const commonService = {
    sendViaRMQ: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AppService(
      memoryService as any,
      commonService as any,
      {} as any,
      {} as any,
    );
  });

  it('logs each distinct incident found in one reviewed session', async () => {
    commonService.sendViaRMQ
      .mockResolvedValueOnce({
        id: 'session-1',
        userId: 'user-1',
        reviewed: false,
        messages: [
          { type: 'human', content: 'My food arrived 45 minutes late.' },
          { type: 'human', content: 'Also the drink was missing from order ORD-1.' },
        ],
      })
      .mockResolvedValueOnce(undefined);

    mockAgentInvoke
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            id: 'tool-1',
            name: 'log_incident',
            args: {
              userId: 'user-1',
              orderId: 'ORD-1',
              type: 'LATE_DELIVERY',
              summary: 'Delivery arrived 45 minutes late.',
            },
          },
          {
            id: 'tool-2',
            name: 'log_incident',
            args: {
              userId: 'user-1',
              orderId: 'ORD-1',
              type: 'MISSING_ITEMS',
              summary: 'Drink missing from the order.',
            },
          },
          {
            id: 'tool-3',
            name: 'save_sentiment',
            args: {
              overallScore: -0.9,
              shouldEscalate: true,
              escalationReason: 'Customer reported multiple service failures.',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Review completed.',
        tool_calls: [],
      }),
    mockLogIncidentInvoke.mockResolvedValue('{"summary":"Incident logged successfully."}');
    mockSaveSentimentInvoke.mockResolvedValue('{"summary":"Sentiment saved successfully."}');

    const result = JSON.parse(
      await service.processChatMessageBySessionId('user-1', 'session-1'),
    );

    expect(mockLogIncidentInvoke).toHaveBeenCalledTimes(2);
    expect(mockLogIncidentInvoke).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      orderId: 'ORD-1',
      type: 'LATE_DELIVERY',
      summary: 'Delivery arrived 45 minutes late.',
    });
    expect(mockLogIncidentInvoke).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      orderId: 'ORD-1',
      type: 'MISSING_ITEMS',
      summary: 'Drink missing from the order.',
    });
    expect(mockSaveSentimentInvoke).toHaveBeenCalledTimes(1);
    expect(mockSaveSentimentInvoke).toHaveBeenCalledWith({
      sessionId: 'session-1',
      overallScore: -0.9,
      shouldEscalate: true,
      escalationReason: 'Customer reported multiple service failures.',
    });
    expect(commonService.sendViaRMQ).toHaveBeenNthCalledWith(
      2,
      {} as any,
      { cmd: 'user.chat.updateSession' },
      { id: 'session-1', reviewed: true },
    );
    expect(result).toEqual({
      status: 'INCIDENT_LOGGED',
      incident_count: 2,
      sentiment_captured: true,
      message: 'Logged 2 service failures.',
    });
  });

  it('computes trend metrics deterministically and uses AI only for issue synthesis', async () => {
    commonService.sendViaRMQ
      .mockResolvedValueOnce({
        incidents: [
          {
            type: 'LATE_DELIVERY',
            summary: 'Shipment delayed by 24h due to weather.',
            createdAt: '2026-03-01T09:46:24.000Z',
          },
          {
            type: 'DAMAGED_PACKAGING',
            summary: 'Customer feedback: packaging damaged.',
            createdAt: '2026-03-05T09:46:24.000Z',
          },
          {
            type: 'LATE_DELIVERY',
            summary: 'User cancelled order due to slow delivery.',
            createdAt: '2026-03-12T13:10:18.000Z',
          },
          {
            type: 'LATE_DELIVERY',
            summary: 'User cancelled order because it was taking too long.',
            createdAt: '2026-03-15T17:26:18.000Z',
          },
          {
            type: 'MISSING_ITEMS',
            summary: '1 Laksa was missing.',
            createdAt: '2026-03-20T18:58:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        incidents: [
          {
            type: 'LATE_DELIVERY',
            summary: 'Driver delayed in bad traffic.',
            createdAt: '2026-02-10T18:10:00.000Z',
          },
          {
            type: 'WRONG_ORDER',
            summary: 'Customer received the wrong meal.',
            createdAt: '2026-02-14T12:00:00.000Z',
          },
        ],
      });

    mockStructuredInvoke.mockResolvedValue({
      issues: [
        'late deliveries due to weather and delay spikes',
        'damaged packaging reported by customers',
        'missing items in completed orders',
      ],
    });

    const result = await service.analyzeTrends();

    expect(commonService.sendViaRMQ).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      totalByThisMonth: 5,
      mostCommon: 'LATE_DELIVERY',
      percentage: 60,
      trend: 'up',
      peakTime: '08:00-10:00',
      issues: [
        'late deliveries due to weather and delay spikes',
        'damaged packaging reported by customers',
        'missing items in completed orders',
      ],
    });
    expect(mockStructuredInvoke).toHaveBeenCalledTimes(1);
  });
});