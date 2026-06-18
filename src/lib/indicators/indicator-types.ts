
export type AllChartTimeframes = '1s' | '2s' | '5s' | '10s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h';

export const ALL_TIMEFRAME_SECONDS: Record<AllChartTimeframes, number> = {
    '1s': 1, '2s': 2, '5s': 5, '10s': 10, '15s': 15, '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600
};
