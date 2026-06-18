
import { type OHLC } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface TickStochasticSettings {
    kPeriod: number;
    kSlowing: number;
    dPeriod: number;
}

export interface TickStochasticArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface TickStochasticResult {
    kLine: { time: number; value: number }[];
    dLine: { time: number; value: number }[];
    arrows: TickStochasticArrow[];
}


// --- Helper Functions ---
const sma = (data: (number | undefined)[], period: number): (number | undefined)[] => {
    const result: (number | undefined)[] = [];
    let firstValidIndex = -1;
    for (let i = 0; i < data.length; i++) {
        if (data[i] !== undefined) {
            firstValidIndex = i;
            break;
        }
    }

    if (firstValidIndex === -1 || data.length < firstValidIndex + period) {
        return new Array(data.length).fill(undefined);
    }
    
    for (let i = 0; i < firstValidIndex + period - 1; i++) {
        result.push(undefined);
    }

    let sum = 0;
    for (let i = firstValidIndex; i < firstValidIndex + period; i++) {
        sum += data[i]!;
    }
    result[firstValidIndex + period - 1] = sum / period;

    for (let i = firstValidIndex + period; i < data.length; i++) {
        const prevValue = data[i - period];
        if (prevValue !== undefined) {
           sum = sum - prevValue + data[i]!;
           result.push(sum / period);
        } else {
           // Recalculate sum if there's a gap
           sum = 0;
           for(let j = i - period + 1; j <= i; j++) {
              sum += data[j]!;
           }
           result.push(sum/period);
        }
    }
    return result;
};


// --- Main Stochastic Calculation ---
export function calculateTickStochastic(
    ohlc: OHLC[],
    settings: TickStochasticSettings
): TickStochasticResult {
    const { kPeriod, kSlowing, dPeriod } = settings;
    
    if (ohlc.length < kPeriod) {
        return { kLine: [], dLine: [], arrows: [] };
    }

    const stochasticValues: (number | undefined)[] = [];
    for (let i = 0; i < ohlc.length; i++) {
        if (i < kPeriod - 1) {
            stochasticValues.push(undefined);
            continue;
        }

        const slice = ohlc.slice(i - kPeriod + 1, i + 1);
        const lowestLow = Math.min(...slice.map(d => d.low));
        const highestHigh = Math.max(...slice.map(d => d.high));
        const currentClose = ohlc[i].close;

        if (highestHigh === lowestLow) {
            stochasticValues.push(100);
        } else {
            stochasticValues.push(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100);
        }
    }

    const kValues = sma(stochasticValues, kSlowing);
    const dValues = sma(kValues, dPeriod);

    const kLine: { time: number, value: number }[] = [];
    const dLine: { time: number, value: number }[] = [];
    const arrows: TickStochasticArrow[] = [];

    for (let i = 1; i < ohlc.length; i++) {
        const time = ohlc[i].time;
        const kVal = kValues[i];
        const dVal = dValues[i];

        if (time !== undefined && kVal !== undefined) {
            kLine.push({ time, value: kVal });
        }
        if (time !== undefined && dVal !== undefined) {
            dLine.push({ time, value: dVal });
        }

        const prevKVal = kValues[i-1];
        const prevDVal = dValues[i-1];

        if (prevKVal !== undefined && prevDVal !== undefined && kVal !== undefined && dVal !== undefined) {
            if (prevKVal <= prevDVal && kVal > dVal) { // Crossover up
                arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].low, 
                    type: 'buy', 
                    text: 'Stoch Buy' 
                });
            }
            if (prevKVal >= prevDVal && kVal < dVal) { // Crossover down
                arrows.push({ 
                    time: ohlc[i].time, 
                    price: ohlc[i].high, 
                    type: 'sell', 
                    text: 'Stoch Sell' 
                });
            }
        }
    }

    return { kLine, dLine, arrows };
}
