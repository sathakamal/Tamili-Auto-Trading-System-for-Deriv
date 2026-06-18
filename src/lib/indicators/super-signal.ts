
import { type Candle, type Arrow } from '@/lib/types';

export interface SuperSignalSettings {
    period: number;
    atrPeriod: number;
    useFilter: boolean;
    filterPeriod: number;
}

export interface SuperSignalResult {
    arrows: Arrow[];
    signals: { value: number; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[];
}

const calculateATR = (ohlc: Candle[], period: number): (number | undefined)[] => {
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
    
    let sum = 0;
    for (let i = 1; i <= period; i++) {
        if(trValues[i] === undefined) continue;
        sum += trValues[i]!;
    }
    atr[period] = sum / period;

    for (let i = period + 1; i < ohlc.length; i++) {
        const currentTR = trValues[i];
        const prevATR = atr[i-1];
        if (currentTR !== undefined && prevATR !== undefined) {
             atr.push(((prevATR * (period - 1)) + currentTR) / period);
        } else {
             atr.push(prevATR);
        }
    }
    
    while(atr.length < ohlc.length) atr.push(atr[atr.length - 1]);
    
    return atr;
};


const sma = (data: number[], period: number): (number | undefined)[] => {
    if (data.length < period) return new Array(data.length).fill(undefined);
    const result: (number | undefined)[] = new Array(period - 1).fill(undefined);
    let sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
    for (let i = period; i < data.length; i++) {
        sum = sum - data[i - period] + data[i];
        result.push(sum / period);
    }
    return result;
};


export function calculateSuperSignal(
    ohlc: Candle[],
    settings: SuperSignalSettings
): SuperSignalResult {
    const { period, atrPeriod, useFilter, filterPeriod } = settings;
    const signals: SuperSignalResult['signals'] = [];
    const arrows: Arrow[] = [];
    
    if (ohlc.length < Math.max(period, atrPeriod) + 1) {
        return { arrows: [], signals: [] };
    }

    const atrValues = calculateATR(ohlc, atrPeriod);
    const filterMA = useFilter ? sma(ohlc.map(c => c.close), filterPeriod) : new Array(ohlc.length).fill(undefined);
    
    const upperBasic = ohlc.map((c, i) => atrValues[i] !== undefined ? ((c.high + c.low) / 2) + (period * atrValues[i]!) : undefined);
    const lowerBasic = ohlc.map((c, i) => atrValues[i] !== undefined ? ((c.high + c.low) / 2) - (period * atrValues[i]!) : undefined);
    
    const finalUpperBand: (number | undefined)[] = [];
    const finalLowerBand: (number | undefined)[] = [];
    const supertrend: (number | undefined)[] = [];
    let trend = 1; // 1 for bullish, -1 for bearish
    
    for (let i = 0; i < ohlc.length; i++) {
        const ub = upperBasic[i];
        const lb = lowerBasic[i];
        const prevFinalUpper = i > 0 ? finalUpperBand[i-1] : undefined;
        const prevFinalLower = i > 0 ? finalLowerBand[i-1] : undefined;
        const prevClose = i > 0 ? ohlc[i-1].close : undefined;

        if (ub === undefined || lb === undefined) {
            finalUpperBand.push(undefined);
            finalLowerBand.push(undefined);
            supertrend.push(undefined);
            continue;
        }

        // --- Final Upper Band ---
        let currentFinalUpper: number;
        if (prevFinalUpper !== undefined && prevClose !== undefined) {
             currentFinalUpper = (ub < prevFinalUpper || prevClose > prevFinalUpper) ? ub : prevFinalUpper;
        } else {
            currentFinalUpper = ub;
        }
        finalUpperBand.push(currentFinalUpper);
        
        // --- Final Lower Band ---
        let currentFinalLower: number;
        if (prevFinalLower !== undefined && prevClose !== undefined) {
            currentFinalLower = (lb > prevFinalLower || prevClose < prevFinalLower) ? lb : prevFinalLower;
        } else {
            currentFinalLower = lb;
        }
        finalLowerBand.push(currentFinalLower);

        // --- SuperTrend and Trend Direction ---
        let prevSupertrend = i > 0 ? supertrend[i-1] : undefined;
        let currentSupertrend: number;

        if (prevSupertrend === undefined) {
            currentSupertrend = trend === 1 ? currentFinalLower : currentFinalUpper;
        } else {
             if (trend === -1 && ohlc[i].close > prevSupertrend) {
                trend = 1;
             } else if (trend === 1 && ohlc[i].close < prevSupertrend) {
                trend = -1;
             }
        }
        
        currentSupertrend = trend === 1 ? currentFinalLower : currentFinalUpper;
        supertrend.push(currentSupertrend);
    }
    
    // Generate signals and arrows based on trend changes
    for (let i = 1; i < ohlc.length; i++) {
        const prevSupertrendVal = supertrend[i-1];
        const currentSupertrendVal = supertrend[i];
        
        let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
        
        if (prevSupertrendVal !== undefined && currentSupertrendVal !== undefined) {
            // A buy signal is when the line flips from being above the price to below the price
            const isBuyFlip = ohlc[i].close > currentSupertrendVal && ohlc[i-1].close <= prevSupertrendVal;
            // A sell signal is when the line flips from being below the price to above the price
            const isSellFlip = ohlc[i].close < currentSupertrendVal && ohlc[i-1].close >= prevSupertrendVal;
            
            const trendFilterMA = filterMA[i];
            const close = ohlc[i].close;

            // Apply trend filter if enabled
            const isBuyAllowed = !useFilter || (trendFilterMA !== undefined && close > trendFilterMA);
            const isSellAllowed = !useFilter || (trendFilterMA !== undefined && close < trendFilterMA);

            if (isBuyFlip) {
                if (isBuyAllowed) {
                    signal = 'BULLISH';
                    arrows.push({
                        time: ohlc[i].epoch,
                        price: ohlc[i].low,
                        direction: 'up',
                        type: 'crossover',
                        tooltip: 'SuperSignal Buy'
                    });
                }
            } else if (isSellFlip) {
                 if (isSellAllowed) {
                    signal = 'BEARISH';
                    arrows.push({
                        time: ohlc[i].epoch,
                        price: ohlc[i].high,
                        direction: 'down',
                        type: 'crossover',
                        tooltip: 'SuperSignal Sell'
                    });
                 }
            }
        }

        const trendValue = supertrend[i] !== undefined && ohlc[i].close > supertrend[i]! ? 1 : -1;
        signals.push({
            value: trendValue,
            signal: trendValue === 1 ? 'BULLISH' : 'BEARISH'
        });
    }

    return { arrows, signals };
}
