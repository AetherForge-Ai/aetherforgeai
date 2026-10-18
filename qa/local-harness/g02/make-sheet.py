# Goal b23 G-02: build an independent spreadsheet for the 20-trade golden file.
# XIRR and TWR are spreadsheet formulas; LibreOffice recalculates them, and the values are saved
# next to the golden file so the vitest check compares the app against the spreadsheet.
import json, datetime, subprocess, csv, os, openpyxl
g = json.load(open("src/lib/fixtures/performance-golden.json"))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "golden"
ws.append(["date", "cashflow (investor view)", "value before", "flow in", "period factor"])
pts = g["points"]; n = len(pts)
for i, p in enumerate(pts):
    r = i + 2
    ws.cell(r, 1, datetime.date.fromisoformat(p["date"])); ws.cell(r, 2, -p["flowNzd"])
    ws.cell(r, 3, p["valueBeforeNzd"]); ws.cell(r, 4, p["flowNzd"])
    if i > 0:
        ws.cell(r - 1, 5, f"=C{r}/(C{r-1}+D{r-1})")
last = n + 1; end = n + 2
ws.cell(end, 1, datetime.date.fromisoformat(g["asOf"])); ws.cell(end, 2, g["endingNzd"]); ws.cell(end, 3, g["endingNzd"])
ws.cell(last, 5, f"=C{end}/(C{last}+D{last})")
ws["G1"] = "XIRR"; ws["H1"] = f"=XIRR(B2:B{end},A2:A{end})"
ws["G2"] = "TWR"; ws["H2"] = f"=PRODUCT(E2:E{last})-1"
os.makedirs("qa/local-harness/g02/out", exist_ok=True)
src = "qa/local-harness/g02/performance-golden.xlsx"; wb.save(src)
subprocess.run(["soffice", "--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1", "--outdir", "qa/local-harness/g02/out", src], check=True, capture_output=True)
rows = list(csv.reader(open("qa/local-harness/g02/out/performance-golden-golden.csv")))
xirr = float(rows[0][7]); twr = float(rows[1][7])
json.dump({"source": "LibreOffice Calc XIRR and PRODUCT formulas on performance-golden.xlsx", "xirr": xirr, "twr": twr}, open("src/lib/fixtures/performance-golden.sheet.json", "w"), indent=2)
print("sheet xirr", xirr, "twr", twr)
