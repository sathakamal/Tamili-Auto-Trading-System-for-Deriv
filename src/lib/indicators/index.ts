

import {
  UTCTimestamp,
} from 'lightweight-charts';
import { AllChartTimeframes } from './indicator-types';


// --- Types ---
export interface OHLC {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type MtfTimeframe = 'current' | '1m' | '5m' | '15m' | '1h';

export type Arrow = {
  time: UTCTimestamp;
  price: number;
  direction: 'up' | 'down';
  tooltip: string;
  type: 'crossover' | 'level';
};

    
