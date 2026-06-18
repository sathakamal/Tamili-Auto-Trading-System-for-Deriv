
import { type OHLC } from '@/lib/types';

export interface TickMomentumSettings {
    fastMAPeriod: number;
    slowMAPeriod: number;
}

export interface TickMomentumArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface TickMomentumResult {
    histogram: { time: number; value: number }[];
    arrows: TickMomentumArrow[];
}

const sma = (data: number[], period: number): (number | undefined)[] => {
  if (data.length < period) {
    return new Array(data.length).fill(undefined);
  }

  const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result.push(sum / period);

  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period] + data[i];
    result.push(sum / period);
  }
  return result;
};


export function calculateTickMomentum(
    ohlc: OHLC[],
    settings: TickMomentumSettings
): TickMomentumResult {
    const { fastMAPeriod, slowMAPeriod } = settings;
    const closePrices = ohlc.map(d => d.close);

    if (closePrices.length < slowMAPeriod) {
        return { histogram: [], arrows: [] };
    }

    const fastMA = sma(closePrices, fastMAPeriod);
    const slowMA = sma(closePrices, slowMAPeriod);

    const histogram: { time: number; value: number }[] = [];
    const arrows: TickMomentumArrow[] = [];
    
    let prevHistValue: number | undefined = undefined;

    for (let i = 0; i < ohlc.length; i++) {
        const fastVal = fastMA[i];
        const slowVal = slowMA[i];

        if (fastVal !== undefined && slowVal !== undefined) {
            const histValue = fastVal - slowVal;
            histogram.push({ time: ohlc[i].time, value: histValue });

            // Arrow logic (zero-line crossover)
            if (prevHistValue !== undefined) {
                if (prevHistValue <= 0 && histValue > 0) { // Crosses up from below
                    arrows.push({ 
                        time: ohlc[i].time, 
                        price: ohlc[i].low, 
                        type: 'buy', 
                        text: 'Momentum Buy' 
                    });
                }
                if (prevHistValue >= 0 && histValue < 0) { // Crosses down from above
                    arrows.push({ 
                        time: ohlc[i].time, 
                        price: ohlc[i].high, 
                        type: 'sell', 
                        text: 'Momentum Sell' 
                    });
                }
            }
            prevHistValue = histValue;
        } else {
             if (histogram.length > 0) {
                 // Push dummy data to keep array length consistent
                 histogram.push({ time: ohlc[i].time, value: histogram[histogram.length-1].value });
             }
        }
    }
    
    return { histogram, arrows };
}
