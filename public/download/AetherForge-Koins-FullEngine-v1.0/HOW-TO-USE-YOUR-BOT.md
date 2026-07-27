How to Use Your AetherForge AI Bot
Thank you for your purchase.
You now own a complete, self-hosted market intelligence package from AetherForge AI (Forge Intelligence Ltd).
This guide walks you through everything step by step — from first install to generating your first report. No coding experience is required.
---
What you received
Depending on what you purchased, your download contains one of these packages:
Package	What it analyses
AetherForge Stox	Stocks & shares (NZX, ASX, US markets)
AetherForge Koins	Cryptocurrencies (Bitcoin, Ethereum, and major coins)
Both use the same full technical engine that powers the AetherForge AI website:
Live market prices
RSI, MACD, moving averages
Regime detection & conviction scoring
7-day probabilistic outlook (Base / Bull / Bear)
Support, resistance and pivot levels
Clear BUY / HOLD / SELL-style signals
Professional HTML report
You run everything on your own computer. Nothing is uploaded to our servers.
---
Before you start — what you need
A computer (Windows, Mac, or Linux)
An internet connection (needed to fetch live prices)
Node.js 18 or newer (free)
That is all. No API keys and no accounts are required.
---
Step 1 — Install Node.js (one-time setup)
Node.js is the free runtime that runs your bot.
Windows
Go to https://nodejs.org
Download the LTS version
Run the installer and accept the defaults
Restart your computer if prompted
Mac
Go to https://nodejs.org
Download the LTS version for macOS
Open the `.pkg` file and follow the prompts
Linux
Use your package manager, or download the LTS build from https://nodejs.org.
Check it worked
Open a terminal (or Command Prompt / PowerShell on Windows) and type:
```bash
node -v
```
You should see something like `v20.x.x` or `v22.x.x`.  
If you see a version number, you are ready.
---
Step 2 — Unpack your download
Unzip the file you received (e.g. `AetherForge-Stox-FullEngine-v1.0.zip` or `AetherForge-Koins-FullEngine-v1.0.zip`)
Put the folder somewhere easy to find, for example:
Windows: `C:\AetherForge\Stox`
Mac: `~/AetherForge/Stox` or `~/AetherForge/Koins`
Inside the folder you will see something like:
```
README.md
package.json
portfolio.csv          ← this is where you put your holdings
src/
examples/
output/                ← reports will appear here
```
---
Step 3 — Install the package (one-time per computer)
Open a terminal / Command Prompt
Move into the package folder:
Windows example:
```bash
cd C:\AetherForge\Stox
```
Mac / Linux example:
```bash
cd ~/AetherForge/Stox
```
Run:
```bash
npm install
```
Wait until it finishes. You only need to do this once (or after you receive an updated package).
---
Step 4 — Add your own portfolio
Open the file `portfolio.csv` in any spreadsheet (Excel, Google Sheets, Numbers) or a plain text editor.
Stox (stocks) format
```csv
ticker,shares,avg_price
AIA.NZ,500,7.85
FPH.NZ,120,31.40
BHP.AX,150,42.10
CBA.AX,40,118.50
AAPL,25,195.00
MSFT,15,420.00
```
Rules for Stox
Use the correct exchange suffix where needed:
New Zealand → `.NZ` (e.g. `AIA.NZ`)
Australia → `.AX` (e.g. `BHP.AX`)
US stocks → usually just the symbol (`AAPL`, `MSFT`, `NVDA`)
`shares` = how many shares you own
`avg_price` = your average cost per share (in the listing currency)
Koins (crypto) format
```csv
symbol,quantity,avg_price
BTC,0.15,68500
ETH,2.5,3400
SOL,45,145
XRP,2500,0.55
ADA,8000,0.42
LINK,120,14.50
```
Rules for Koins
Use the plain coin symbol (`BTC`, `ETH`, `SOL`) — not exchange pair names
`quantity` = how much of the coin you hold
`avg_price` = your average cost in USD
Save the file when you are done.  
An example file is also in the `examples/` folder if you want a template.
---
Step 5 — Generate your report
In the same terminal (still inside the package folder), run:
```bash
npm run report
```
The bot will:
Read your portfolio
Fetch live market prices
Pull price history where available
Run the full technical engine on every holding
Write a professional HTML report into the `output/` folder
When it finishes you will see a message like:
```
✅ Full-engine report generated: output/stox-report-2026-07-28T....html
```
(or `koins-report-...` for crypto)
---
Step 6 — Open and read your report
Open the `output` folder inside your package
Double-click the newest `.html` file
It will open in your normal web browser
What the report shows
Portfolio summary (top)
Total market value
Cost basis
Unrealised profit / loss
Overall return %
For each holding
Live price and today’s move
Engine signal (Strong Buy / Buy / Hold / Reduce / Sell)
Your position size, market value and unrealised P&L
1-day, 7-day and 30-day performance
7-day projected move with confidence
RSI, MACD, distance from SMA20, market regime, score
Support / pivot / resistance levels
Recent price path (sparkline)
Engine reasoning in plain English
Base / Bull / Bear outlook scenarios with probabilities
LIVE SERIES badge = the engine used real daily price history.  
MODELLED badge = it used the high-quality modelled series anchored to the live price (same fallback the website uses when history is incomplete).
---
Using a different portfolio file
You can keep multiple portfolios:
```bash
npm run report -- --portfolio ./my-other-holdings.csv
```
or on Windows:
```bash
npm run report -- --portfolio my-other-holdings.csv
```
---
Updating prices later
Whenever you want a fresh analysis:
Open the terminal
Go into the package folder
Run `npm run report` again
A new HTML file is created each time. Older reports stay in the `output` folder so you can compare them.
---
Troubleshooting
“node is not recognised” / “command not found”
Node.js is not installed, or the terminal was open before you installed it.  
Install Node.js (Step 1) and open a new terminal window.
“npm install” fails
Check you have an internet connection
Make sure you are inside the package folder
Try again: `npm install`
Report shows no live prices / all positions at cost
Check your internet connection
Some less common tickers may not resolve — double-check the symbol spelling and exchange suffix
The report still generates using your average cost as a fallback
“No valid holdings found”
Open `portfolio.csv` and confirm the header row is correct
Stox: `ticker,shares,avg_price`
Koins: `symbol,quantity,avg_price`
Remove any blank lines or extra columns
Want to print or save as PDF
Open the HTML report in your browser → Print → choose Save as PDF.
---
Important disclaimers
This software provides informational market analysis only.
It is not personalised financial advice.
It is not a recommendation to buy, sell or hold any security or digital asset.
Markets can move quickly. Past or modelled performance is not a guide to future results.
Cryptocurrency markets in particular are highly volatile and trade 24/7.
Always do your own research.
Consider seeking advice from a licensed financial adviser before making investment decisions.
You own this package and may run it for your personal use.  
Please do not redistribute the files commercially.
---
Support
This is a self-hosted product. You run it on your own machine.
If you have a technical problem getting the package to run (install errors, missing files, etc.), reply to your purchase confirmation email with:
Which package you bought (Stox or Koins)
Your operating system (Windows / Mac / Linux)
The exact error message (a screenshot helps)
---
Quick reference card
Action	Command
Install (once)	`npm install`
Generate report	`npm run report`
Use another portfolio	`npm run report -- --portfolio myfile.csv`
Check Node is installed	`node -v`
Stox portfolio columns: `ticker,shares,avg_price`  
Koins portfolio columns: `symbol,quantity,avg_price`
Reports appear in the `output/` folder.
---
© Forge Intelligence Ltd · AetherForge AI  
www.aetherforgeai.co.nz
Own it. Run it yourself.