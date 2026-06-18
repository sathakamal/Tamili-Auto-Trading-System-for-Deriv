import { type OHLC } from '@/lib/types';
import { UTCTimestamp } from 'lightweight-charts';

// --- Type Definitions ---
export interface HighLow3MASettings {
    repaint: boolean; // Not used in this logic, but kept for UI consistency
    lagBar: number;
    atrPeriod: number;
    atrMultiplier: number;
}

export interface HighLow3MAArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface HighLow3MAResult {
    arrows: HighLow3MAArrow[];
}

// --- Helper: Average True Range (ATR) ---
const calculateATR = (ohlc: OHLC[], period: number): (number | undefined)[] => {
    if (ohlc.length < period) return new Array(ohlc.length).fill(undefined);

    const trValues: (number | undefined)[] = [undefined];
    for (let i = 1; i < ohlc.length; i++) {
        const high = ohlc[i].high;
        const low = ohlc[i].low;
        const prevClose = ohlc[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trValues.push(tr);
    }
    
    const atr: (number | undefined)[] = new Array(period).fill(undefined);
    
    // Initial SMA for the first ATR value
    let sum = 0;
    for (let i = 1; i <= period; i++) {
        if(trValues[i] === undefined) continue;
        sum += trValues[i]!;
    }
    atr[period] = sum / period;

    // Subsequent ATR values using Wilder's smoothing
    for (let i = period + 1; i < ohlc.length; i++) {
        const currentTR = trValues[i];
        const prevATR = atr[i - 1];
        if (currentTR !== undefined && prevATR !== undefined) {
             atr.push(((prevATR * (period - 1)) + currentTR) / period);
        } else {
             atr.push(prevATR);
        }
    }
    
    return atr;
};

// --- Main HIGH LOW 3MA Calculation (MT4 Swing Logic) ---
export function calculateHighLow3MA(
    ohlc: OHLC[],
    settings: HighLow3MASettings
): HighLow3MAResult {
    const { lagBar, atrPeriod, atrMultiplier } = settings;
    
    if (ohlc.length < 5 + lagBar) {
        return { arrows: [] };
    }

    const atrValues = calculateATR(ohlc, atrPeriod);
    const arrows: HighLow3MAArrow[] = [];
    let trend: number[] = new Array(ohlc.length).fill(0);

    for (let i = 4 + lagBar; i < ohlc.length; i++) {
        const mtf = ohlc[i];
        const mtf1 = ohlc[i - 1];
        const mtf2 = ohlc[i - 2];
        const mtf3 = ohlc[i - 3];
        const mtf4 = ohlc[i - 4];
        
        const signalBar = ohlc[i-lagBar];
        if (!signalBar) continue;

        const signalBarVolume = signalBar.volume;
        const volumeCondition = signalBarVolume === undefined || signalBarVolume > 1;

        const body1 = Math.abs(mtf1.open - mtf1.close);
        const body2 = Math.abs(mtf2.open - mtf2.close);
        const body3 = Math.abs(mtf3.open - mtf3.close);
        const body4 = Math.abs(mtf4.open - mtf4.close);

        let currentTrend = 0;
        
        // Buy Condition
        if (mtf2.high < mtf.low && body1 > body2 && body1 > body3 && body1 > body4 && volumeCondition) {
            currentTrend = 1;
        }
        
        // Sell Condition
        if (mtf2.low > mtf.high && body1 > body2 && body1 > body3 && body1 > body4 && volumeCondition) {
            currentTrend = -1;
        }

        trend[i] = currentTrend;

        if (trend[i] !== trend[i - 1] && trend[i] !== 0) {
            const gap = (atrValues[i] || 0) * atrMultiplier;
            
            if (trend[i] === 1) {
                arrows.push({
                    time: signalBar.time,
                    price: signalBar.low - gap,
                    type: 'buy',
                    text: 'HL 3MA Buy'
                });
            } else if (trend[i] === -1) {
                arrows.push({
                    time: signalBar.time,
                    price: signalBar.high + gap,
                    type: 'sell',
                    text: 'HL 3MA Sell'
                });
            }
        }
    }
    
    return { arrows };
}
