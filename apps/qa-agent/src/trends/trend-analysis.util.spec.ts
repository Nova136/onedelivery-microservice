import {
  analyzeIncidentTrends,
  getFallbackIssueSnippets,
} from './trend-analysis.util';

describe('trend-analysis.util', () => {
  it('resolves most common using priority order when counts tie', () => {
    const result = analyzeIncidentTrends(
      [
        { type: 'MISSING_ITEMS', createdAt: '2026-04-03T10:00:00.000Z' },
        { type: 'LATE_DELIVERY', createdAt: '2026-04-03T11:00:00.000Z' },
      ],
      [
        { type: 'WRONG_ORDER', createdAt: '2026-03-01T11:00:00.000Z' },
        { type: 'PAYMENT_FAILURE', createdAt: '2026-03-02T11:00:00.000Z' },
      ],
    );

    expect(result.mostCommon).toBe('LATE_DELIVERY');
    expect(result.percentage).toBe(50);
    expect(result.trend).toBe('stable');
    expect(result.peakTime).toBe('10:00-12:00');
  });

  it('returns deterministic fallback issue snippets from repeated summaries', () => {
    const issues = getFallbackIssueSnippets([
      { summary: 'Payment failed on mobile app checkout.' },
      { summary: 'Payment failed on mobile app checkout.' },
      { summary: 'Packaging damaged on arrival.' },
      { summary: 'Order FD-0000-000001 arrived late due to traffic.' },
    ]);

    expect(issues).toEqual([
      'Payment failed on mobile app checkout.',
      'Order FD-0000-000001 arrived late due to traffic.',
      'Packaging damaged on arrival.',
    ]);
  });
});