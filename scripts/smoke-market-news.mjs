const UA = "Mozilla/5.0 (compatible; AetherForgeAI/1.0)";

function decodeXml(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function tagBetween(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function formatRelativeTime(d) {
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}
async function parseFeed(url, source) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,*/*" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 8).map((block) => {
    const title = stripHtml(tagBetween(block, "title"));
    const pub = tagBetween(block, "pubDate") || tagBetween(block, "published") || tagBetween(block, "updated");
    const publishedAt = pub ? new Date(pub) : new Date();
    return { source, title, time: formatRelativeTime(publishedAt), publishedAt };
  }).filter((x) => x.title.length > 12);
}

const stockFeeds = [
  ["https://www.rnz.co.nz/rss/business.xml", "RNZ"],
  ["https://www.businessdesk.co.nz/feed", "BusinessDesk"],
  ["https://feeds.bbci.co.uk/news/business/rss.xml", "BBC"],
  ["https://finance.yahoo.com/rss/headline?s=BHP.AX,CBA.AX,AAPL,NVDA", "Yahoo"],
];
const cryptoFeeds = [
  ["https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk"],
  ["https://cointelegraph.com/rss", "CoinTelegraph"],
  ["https://finance.yahoo.com/rss/headline?s=BTC-USD", "Yahoo BTC"],
];

console.log("=== STOCK ===");
for (const [url, src] of stockFeeds) {
  const items = await parseFeed(url, src);
  console.log(src, items.length, items[0] ? `[${items[0].time}] ${items[0].title.slice(0,70)}` : "NONE");
}
console.log("=== CRYPTO ===");
for (const [url, src] of cryptoFeeds) {
  const items = await parseFeed(url, src);
  console.log(src, items.length, items[0] ? `[${items[0].time}] ${items[0].title.slice(0,70)}` : "NONE");
}
