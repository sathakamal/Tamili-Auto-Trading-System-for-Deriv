# Tamil Auto Trading System

An advanced, automated trading bot for the Deriv platform, built with Next.js and TypeScript. Features real-time charting, 40+ technical indicators, AI-powered signal prediction, and automatic trade execution.

## Features

### 📊 Real-Time Charting & Analysis
- Live tick data streaming from Deriv API
- Interactive candlestick charts using Lightweight Charts
- Multiple timeframes (from ticks to 1 hour)
- Real-time indicator calculations and overlays

### 🔧 Technical Indicators (40+)
Includes:
- **Trend Indicators**: EMA, SMA, Bollinger Bands, Super Trend
- **Momentum Indicators**: RSI, Stochastic, MACD, CCI, Momentum
- **Volatility Indicators**: ATR Trailing Stop, Squeeze Momentum
- **Reversal Indicators**: 1-2-3 Reversal, Skyrex Reversal, Peak Filter
- **Volume Indicators**: Volume Profile, OBV Bollinger Bands
- **Advanced**: Multi-Timeframe Analysis, Support/Resistance, Ultimate Pullback, EMA/ADX Trend

### 🤖 AI-Powered Trading
- Custom analysis engine that combines multiple indicators
- Weight-based signal scoring system
- Configurable minimum confidence threshold
- Volatility filtering for better risk management

### 📈 Trading Modes
- **Tick Mode**: Fast-paced trading based on tick data
- **Minute Mode**: Slower, more conservative trading on minute candles
- **Rise/Fall Contracts**: Binary options trading
- **Martingale System**: Optional stake multiplier for recovery

### 🛡️ Risk Management
- **Stop Loss**: Auto-stop at configurable loss amount
- **Target Profit**: Auto-stop at configurable profit target
- **Minimum Confidence**: Only trade when signal confidence meets threshold
- **Volatility Filter**: Avoid low-volatility markets
- **Configurable Indicator Weights**: Customize strategy

### 💾 Persistence
- All settings saved to localStorage
- Trade history tracking
- Event log for debugging
- Session statistics (win rate, profit, etc.)

## Tech Stack

- **Framework**: Next.js 15 with Turbopack
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Lightweight Charts, Recharts
- **API**: Deriv WebSocket API
- **AI**: Firebase Genkit (optional)
- **Icons**: Lucide React

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Deriv account (demo or real)
- Deriv API token

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/tamil-auto-trading-system.git
cd tamil-auto-trading-system
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:9003](http://localhost:9003) in your browser

### Configuration

1. **Deriv API Setup**:
   - Go to [Deriv API Tokens](https://api.deriv.com/)
   - Create a new API token
   - Enter your token and App ID (default: 1089) in the app

2. **Bot Settings**:
   - Select your market (e.g., R_10, R_25, R_50, R_75, R_100)
   - Set your stake amount
   - Configure trade duration
   - Set stop loss and target profit
   - Adjust indicator settings in the settings panel

## Usage Guide

### Starting the Bot

1. Connect your Deriv account
2. Select a market
3. Configure your trading parameters
4. Click "Start Bot"

### Understanding the UI

- **Chart Panel**: Real-time price action with indicators
- **Signal Prediction**: Shows RISE/FALL/HOLD with confidence score
- **Technical Analysis**: Trend, momentum, volatility, signal strength
- **Indicators Grid**: All active indicators with their signals
- **Trade History**: Record of all executed trades
- **Event Log**: Real-time events and status updates
- **Bot Stats**: Session profit, win rate, total trades, balance

### Customizing Your Strategy

1. Open the settings panel
2. Enable/disable indicators
3. Adjust indicator parameters (periods, levels, etc.)
4. Modify indicator weights to prioritize certain signals
5. Configure multi-timeframe analysis
6. Set up volatility filters

## Available Scripts

- `npm run dev` - Start development server on port 9003
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## Risk Warning

⚠️ **IMPORTANT**: Trading binary options and financial instruments involves significant risk of loss. This software is for educational and research purposes only.

- Never trade with money you can't afford to lose
- Always test on a demo account first
- Past performance does not guarantee future results
- Use at your own risk

## License

This project is provided as-is for educational purposes.

## Author

Tamili

## Disclaimer

This project is not affiliated with Deriv.com. Use at your own risk. Always do your own research before trading.
