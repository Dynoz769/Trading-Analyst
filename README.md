# Trading Analyst

Static web app for planning and reviewing trades. No build step, no server; data stays in the browser (`localStorage`).

## Run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Tools

- **Position size**: balance, risk %, entry, stop and target give units, risk amount, R:R and profit at target.
- **Journal**: log trades (long/short, entry, exit, size, fees). Shows win rate, net P/L, profit factor, expectancy, max drawdown and an equity curve. CSV export and import.
- **Indicators**: paste closing prices to get SMA, EMA, RSI and a trend read.
