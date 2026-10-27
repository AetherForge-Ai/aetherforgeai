/**
 * b85 H-10: the Sharesies, Hatch and bad-rows fixtures as strings so the preview test hook can run
 * them on preview without filesystem access. goal-b85.test.ts checks they equal the .csv files.
 */
export const SHARESIES_FIXTURE = "# Synthetic fixture. Not a customer file.\nDate,Type,Instrument code,Instrument name,Quantity,Price,Value,Currency,Exchange rate\n15/01/2026,Buy,AIR.NZ,Air New Zealand,100,0.65,65.00,NZD,1\n20/01/2026,Sell,AAPL,Apple,2,180.50,361.00,USD,1.6700\n02/02/2026,Dividend,FPH.NZ,Fisher and Paykel,10,1.24,12.40,NZD,1\n03/02/2026,Split,AIR.NZ,Air New Zealand,100,,,NZD,1\n";
export const HATCH_FIXTURE = "# Synthetic fixture. Not a customer file.\nTrade Date,Action,Symbol,Quantity,Price,Commission,Currency,FX Rate,Value\n2026-03-01,BUY,MSFT,1,400.00,3.00,USD,1.6500,400.00\n2026-03-02,SELL,MSFT,0.5,200.00,3.00,USD,1.6500,100.00\n";
export const BAD_ROWS_FIXTURE = "# Synthetic fixture. Not a customer file. Header layout modelled on the broker's export; no real data.\nDate,Type,Instrument code,Quantity,Price,Value,Currency,Exchange rate\n2026-03-02,Buy,AIR.NZ,100,0.65,65.00,NZD,1\n2026-03-03,Buy,FPH.NZ,-5,30.00,150.00,NZD,1\n2026-03-04,Buy,NOTREAL.NZ,10,1.00,10.00,NZD,1\n2026-13-40,Buy,FPH.NZ,1,30.00,30.00,NZD,1\n2026-03-05,Buy,FPH.NZ,2,30.00,60.00,NZD,1\n";
