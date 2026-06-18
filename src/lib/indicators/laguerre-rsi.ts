
import { type OHLC, type LineData } from '@/lib/types';

// --- Type Definitions ---
export interface LaguerreRsiSettings {
    gamma: number;
    levelUp: number;
    levelDown: number;
}

export interface LaguerreRsiArrow {
    time: number;
    price: number;
    type: 'buy' | 'sell';
    text: string;
}

export interface LaguerreRsiResult {
    rsiLine: LineData[];
    arrows: LaguerreRsiArrow[];
}


// --- Main Laguerre RSI Calculation ---
export function calculateLaguerreRSI(
    ohlc: OHLC[],
    settings: LaguerreRsiSettings
): LaguerreRsiResult {
    const { gamma, levelUp, levelDown } = settings;
    
    if (ohlc.length < 2) {
        return { rsiLine: [], arrows: [] };
    }

    const rsiLine: LineData[] = [];
    const arrows: LaguerreRsiArrow[] = [];
    
    // Initialize Laguerre filter variables
    let L0 = 0, L1 = 0, L2 = 0, L3 = 0;
    let cu = 0, cd = 0;
    
    for (let i = 1; i < ohlc.length; i++) {
        const price = ohlc[i].close;
        const prevPrice = ohlc[i - 1].close;

        // Update Laguerre filter
        L0 = (1 - gamma) * price + gamma * L0;
        L1 = -gamma * L0 + L0 + gamma * L1;
        L2 = -gamma * L1 + L1 + gamma * L2;
        L3 = -gamma * L2 + L2 + gamma * L3;

        if (L0 >= L1) {
            cu = L0 - L1;
            cd = 0;
        } else {
            cu = 0;
            cd = L1 - L0;
        }

        if (L1 >= L2) {
            cu += L1 - L2;
        } else {
            cd += L2 - L1;
        }

        if (L2 >= L3) {
            cu += L2 - L3;
        } else {
            cd += L3 - L2;
        }
        
        let rsiVal = 0;
        if ((cu + cd) !== 0) {
            rsiVal = cu / (cu + cd);
        }

        const time = ohlc[i].time;
        rsiLine.push({ time, value: rsiVal });
        
        // --- Arrow Logic ---
        const prevRsiVal = i > 1 ? rsiLine[rsiLine.length - 2].value : null;

        if (prevRsiVal !== null) {
            // Buy Signal: Crosses up from below levelDown
            if (rsiVal > levelDown && prevRsiVal <= levelDown) {
                 arrows.push({ 
                    time: time, 
                    price: ohlc[i].low, 
                    type: 'buy', 
                    text: `Laguerre RSI Buy (${levelDown})` 
                });
            }
            // Sell Signal: Crosses down from above levelUp
            if (rsiVal < levelUp && prevRsiVal >= levelUp) {
                 arrows.push({ 
                    time: time, 
                    price: ohlc[i].high, 
                    type: 'sell', 
                    text: `Laguerre RSI Sell (${levelUp})` 
                });
            }
        }
    }

    return { rsiLine, arrows };
}
