import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import {
  LOGO_MARK_IMG,
  BOT_STOX_AVATAR,
  BOT_KOINS_AVATAR,
} from "../../assets/files";
import { MarketTicker } from "@/components/MarketTicker";
import { BotShowcase } from "@/components/bots/BotShowcase";
import { TotalumShowcase } from "@/components/bots/TotalumShowcase";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  LineChart,
  Sparkles,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

/* ---- Official brand marks (lucide dropped brand icons) ---- */
function XLogo({ className }: { className?: string }) {
  return (
    
      
    
  );
}

function FacebookLogo({ className }: { className?: string }) {
  return (
    
      
    
  );
}

function LinkedInLogo({ className }: { className?: string }) {
  return (
    
      
    
  );
}

/** Canonical social profiles — kept in one place so every surface stays in sync. */
const SOCIAL_LINKS = [
  {
    label: "X",
    handle: "@aetherforgeAi_",
    href: "https://x.com/aetherforgeAi_",
    Icon: XLogo,
  },
  {
    label: "Facebook",
    handle: "AetherForge AI",
    href: "https://www.facebook.com/profile.php?id=61591701002008",
    Icon: FacebookLogo,
  },
  {
    label: "LinkedIn",
    handle: "AetherForge AI",
    href: "https://www.linkedin.com/in/aether-forge-ai-27659b423/",
    Icon: LinkedInLogo,
  },
] as const;

function HeroChart() {
  // Decorative area chart (SVG) for the hero mockup
  return (
    
      
        
          
          
        
      
      
      
    
  );
}

export default function LandingPage() {
  return (
    <div>
      <div></div>
      <div>
        

        {/* Live market ticker banners — near the top of the page (dark chrome) */}
        

        {/* Light content sheet floating inside the dark frame — the main viewing
            area keeps the light theme, with the nav/ticker/footer dark around it. */}
        <div>
          <div>
            <div></div>
            <div>

        {/* Hero */}
        
          <div>
            <div>
              {/* Standout brand emblem — the official Forge Intelligence shield */}
              <div>
                <span>
                  <img alt="AetherForge AI shield emblem" />
                </span>
                <div>
                  <p>
                    AetherForge<span> AI</span>
                  </p>
                  <p>
                    Forge Intelligence Ltd
                  </p>
                </div>
              </div>

              <div>
                <span>
                  <span></span>
                  <span></span>
                </span>
                Live NZX · ASX · Crypto intelligence
              </div>

              <h1>
                Institutional-grade market intelligence,{" "}
                <span>built for you</span>
              </h1>

              <p>
                Track your real portfolio, surface the highest-impact opportunities, and get
                AI-powered research on every position — without the noise of a traditional trading
                desk.
              </p>

              <div>
                
                  
                    Start free
                    
                  
                
                
                  See live results
                
              </div>
            </div>

            {/* Hero mockup card */}
            <div>
              <div></div>
              <div>
                <div>
                  <div>
                    <p>
                      Portfolio value
                    </p>
                    <p>
                      NZ$128,450
                    </p>
                  </div>
                  <span>
                    +12.4%
                  </span>
                </div>
                
                <div>
                  {[
                    { s: "NVDA", n: "NVIDIA Corp.", v: "$62,400", c: "+42.1%", up: true },
                    { s: "AAPL", n: "Apple Inc.", v: "$41,220", c: "+11.3%", up: true },
                    { s: "TSLA", n: "Tesla, Inc.", v: "$18,940", c: "-6.4%", up: false },
                  ].map((r) =&gt; (
                    <div>
                      <div>
                        <div>
                          {r.s.slice(0, 2)}
                        </div>
                        <div>
                          <p>{r.s}</p>
                          <p>{r.n}</p>
                        </div>
                      </div>
                      <div>
                        <p>{r.v}</p>
                        <p>{r.c}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        

        {/* ─── Trust strip: credibility markers, scannable at a glance ─── */}
        
          <div>
            {[
              { icon: LineChart, stat: "NZX · ASX · Dow · Nasdaq", label: "Live multi-market coverage" },
              { icon: TrendingUp, stat: "Real-time", label: "Prices, P/L & projections" },
              { icon: ShieldCheck, stat: "Bank-grade", label: "Private & secure by design" },
              { icon: Sparkles, stat: "Cancel anytime", label: "No lock-in, transparent pricing" },
            ].map((t) =&gt; (
              <div>
                <span>
                  
                </span>
                <div>
                  <p>{t.stat}</p>
                  <p>{t.label}</p>
                </div>
              </div>
            ))}
          </div>
        

        {/* ─── Attention banner: real, live results ─── */}
        
          
            {/* animated shimmer sweep */}
            <span></span>
            <div>
              <div>
                <span>
                  
                </span>
                <div>
                  <div>
                    <span>
                      <span></span>
                      <span></span>
                    </span>
                    Live & real
                  </div>
                  <h2>
                    Check out the <span>real results</span> of how it works
                  </h2>
                  <p>
                    See our AI&apos;s live, verifiable performance and calls in action — no cherry-picking.
                  </p>
                </div>
              </div>
              <span>
                View live results
                
              </span>
            </div>
          
        

        {/* ─── Lifetime Offer · Own Stox or Koins Forever ─── */}
        
          <div>
            <div>
              {/* subtle gold accent line */}
              <div></div>

              <div>
                {/* Copy */}
                <div>
                  <div>
                    
                    Limited Special · One-time
                  </div>
                  <h2>
                    Own Stox or Koins Forever —{" "}
                    <span>One-Time $300</span>
                  </h2>
                  <p>
                    Get the complete self-hosted AI market intelligence bot delivered as a
                    downloadable package. Add your own portfolio and run it yourself.
                  </p>
                </div>

                {/* Two bot mini-cards */}
                <div>
                  
                    <img alt="Stox" />
                    <div>
                      <p>Stox</p>
                      <p>Stock Market Intelligence</p>
                    </div>
                    
                  

                  
                    <img alt="Koins" />
                    <div>
                      <p>Koins</p>
                      <p>Crypto Market Intelligence</p>
                    </div>
                    
                  
                </div>
              </div>
            </div>
          </div>
        

        {/* The two Apex bots — core of the product */}
        <div>
          
        </div>

        {/* The Headmaster — portfolio planning and strategies across both bots + metals */}
        <div>
          
        </div>

        {/* Institutional Edge */}
        
          <div>
            <div></div>
            <p>Institutional Edge</p>
            <h2>
              The clarity previously reserved for professional traders and family offices.
            </h2>
            <p>
              AetherForge compresses hours of market research into decisive, actionable intelligence
              — so you can focus on the decisions that actually move the needle.
            </p>
          </div>
        

        {/* Final CTA */}
        
          <div>
            <h2>
              Ready to take control of your market intelligence?
            </h2>
            <p>
              Join New Zealand investors who use AetherForge to cut through the noise and act with
              confidence.
            </p>
            <div>
              
                
                  Create free account
                  
                
              
              
                I have an account
              
            </div>
          </div>
        

            </div>
          </div>
        </div>
        {/* /Light content sheet */}

        {/* Footer (dark chrome) */}
        
          <div>
            <div>
              <div>
                
                <p>
                  New Zealand–owned and operated multi-asset market intelligence. Turning NZX, ASX and
                  global market data into decisive clarity.
                </p>
                <a>
                  www.aetherforgeai.co.nz
                </a>
                <div>
                  {SOCIAL_LINKS.map(({ label, href, Icon }) =&gt; (
                    <a>
                      
                    </a>
                  ))}
                </div>
              </div>

              <div>
                About us
                Live results
                How it works
                Maximize results
                Pricing
                Own the bots
                AI Privacy Act
                Log in
                Terms & Conditions
                Sign up
                AI Disclaimer
              </div>
            </div>

            <div>
              <p>
                © {new Date().getFullYear()} AetherForge AI — New Zealand owned & operated. For
                informational purposes only.
              </p>
              <p>
                AetherForge AI provides general market information and AI-generated analysis. It is
                <strong> not licensed financial advice</strong> under the
                Financial Markets Conduct Act 2013. Always seek advice from a licensed financial adviser before making
                investment decisions.
              </p>
            </div>
          </div>
        
      </div>
    </div>
  );
}
