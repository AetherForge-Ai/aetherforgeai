/**
 * Website Design Showcase — five self-contained example websites designed and
 * built by AetherForge. Each entry holds the FULL standalone HTML document
 * (rendered inside a sandboxed iframe on the showcase pages) plus display
 * metadata. Attached by the client; stored here as the single source of truth
 * per project convention (never reference the raw files directly).
 */

export interface ShowcaseDesign {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  /** Accent colour used for the gallery card + preview chrome. */
  accent: string;
  /** Complete, self-contained HTML document for the design. */
  html: string;
}

export const WEBSITE_DESIGN_SHOWCASE: ShowcaseDesign[] = [
  {
    slug: "summit-inspection",
    name: "Summit Inspection",
    category: "Local service business",
    tagline: "A trust-first site for CCTV drain & pipe specialists — clear services, process and a strong call to book.",
    accent: "#22d3ee",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Summit Inspection — CCTV Drain & Pipe Specialists</title>
<style>
  :root {
    --navy: #0b1220;
    --navy2: #111827;
    --surface: #1e293b;
    --teal: #22d3ee;
    --teal2: #06b6d4;
    --text: #f1f5f9;
    --muted: #94a3b8;
    --border: #334155;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--navy);
    color: var(--text);
    line-height: 1.6;
  }
  a { color: inherit; text-decoration: none; }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  nav {
    position: sticky; top: 0; z-index: 100;
    background: rgba(11,18,32,0.92);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .nav-inner {
    display: flex; align-items: center; justify-content: space-between;
    height: 64px;
  }
  .logo { font-weight: 800; font-size: 1.2rem; letter-spacing: -0.02em; }
  .logo span { color: var(--teal); }
  .nav-links { display: flex; gap: 26px; align-items: center; }
  .nav-links a { font-size: 0.9rem; color: var(--muted); font-weight: 500; }
  .nav-links a:hover { color: var(--text); }
  .nav-cta {
    background: var(--teal); color: #0b1220 !important;
    padding: 9px 16px; border-radius: 8px; font-weight: 700;
  }
  .menu-btn { display: none; background: none; border: none; color: white; font-size: 1.4rem; cursor: pointer; }

  .hero {
    padding: 96px 0 88px;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(ellipse 80% 60% at 70% 20%, rgba(34,211,238,0.12), transparent);
  }
  .hero-content { position: relative; max-width: 640px; }
  .hero-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(34,211,238,0.1);
    border: 1px solid rgba(34,211,238,0.25);
    color: var(--teal);
    font-size: 0.78rem; font-weight: 600;
    padding: 6px 13px; border-radius: 999px; margin-bottom: 20px;
  }
  .hero h1 {
    font-size: clamp(2.5rem, 5.5vw, 3.5rem);
    font-weight: 800; letter-spacing: -0.035em;
    line-height: 1.08; margin-bottom: 18px;
  }
  .hero p {
    font-size: 1.2rem; color: var(--muted);
    margin-bottom: 32px; max-width: 500px;
  }
  .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 22px; border-radius: 9px;
    font-weight: 700; font-size: 0.95rem;
    transition: all 0.15s;
  }
  .btn-primary { background: var(--teal); color: #0b1220; }
  .btn-primary:hover { background: #67e8f9; transform: translateY(-1px); }
  .btn-ghost {
    background: transparent; color: var(--text);
    border: 1px solid var(--border);
  }
  .btn-ghost:hover { border-color: var(--muted); }

  .stats {
    background: var(--navy2);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 28px 0;
  }
  .stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 16px; text-align: center;
  }
  .stat-num {
    font-size: 1.85rem; font-weight: 800; color: var(--teal);
    letter-spacing: -0.02em;
  }
  .stat-label { font-size: 0.82rem; color: var(--muted); margin-top: 3px; }

  section { padding: 84px 0; }
  .section-label {
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--teal); margin-bottom: 10px;
  }
  .section-title {
    font-size: clamp(1.75rem, 3.2vw, 2.3rem);
    font-weight: 800; letter-spacing: -0.03em;
    margin-bottom: 14px; line-height: 1.2;
  }
  .section-desc { color: var(--muted); font-size: 1.08rem; max-width: 520px; margin-bottom: 40px; }

  .services-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 18px;
  }
  .service-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px; padding: 26px;
    transition: border-color 0.2s, transform 0.2s;
  }
  .service-card:hover {
    border-color: rgba(34,211,238,0.4);
    transform: translateY(-3px);
  }
  .service-icon {
    width: 44px; height: 44px;
    background: rgba(34,211,238,0.12);
    border-radius: 11px;
    display: grid; place-items: center;
    font-size: 1.25rem; margin-bottom: 16px;
  }
  .service-card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
  .service-card p { color: var(--muted); font-size: 0.92rem; }

  .process { background: var(--navy2); }
  .steps {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 24px;
  }
  .step-num {
    width: 40px; height: 40px;
    background: var(--teal); color: #0b1220;
    border-radius: 10px; display: grid; place-items: center;
    font-weight: 800; font-size: 0.95rem; margin-bottom: 14px;
  }
  .step h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; }
  .step p { color: var(--muted); font-size: 0.9rem; }

  .cta-band {
    background: linear-gradient(135deg, #0c4a6e, #164e63);
    text-align: center; padding: 72px 0;
  }
  .cta-band h2 { font-size: 2rem; font-weight: 800; margin-bottom: 12px; }
  .cta-band p { color: #a5f3fc; margin-bottom: 26px; font-size: 1.1rem; }

  footer {
    background: var(--navy2);
    border-top: 1px solid var(--border);
    padding: 40px 0 28px; font-size: 0.88rem; color: var(--muted);
  }
  .footer-grid {
    display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 36px; margin-bottom: 28px;
  }
  .footer-brand { color: var(--text); font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; }
  .footer-brand span { color: var(--teal); }
  .footer-bottom {
    border-top: 1px solid var(--border);
    padding-top: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
  }

  @media (max-width: 800px) {
    .nav-links { display: none; }
    .menu-btn { display: block; }
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
    .footer-grid { grid-template-columns: 1fr; }
    .hero { padding: 72px 0 64px; }
  }
</style>
</head>
<body>
  <nav>
    <div class="container nav-inner">
      <a href="#" class="logo">Summit<span>Inspect</span></a>
      <div class="nav-links">
        <a href="#services">Services</a>
        <a href="#process">Process</a>
        <a href="#contact" class="nav-cta">Get a quote</a>
      </div>
      <button class="menu-btn">☰</button>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <div class="hero-content">
        <div class="hero-badge">● Trusted across Canterbury & South Island</div>
        <h1>Precise CCTV drain & pipe inspection</h1>
        <p>Clear diagnostics. Actionable reports. No guesswork for property owners, managers and contractors.</p>
        <div class="hero-actions">
          <a href="#contact" class="btn btn-primary">Book an inspection</a>
          <a href="#services" class="btn btn-ghost">View services</a>
        </div>
      </div>
    </div>
  </header>

  <div class="stats">
    <div class="container stats-grid">
      <div><div class="stat-num">27+</div><div class="stat-label">Years experience</div></div>
      <div><div class="stat-num">4,200+</div><div class="stat-label">Inspections completed</div></div>
      <div><div class="stat-num">24hr</div><div class="stat-label">Typical report time</div></div>
      <div><div class="stat-num">100%</div><div class="stat-label">NZ owned & operated</div></div>
    </div>
  </div>

  <section id="services">
    <div class="container">
      <div class="section-label">Capabilities</div>
      <h2 class="section-title">Inspection services that deliver clarity</h2>
      <p class="section-desc">From residential blockages to commercial asset surveys — accurate findings you can act on.</p>
      <div class="services-grid">
        <div class="service-card">
          <div class="service-icon">📹</div>
          <h3>CCTV Drain Surveys</h3>
          <p>High-resolution camera inspection. Locate blockages, cracks, root intrusion and structural issues with precision.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">🔧</div>
          <h3>Pipe Condition Assessment</h3>
          <p>Full graded condition reports for councils, property managers and civil contractors.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">💧</div>
          <h3>Blockage Diagnosis</h3>
          <p>Rapid response for recurring issues. Find the real cause so you fix it once.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">📋</div>
          <h3>Pre-Purchase Reports</h3>
          <p>Independent drain reports for buyers and sellers. Know the true condition before you commit.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">🏗️</div>
          <h3>Civil & Commercial</h3>
          <p>Large-diameter surveys, manhole inspections and asset management support.</p>
        </div>
        <div class="service-card">
          <div class="service-icon">📍</div>
          <h3>Location & Mapping</h3>
          <p>Accurate underground asset location for excavation planning and as-built records.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="process" id="process">
    <div class="container">
      <div class="section-label">Process</div>
      <h2 class="section-title">How an inspection works</h2>
      <p class="section-desc">Straightforward from first contact to final report.</p>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <h3>Enquire</h3>
          <p>Tell us the issue or scope. We advise the right survey type and arrange a suitable time.</p>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <h3>Inspect</h3>
          <p>Technician arrives with professional CCTV equipment. Most residential jobs complete same visit.</p>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <h3>Report</h3>
          <p>Detailed digital report with stills, defect grading and recommendations — usually within 24 hours.</p>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <h3>Support</h3>
          <p>We can recommend trusted repair contractors or provide further investigation if needed.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-band" id="contact">
    <div class="container">
      <h2>Book your inspection</h2>
      <p>Fast response across Canterbury and the wider South Island.</p>
      <div class="hero-actions" style="justify-content:center">
        <a href="tel:035550180" class="btn btn-primary">Call 03 555 0180</a>
        <a href="mailto:info@summitinspect.example" class="btn btn-ghost">Email us</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="footer-grid">
        <div>
          <div class="footer-brand">Summit<span>Inspect</span></div>
          <p>Professional CCTV drain and pipe inspection. Accurate diagnostics for property owners, managers and contractors across New Zealand.</p>
        </div>
        <div>
          <p style="color:var(--text);font-weight:600;margin-bottom:10px">Services</p>
          <p><a href="#services">CCTV Surveys</a></p>
          <p><a href="#services">Condition Reports</a></p>
          <p><a href="#services">Blockage Diagnosis</a></p>
        </div>
        <div>
          <p style="color:var(--text);font-weight:600;margin-bottom:10px">Contact</p>
          <p>03 555 0180</p>
          <p>info@summitinspect.example</p>
          <p>Canterbury, New Zealand</p>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 Summit Inspection Services · Demo by AetherForge</span>
        <span>Demonstration website only</span>
      </div>
    </div>
  </footer>
</body>
</html>
`,
  },
  {
    slug: "riverstone-kitchen",
    name: "Riverstone Kitchen",
    category: "Hospitality & restaurant",
    tagline: "A warm, editorial restaurant site with a seasonal menu, story and reservations.",
    accent: "#ea580c",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Riverstone Kitchen — Amberley</title>
<style>
  :root {
    --stone: #1c1917;
    --stone2: #292524;
    --cream: #faf6f1;
    --warm: #f5efe6;
    --amber: #c2410c;
    --amber2: #ea580c;
    --muted: #78716c;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
    background: var(--cream);
    color: var(--stone);
    line-height: 1.6;
  }
  a { color: inherit; text-decoration: none; }
  .container { max-width: 1060px; margin: 0 auto; padding: 0 24px; }

  nav {
    position: sticky; top: 0; z-index: 50;
    background: rgba(250,246,241,0.94);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #e7e0d6;
  }
  .nav-inner {
    display: flex; align-items: center; justify-content: space-between;
    height: 70px;
  }
  .logo {
    font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em;
  }
  .logo span { color: var(--amber); }
  .nav-links { display: flex; gap: 30px; align-items: center; }
  .nav-links a {
    font-family: system-ui, sans-serif;
    font-size: 0.9rem; font-weight: 500; color: var(--muted);
  }
  .nav-links a:hover { color: var(--stone); }
  .nav-cta {
    background: var(--stone); color: var(--cream) !important;
    padding: 10px 18px; border-radius: 999px; font-weight: 600;
  }
  .menu-btn { display: none; background: none; border: none; font-size: 1.4rem; cursor: pointer; }

  .hero {
    padding: 110px 0 100px;
    text-align: center;
    background: linear-gradient(180deg, var(--cream) 0%, var(--warm) 100%);
  }
  .hero-badge {
    font-family: system-ui, sans-serif;
    font-size: 0.78rem; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--amber); margin-bottom: 22px;
  }
  .hero h1 {
    font-size: clamp(2.8rem, 7vw, 4.4rem);
    font-weight: 700; letter-spacing: -0.03em;
    line-height: 1.05; margin-bottom: 22px;
  }
  .hero p {
    font-family: system-ui, sans-serif;
    font-size: 1.2rem; color: var(--muted);
    max-width: 460px; margin: 0 auto 36px;
  }
  .btn {
    display: inline-flex; align-items: center;
    font-family: system-ui, sans-serif;
    padding: 14px 28px; border-radius: 999px;
    font-weight: 700; font-size: 0.95rem;
    transition: all 0.15s;
  }
  .btn-primary { background: var(--amber); color: white; }
  .btn-primary:hover { background: var(--amber2); transform: translateY(-2px); }
  .btn-outline {
    background: transparent; border: 1.5px solid var(--stone);
    color: var(--stone); margin-left: 12px;
  }
  .btn-outline:hover { background: var(--stone); color: var(--cream); }

  .about-strip {
    display: grid; grid-template-columns: 1fr 1fr;
    min-height: 440px;
  }
  .about-text {
    background: var(--stone); color: var(--cream);
    padding: 64px 52px; display: flex; flex-direction: column; justify-content: center;
  }
  .about-text h2 {
    font-size: 2.1rem; margin-bottom: 18px; letter-spacing: -0.02em;
  }
  .about-text p {
    font-family: system-ui, sans-serif;
    color: #a8a29e; margin-bottom: 14px; font-size: 1.05rem;
  }
  .about-visual {
    background: linear-gradient(145deg, #44403c, #78716c 40%, #a8a29e);
    display: grid; place-items: center;
    font-family: system-ui, sans-serif;
    color: rgba(255,255,255,0.55);
    font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase;
  }

  section { padding: 90px 0; }
  .section-label {
    font-family: system-ui, sans-serif;
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--amber); margin-bottom: 12px;
    text-align: center;
  }
  .section-title {
    font-size: clamp(2rem, 4vw, 2.7rem);
    text-align: center; margin-bottom: 12px; letter-spacing: -0.02em;
  }
  .section-desc {
    font-family: system-ui, sans-serif;
    text-align: center; color: var(--muted); max-width: 440px;
    margin: 0 auto 44px; font-size: 1.05rem;
  }
  .menu-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
    gap: 22px;
  }
  .menu-card {
    background: white;
    border: 1px solid #e7e0d6;
    border-radius: 14px; padding: 26px;
    transition: box-shadow 0.2s;
  }
  .menu-card:hover { box-shadow: 0 16px 36px -14px rgba(28,25,23,0.12); }
  .menu-card h3 { font-size: 1.25rem; margin-bottom: 6px; }
  .menu-card .price {
    font-family: system-ui, sans-serif;
    color: var(--amber); font-weight: 700; font-size: 1.05rem;
    margin-bottom: 10px;
  }
  .menu-card p {
    font-family: system-ui, sans-serif;
    color: var(--muted); font-size: 0.92rem;
  }

  .visit {
    background: var(--stone); color: var(--cream);
    padding: 80px 0;
  }
  .visit-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 48px; align-items: center;
  }
  .visit h2 { font-size: 2.2rem; margin-bottom: 18px; }
  .visit p {
    font-family: system-ui, sans-serif;
    color: #a8a29e; margin-bottom: 10px;
  }
  .hours-row {
    display: flex; justify-content: space-between;
    padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,0.1);
    font-family: system-ui, sans-serif; font-size: 0.92rem;
  }
  .hours-row span:last-child { color: #d6d3d1; }

  .cta {
    text-align: center; padding: 88px 0;
    background: var(--warm);
  }
  .cta h2 { font-size: 2.3rem; margin-bottom: 14px; }
  .cta p {
    font-family: system-ui, sans-serif;
    color: var(--muted); margin-bottom: 28px; font-size: 1.1rem;
  }

  footer {
    background: var(--stone2); color: #a8a29e;
    padding: 36px 0; text-align: center;
    font-family: system-ui, sans-serif; font-size: 0.88rem;
  }
  footer strong { color: var(--cream); }

  @media (max-width: 800px) {
    .nav-links { display: none; }
    .menu-btn { display: block; }
    .about-strip { grid-template-columns: 1fr; }
    .about-text { padding: 48px 28px; }
    .about-visual { min-height: 220px; }
    .visit-grid { grid-template-columns: 1fr; }
    .btn-outline { margin-left: 0; margin-top: 12px; }
  }
</style>
</head>
<body>
  <nav>
    <div class="container nav-inner">
      <a href="#" class="logo">Riverstone <span>Kitchen</span></a>
      <div class="nav-links">
        <a href="#menu">Menu</a>
        <a href="#about">Story</a>
        <a href="#visit">Visit</a>
        <a href="#book" class="nav-cta">Book a table</a>
      </div>
      <button class="menu-btn">☰</button>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <div class="hero-badge">Amberley · North Canterbury</div>
      <h1>Seasonal food,<br>honest cooking</h1>
      <p>A neighbourhood kitchen serving breakfast, lunch and evening plates made with local produce.</p>
      <div>
        <a href="#book" class="btn btn-primary">Reserve a table</a>
        <a href="#menu" class="btn btn-outline">View the menu</a>
      </div>
    </div>
  </header>

  <div class="about-strip" id="about">
    <div class="about-text">
      <h2>Rooted in the Waipara valley</h2>
      <p>We source from nearby growers, bakers and producers. The menu changes with the seasons — simple plates that let good ingredients speak.</p>
      <p>Open seven days for coffee and long lunches, with evening sittings Thursday to Saturday.</p>
    </div>
    <div class="about-visual">Atmosphere</div>
  </div>

  <section id="menu">
    <div class="container">
      <div class="section-label">From the kitchen</div>
      <h2 class="section-title">A taste of the current menu</h2>
      <p class="section-desc">Sample dishes. Full menu available in-house and changes regularly.</p>
      <div class="menu-grid">
        <div class="menu-card">
          <h3>Sourdough & cultured butter</h3>
          <div class="price">$12</div>
          <p>Local bakery loaf, house cultured butter, sea salt.</p>
        </div>
        <div class="menu-card">
          <h3>Seasonal green salad</h3>
          <div class="price">$18</div>
          <p>Leaves from the garden, soft herbs, lemon dressing, toasted seeds.</p>
        </div>
        <div class="menu-card">
          <h3>Market fish of the day</h3>
          <div class="price">$36</div>
          <p>Simply grilled, with crushed new potatoes and watercress.</p>
        </div>
        <div class="menu-card">
          <h3>Slow-cooked beef cheek</h3>
          <div class="price">$34</div>
          <p>North Canterbury beef, rich jus, soft polenta, gremolata.</p>
        </div>
        <div class="menu-card">
          <h3>Garden vegetable plate</h3>
          <div class="price">$28</div>
          <p>Roasted and raw vegetables, labneh, dukkah, flatbread.</p>
        </div>
        <div class="menu-card">
          <h3>Dark chocolate & olive oil cake</h3>
          <div class="price">$16</div>
          <p>Warm cake, crème fraîche, local honey.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="visit" id="visit">
    <div class="container">
      <div class="visit-grid">
        <div>
          <h2>Come and sit with us</h2>
          <p>12 Bank Street, Amberley<br>North Canterbury</p>
          <p style="margin-top:18px">Phone: 03 555 0240<br>Email: hello@riverstone.example</p>
        </div>
        <div>
          <div class="hours-row"><span>Monday – Wednesday</span><span>8:00 am – 3:00 pm</span></div>
          <div class="hours-row"><span>Thursday – Saturday</span><span>8:00 am – 9:00 pm</span></div>
          <div class="hours-row"><span>Sunday</span><span>9:00 am – 3:00 pm</span></div>
          <div class="hours-row"><span>Public holidays</span><span>Hours may vary</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="cta" id="book">
    <div class="container">
      <h2>Book your table</h2>
      <p>We recommend booking for evenings and weekends.</p>
      <a href="tel:035550240" class="btn btn-primary">Call 03 555 0240</a>
    </div>
  </section>

  <footer>
    <div class="container">
      <p><strong>Riverstone Kitchen</strong> · Amberley, North Canterbury</p>
      <p style="margin-top:6px">Demo template by AetherForge · Demonstration only</p>
    </div>
  </footer>
</body>
</html>
`,
  },
  {
    slug: "lumen-studio",
    name: "Lumen Studio",
    category: "Creative portfolio",
    tagline: "A dark, refined folio for a design practice — selected work, studio story and contact.",
    accent: "#c084fc",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lumen Studio — Creative Portfolio</title>
<style>
  :root {
    --bg: #0a0a0b;
    --surface: #141416;
    --border: #27272a;
    --text: #fafafa;
    --muted: #a1a1aa;
    --accent: #c084fc;
    --accent2: #e9d5ff;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
  }
  a { color: inherit; text-decoration: none; }
  .container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }

  nav {
    position: sticky; top: 0; z-index: 50;
    background: rgba(10,10,11,0.9);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }
  .nav-inner {
    display: flex; align-items: center; justify-content: space-between;
    height: 62px;
  }
  .logo { font-weight: 700; font-size: 1.15rem; letter-spacing: -0.02em; }
  .logo span { color: var(--accent); }
  .nav-links { display: flex; gap: 28px; }
  .nav-links a { font-size: 0.9rem; color: var(--muted); font-weight: 500; }
  .nav-links a:hover { color: var(--text); }
  .menu-btn { display: none; background: none; border: none; color: white; font-size: 1.35rem; cursor: pointer; }

  .hero {
    padding: 120px 0 100px;
  }
  .hero-grid {
    display: grid; grid-template-columns: 1.3fr 1fr;
    gap: 60px; align-items: end;
  }
  .hero h1 {
    font-size: clamp(2.8rem, 6.5vw, 4.6rem);
    font-weight: 800; letter-spacing: -0.04em;
    line-height: 1.02; margin-bottom: 24px;
  }
  .hero h1 span {
    background: linear-gradient(135deg, var(--accent), #f0abfc);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .hero p {
    font-size: 1.15rem; color: var(--muted);
    max-width: 380px; margin-bottom: 32px;
  }
  .btn {
    display: inline-flex; padding: 13px 24px;
    background: var(--accent); color: #0a0a0b;
    font-weight: 700; border-radius: 999px;
    transition: opacity 0.15s, transform 0.15s;
  }
  .btn:hover { opacity: 0.9; transform: translateY(-1px); }
  .hero-aside {
    text-align: right;
    font-size: 0.9rem; color: var(--muted);
    padding-bottom: 12px;
  }
  .hero-aside strong { color: var(--text); display: block; font-size: 1.1rem; margin-bottom: 4px; }

  section { padding: 80px 0; }
  .section-label {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 12px;
  }
  .section-title {
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    font-weight: 800; letter-spacing: -0.03em; margin-bottom: 40px;
  }

  .projects {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 18px;
  }
  .project {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.2s;
  }
  .project:hover {
    border-color: rgba(192,132,252,0.4);
    transform: translateY(-4px);
  }
  .project.wide { grid-column: 1 / -1; }
  .project-thumb {
    height: 220px;
    display: grid; place-items: center;
    font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
  .project.wide .project-thumb { height: 280px; }
  .project-body { padding: 22px; }
  .project-body h3 { font-size: 1.2rem; margin-bottom: 5px; }
  .project-body p { color: var(--muted); font-size: 0.9rem; }
  .tag {
    display: inline-block; margin-top: 12px;
    font-size: 0.7rem; color: var(--accent2);
    background: rgba(192,132,252,0.12);
    padding: 4px 10px; border-radius: 999px;
  }

  .about {
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .about-grid {
    display: grid; grid-template-columns: 1fr 1.1fr;
    gap: 56px; align-items: center;
  }
  .about h2 {
    font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em;
    margin-bottom: 16px;
  }
  .about p { color: var(--muted); margin-bottom: 12px; font-size: 1.05rem; }
  .about-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px; padding: 32px;
  }

  .contact {
    text-align: center; padding: 100px 0;
  }
  .contact h2 {
    font-size: 2.4rem; font-weight: 800; margin-bottom: 14px;
  }
  .contact p { color: var(--muted); margin-bottom: 28px; font-size: 1.1rem; }

  footer {
    border-top: 1px solid var(--border);
    padding: 28px 0; text-align: center;
    color: var(--muted); font-size: 0.86rem;
  }

  @media (max-width: 800px) {
    .hero-grid, .projects, .about-grid { grid-template-columns: 1fr; }
    .hero-aside { text-align: left; margin-top: 24px; }
    .nav-links { display: none; }
    .menu-btn { display: block; }
    .project.wide .project-thumb { height: 200px; }
  }
</style>
</head>
<body>
  <nav>
    <div class="container nav-inner">
      <a href="#" class="logo">Lumen <span>Studio</span></a>
      <div class="nav-links">
        <a href="#work">Work</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </div>
      <button class="menu-btn">☰</button>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <div class="hero-grid">
        <div>
          <h1>Design that feels<br><span>considered</span></h1>
          <p>Brand, digital and print work for thoughtful businesses across New Zealand.</p>
          <a href="#work" class="btn">View selected work</a>
        </div>
        <div class="hero-aside">
          <strong>North Canterbury</strong>
          Independent design practice<br>
          Available for new projects
        </div>
      </div>
    </div>
  </header>

  <section id="work">
    <div class="container">
      <div class="section-label">Selected projects</div>
      <h2 class="section-title">Recent work</h2>
      <div class="projects">
        <article class="project wide">
          <div class="project-thumb" style="background: linear-gradient(135deg, #1e1b4b, #4c1d95, #7e22ce);">Brand system</div>
          <div class="project-body">
            <h3>Waipara Collective</h3>
            <p>Complete brand identity for a North Canterbury producer group — strategy, visual language and packaging direction.</p>
            <span class="tag">Branding</span>
          </div>
        </article>
        <article class="project">
          <div class="project-thumb" style="background: linear-gradient(135deg, #0f172a, #1e3a5f);">Website</div>
          <div class="project-body">
            <h3>Summit Inspect</h3>
            <p>Technical service website focused on trust and clarity.</p>
            <span class="tag">Web design</span>
          </div>
        </article>
        <article class="project">
          <div class="project-thumb" style="background: linear-gradient(135deg, #1c1917, #44403c);">Print</div>
          <div class="project-body">
            <h3>Riverstone Kitchen</h3>
            <p>Menu system and packaging for a local hospitality brand.</p>
            <span class="tag">Print & packaging</span>
          </div>
        </article>
        <article class="project">
          <div class="project-thumb" style="background: linear-gradient(135deg, #022c22, #064e3b);">Digital</div>
          <div class="project-body">
            <h3>Forge Local</h3>
            <p>Landing page and campaign assets for a product launch.</p>
            <span class="tag">Digital</span>
          </div>
        </article>
        <article class="project">
          <div class="project-thumb" style="background: linear-gradient(135deg, #431407, #9a3412);">Identity</div>
          <div class="project-body">
            <h3>Amberley Arts Trust</h3>
            <p>Logo and visual language for a community arts organisation.</p>
            <span class="tag">Branding</span>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="about" id="about">
    <div class="container">
      <div class="about-grid">
        <div>
          <h2>About the studio</h2>
          <p>Lumen is a small independent design practice based in North Canterbury. We work with clients who value clarity, craft and longevity over trends.</p>
          <p>Projects range from complete brand systems to focused website redesigns and print collateral.</p>
        </div>
        <div class="about-box">
          <p style="color:var(--muted);margin-bottom:18px">Currently available for new projects from September 2026.</p>
          <p style="font-weight:600;margin-bottom:6px">Selected capabilities</p>
          <p style="color:var(--muted)">Brand strategy & identity · Website design · Packaging · Art direction · Print design</p>
        </div>
      </div>
    </div>
  </section>

  <section class="contact" id="contact">
    <div class="container">
      <h2>Let’s talk about your project</h2>
      <p>Send a short note about what you’re working on.</p>
      <a href="mailto:hello@lumenstudio.example" class="btn">hello@lumenstudio.example</a>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>Lumen Studio · North Canterbury, New Zealand</p>
      <p style="margin-top:5px">Demo template by AetherForge · Demonstration only</p>
    </div>
  </footer>
</body>
</html>
`,
  },
  {
    slug: "pulse-community",
    name: "Pulse Community",
    category: "Forum & live chat app",
    tagline: "A community platform interface with threaded discussions and a working live-chat panel.",
    accent: "#8b5cf6",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pulse Community — Forum & Live Chat</title>
<style>
  :root {
    --bg: #0f0f13;
    --surface: #18181f;
    --surface2: #22222b;
    --border: #2e2e3a;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --accent: #8b5cf6;
    --accent2: #a78bfa;
    --green: #34d399;
    --blue: #38bdf8;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    min-height: 100vh;
  }
  a { color: inherit; text-decoration: none; }

  /* Top bar */
  .topbar {
    position: sticky; top: 0; z-index: 100;
    background: rgba(15,15,19,0.92);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
    height: 58px;
    display: flex; align-items: center;
  }
  .topbar-inner {
    width: 100%; max-width: 1280px; margin: 0 auto; padding: 0 20px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .logo {
    font-weight: 800; font-size: 1.15rem; letter-spacing: -0.02em;
    display: flex; align-items: center; gap: 8px;
  }
  .logo span { color: var(--accent2); }
  .logo-dot {
    width: 9px; height: 9px; background: var(--green);
    border-radius: 50%; box-shadow: 0 0 0 3px rgba(52,211,153,0.25);
  }
  .top-nav { display: flex; gap: 22px; align-items: center; }
  .top-nav a { font-size: 0.88rem; color: var(--muted); font-weight: 500; }
  .top-nav a:hover, .top-nav a.active { color: var(--text); }
  .online-count {
    font-size: 0.78rem; color: var(--green);
    background: rgba(52,211,153,0.1);
    border: 1px solid rgba(52,211,153,0.25);
    padding: 4px 10px; border-radius: 999px;
  }
  .menu-btn { display: none; background: none; border: none; color: white; font-size: 1.35rem; cursor: pointer; }

  /* Layout */
  .layout {
    max-width: 1280px; margin: 0 auto; padding: 20px;
    display: grid;
    grid-template-columns: 220px 1fr 320px;
    gap: 20px;
    min-height: calc(100vh - 58px);
  }

  /* Sidebar */
  .sidebar {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    height: fit-content;
    position: sticky; top: 78px;
  }
  .side-section { margin-bottom: 22px; }
  .side-title {
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--muted); margin-bottom: 10px;
  }
  .side-link {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px;
    font-size: 0.9rem; color: var(--muted);
    transition: background 0.15s, color 0.15s;
  }
  .side-link:hover, .side-link.active {
    background: var(--surface2); color: var(--text);
  }
  .side-link.active { color: var(--accent2); }

  /* Main content */
  .main {
    display: flex; flex-direction: column; gap: 16px;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
  }
  .panel-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .panel-header h2 { font-size: 0.95rem; font-weight: 700; }
  .panel-body { padding: 4px 0; }

  /* Forum threads */
  .thread {
    display: grid; grid-template-columns: 48px 1fr auto;
    gap: 14px; padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }
  .thread:last-child { border-bottom: none; }
  .thread:hover { background: rgba(255,255,255,0.02); }
  .avatar {
    width: 42px; height: 42px; border-radius: 10px;
    display: grid; place-items: center;
    font-weight: 700; font-size: 0.9rem; color: white;
  }
  .thread-title {
    font-weight: 600; font-size: 0.95rem; margin-bottom: 3px;
  }
  .thread-meta {
    font-size: 0.8rem; color: var(--muted);
  }
  .thread-stats {
    text-align: right; font-size: 0.8rem; color: var(--muted);
    white-space: nowrap;
  }
  .thread-stats strong { color: var(--text); display: block; font-size: 0.95rem; }

  /* Chat panel */
  .chat-panel {
    display: flex; flex-direction: column;
    height: calc(100vh - 100px);
    max-height: 720px;
    position: sticky; top: 78px;
  }
  .chat-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
  }
  .chat-header h2 { font-size: 0.95rem; font-weight: 700; }
  .live-dot {
    width: 8px; height: 8px; background: var(--green);
    border-radius: 50%;
    animation: pulse 1.8s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(52,211,153,0.4); }
    50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(52,211,153,0); }
  }
  .chat-messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .msg {
    display: flex; gap: 10px; max-width: 95%;
  }
  .msg.own { align-self: flex-end; flex-direction: row-reverse; }
  .msg-avatar {
    width: 32px; height: 32px; border-radius: 8px;
    flex-shrink: 0; display: grid; place-items: center;
    font-size: 0.75rem; font-weight: 700; color: white;
  }
  .msg-bubble {
    background: var(--surface2);
    border: 1px solid var(--border);
    padding: 10px 13px; border-radius: 12px;
    font-size: 0.9rem;
  }
  .msg.own .msg-bubble {
    background: rgba(139,92,246,0.18);
    border-color: rgba(139,92,246,0.35);
  }
  .msg-name {
    font-size: 0.75rem; font-weight: 600; color: var(--accent2);
    margin-bottom: 3px;
  }
  .msg.own .msg-name { color: var(--accent2); text-align: right; }
  .msg-time {
    font-size: 0.7rem; color: var(--muted); margin-top: 4px;
  }
  .chat-input-area {
    padding: 12px 14px;
    border-top: 1px solid var(--border);
    display: flex; gap: 10px;
  }
  .chat-input {
    flex: 1; background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px; padding: 11px 14px;
    color: var(--text); font-size: 0.9rem;
    outline: none;
  }
  .chat-input:focus { border-color: var(--accent); }
  .chat-send {
    background: var(--accent); color: white;
    border: none; border-radius: 10px;
    padding: 0 16px; font-weight: 700; font-size: 0.9rem;
    cursor: pointer; transition: opacity 0.15s;
  }
  .chat-send:hover { opacity: 0.9; }

  /* Online users */
  .online-list { padding: 8px 0; }
  .online-user {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px; font-size: 0.88rem;
  }
  .online-user .dot {
    width: 7px; height: 7px; background: var(--green);
    border-radius: 50%;
  }

  /* Mobile */
  @media (max-width: 980px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { display: none; }
    .chat-panel { position: static; max-height: 520px; }
    .menu-btn { display: block; }
    .top-nav { display: none; }
  }
</style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="logo">
        <div class="logo-dot"></div>
        Pulse <span>Community</span>
      </div>
      <div class="top-nav">
        <a href="#" class="active">Forum</a>
        <a href="#">Members</a>
        <a href="#">Events</a>
        <span class="online-count">● 47 online</span>
      </div>
      <button class="menu-btn" aria-label="Menu">☰</button>
    </div>
  </div>

  <div class="layout">
    <!-- Left sidebar -->
    <aside class="sidebar">
      <div class="side-section">
        <div class="side-title">Channels</div>
        <a href="#" class="side-link active"># general</a>
        <a href="#" class="side-link"># introductions</a>
        <a href="#" class="side-link"># projects</a>
        <a href="#" class="side-link"># feedback</a>
        <a href="#" class="side-link"># random</a>
      </div>
      <div class="side-section">
        <div class="side-title">Online now</div>
        <div class="online-list">
          <div class="online-user"><span class="dot"></span> Maya R.</div>
          <div class="online-user"><span class="dot"></span> Jordan K.</div>
          <div class="online-user"><span class="dot"></span> Alex T.</div>
          <div class="online-user"><span class="dot"></span> Sam W.</div>
          <div class="online-user"><span class="dot"></span> You</div>
        </div>
      </div>
    </aside>

    <!-- Main forum -->
    <main class="main">
      <div class="panel">
        <div class="panel-header">
          <h2>Recent Discussions</h2>
          <span style="font-size:0.8rem;color:var(--muted)">Sorted by activity</span>
        </div>
        <div class="panel-body">
          <div class="thread">
            <div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#6366f1)">MR</div>
            <div>
              <div class="thread-title">Best practices for local business websites in 2026?</div>
              <div class="thread-meta">Maya R. · Started 2h ago · last reply 12m ago</div>
            </div>
            <div class="thread-stats">
              <strong>28</strong> replies
            </div>
          </div>
          <div class="thread">
            <div class="avatar" style="background:linear-gradient(135deg,#0ea5e9,#38bdf8)">JK</div>
            <div>
              <div class="thread-title">Show your latest project — critique welcome</div>
              <div class="thread-meta">Jordan K. · Started yesterday · last reply 41m ago</div>
            </div>
            <div class="thread-stats">
              <strong>47</strong> replies
            </div>
          </div>
          <div class="thread">
            <div class="avatar" style="background:linear-gradient(135deg,#10b981,#34d399)">AT</div>
            <div>
              <div class="thread-title">Offline-first demos for client meetings — anyone doing this?</div>
              <div class="thread-meta">Alex T. · Started 4h ago · last reply 1h ago</div>
            </div>
            <div class="thread-stats">
              <strong>19</strong> replies
            </div>
          </div>
          <div class="thread">
            <div class="avatar" style="background:linear-gradient(135deg,#f59e0b,#fbbf24)">SW</div>
            <div>
              <div class="thread-title">Typography systems that actually feel premium</div>
              <div class="thread-meta">Sam W. · Started 1d ago · last reply 3h ago</div>
            </div>
            <div class="thread-stats">
              <strong>33</strong> replies
            </div>
          </div>
          <div class="thread">
            <div class="avatar" style="background:linear-gradient(135deg,#ec4899,#f472b6)">EL</div>
            <div>
              <div class="thread-title">How are you handling mobile navigation patterns this year?</div>
              <div class="thread-meta">Elena L. · Started 6h ago · last reply 55m ago</div>
            </div>
            <div class="thread-stats">
              <strong>22</strong> replies
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Pinned · Community Guidelines</h2>
        </div>
        <div style="padding:16px 18px;font-size:0.9rem;color:var(--muted)">
          Keep discussions constructive. Share work freely. Critique with care. This is a demonstration of a community platform interface — in a live build these threads would be fully interactive with real users, notifications, and moderation tools.
        </div>
      </div>
    </main>

    <!-- Live Chat -->
    <aside class="panel chat-panel">
      <div class="chat-header">
        <div class="live-dot"></div>
        <h2>Live Chat · #general</h2>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="msg">
          <div class="msg-avatar" style="background:#8b5cf6">MR</div>
          <div>
            <div class="msg-name">Maya R.</div>
            <div class="msg-bubble">Anyone else building offline demo packs for client meetings?</div>
            <div class="msg-time">2:14 pm</div>
          </div>
        </div>
        <div class="msg">
          <div class="msg-avatar" style="background:#0ea5e9">JK</div>
          <div>
            <div class="msg-name">Jordan K.</div>
            <div class="msg-bubble">Yes. Clients love being able to open them on the spot with no wifi.</div>
            <div class="msg-time">2:16 pm</div>
          </div>
        </div>
        <div class="msg">
          <div class="msg-avatar" style="background:#10b981">AT</div>
          <div>
            <div class="msg-name">Alex T.</div>
            <div class="msg-bubble">The chat simulation is a nice touch for showing interaction design.</div>
            <div class="msg-time">2:18 pm</div>
          </div>
        </div>
        <div class="msg">
          <div class="msg-avatar" style="background:#f59e0b">SW</div>
          <div>
            <div class="msg-name">Sam W.</div>
            <div class="msg-bubble">Agreed. Makes the demo feel alive.</div>
            <div class="msg-time">2:19 pm</div>
          </div>
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" id="chatInput" placeholder="Type a message…" autocomplete="off">
        <button class="chat-send" id="chatSend">Send</button>
      </div>
    </aside>
  </div>

  <script>
    const messages = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');

    function addMessage(text) {
      if (!text.trim()) return;
      const now = new Date();
      const time = now.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}).toLowerCase();
      const div = document.createElement('div');
      div.className = 'msg own';
      div.innerHTML = \`
        <div class="msg-avatar" style="background:#a78bfa">You</div>
        <div>
          <div class="msg-name">You</div>
          <div class="msg-bubble">\${text.replace(/</g,'&lt;')}</div>
          <div class="msg-time">\${time}</div>
        </div>\`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      input.value = '';
      input.focus();
    }

    sendBtn.addEventListener('click', () => addMessage(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addMessage(input.value);
    });
  </script>
</body>
</html>
`,
  },
  {
    slug: "kinetic-gear",
    name: "Kinetic Gear",
    category: "Product & media brand",
    tagline: "A product brand landing page with a custom interactive media player and pricing.",
    accent: "#10b981",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kinetic Gear — Product + Media Player</title>
<style>
  :root {
    --bg: #09090b;
    --surface: #18181b;
    --border: #27272a;
    --text: #fafafa;
    --muted: #a1a1aa;
    --accent: #10b981;
    --accent2: #34d399;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
  }
  a { color: inherit; text-decoration: none; }
  .container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }

  nav {
    position: sticky; top: 0; z-index: 50;
    background: rgba(9,9,11,0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    height: 62px;
    display: flex; align-items: center;
  }
  .nav-inner {
    width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .logo { font-weight: 800; font-size: 1.2rem; letter-spacing: -0.02em; }
  .logo span { color: var(--accent2); }
  .nav-links { display: flex; gap: 26px; align-items: center; }
  .nav-links a { font-size: 0.9rem; color: var(--muted); font-weight: 500; }
  .nav-links a:hover { color: var(--text); }
  .nav-cta {
    background: var(--accent); color: #09090b;
    padding: 9px 16px; border-radius: 8px; font-weight: 700; font-size: 0.88rem;
  }
  .menu-btn { display: none; background: none; border: none; color: white; font-size: 1.35rem; cursor: pointer; }

  /* Hero with player */
  .hero {
    padding: 64px 0 70px;
  }
  .hero-grid {
    display: grid; grid-template-columns: 1.1fr 1fr;
    gap: 48px; align-items: center;
  }
  .hero-badge {
    display: inline-block;
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent2);
    margin-bottom: 14px;
  }
  .hero h1 {
    font-size: clamp(2.2rem, 4.5vw, 3.1rem);
    font-weight: 800; letter-spacing: -0.035em;
    line-height: 1.1; margin-bottom: 16px;
  }
  .hero p {
    color: var(--muted); font-size: 1.1rem; margin-bottom: 28px; max-width: 440px;
  }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 22px; border-radius: 10px;
    font-weight: 700; font-size: 0.95rem;
    background: var(--accent); color: #09090b;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 28px -8px rgba(16,185,129,0.4);
  }

  /* Custom Video Player */
  .player {
    background: #000;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid var(--border);
    position: relative;
    aspect-ratio: 16/10;
    display: flex; flex-direction: column;
  }
  .player-stage {
    flex: 1;
    background: linear-gradient(145deg, #064e3b 0%, #022c22 50%, #0f172a 100%);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    cursor: pointer;
  }
  .player-stage::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 40%, rgba(16,185,129,0.25), transparent 60%);
  }
  .play-btn {
    width: 72px; height: 72px;
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(8px);
    border: 2px solid rgba(255,255,255,0.4);
    border-radius: 50%;
    display: grid; place-items: center;
    font-size: 1.6rem; color: white;
    transition: transform 0.2s, background 0.2s;
    z-index: 2;
  }
  .player-stage:hover .play-btn {
    transform: scale(1.08);
    background: rgba(16,185,129,0.35);
  }
  .player-label {
    position: absolute; bottom: 18px; left: 18px;
    font-size: 0.8rem; font-weight: 600;
    background: rgba(0,0,0,0.55);
    padding: 5px 11px; border-radius: 6px;
    z-index: 2;
  }
  .player-controls {
    background: #111;
    padding: 10px 14px;
    display: flex; align-items: center; gap: 12px;
  }
  .ctrl-btn {
    background: none; border: none; color: #d4d4d8;
    font-size: 1.1rem; cursor: pointer; width: 32px; height: 32px;
    display: grid; place-items: center; border-radius: 6px;
  }
  .ctrl-btn:hover { background: rgba(255,255,255,0.08); color: white; }
  .progress {
    flex: 1; height: 5px; background: #3f3f46;
    border-radius: 999px; position: relative; cursor: pointer;
  }
  .progress-fill {
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 32%; background: var(--accent);
    border-radius: 999px;
  }
  .progress-fill::after {
    content: "";
    position: absolute; right: -6px; top: 50%;
    transform: translateY(-50%);
    width: 12px; height: 12px;
    background: white; border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(16,185,129,0.4);
  }
  .time {
    font-size: 0.78rem; color: #a1a1aa; font-variant-numeric: tabular-nums;
    min-width: 78px; text-align: right;
  }

  /* Features */
  section { padding: 70px 0; }
  .section-label {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--accent2); margin-bottom: 10px;
    text-align: center;
  }
  .section-title {
    font-size: clamp(1.7rem, 3vw, 2.2rem);
    font-weight: 800; letter-spacing: -0.03em;
    text-align: center; margin-bottom: 40px;
  }
  .features {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  }
  .feature {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px; padding: 26px;
    text-align: center;
  }
  .feature-icon {
    width: 48px; height: 48px; margin: 0 auto 14px;
    background: rgba(16,185,129,0.12);
    border-radius: 12px; display: grid; place-items: center;
    font-size: 1.3rem;
  }
  .feature h3 { font-size: 1.05rem; margin-bottom: 7px; }
  .feature p { color: var(--muted); font-size: 0.9rem; }

  /* Pricing */
  .pricing { background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .pricing-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
    max-width: 920px; margin: 0 auto;
  }
  .price-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px; padding: 28px; text-align: center;
  }
  .price-card.featured {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .price-card h3 { font-size: 1.1rem; margin-bottom: 6px; }
  .price {
    font-size: 2.3rem; font-weight: 800; letter-spacing: -0.03em;
    margin: 10px 0 18px;
  }
  .price span { font-size: 0.95rem; font-weight: 500; color: var(--muted); }
  .price-card ul {
    list-style: none; text-align: left; margin-bottom: 22px;
    font-size: 0.88rem; color: var(--muted);
  }
  .price-card li { padding: 5px 0; }
  .price-card li::before { content: "✓ "; color: var(--accent2); font-weight: 700; }

  .cta {
    text-align: center; padding: 80px 0;
  }
  .cta h2 { font-size: 1.9rem; font-weight: 800; margin-bottom: 12px; }
  .cta p { color: var(--muted); margin-bottom: 24px; }

  footer {
    border-top: 1px solid var(--border);
    padding: 28px 0; text-align: center;
    color: var(--muted); font-size: 0.85rem;
  }

  @media (max-width: 860px) {
    .hero-grid { grid-template-columns: 1fr; }
    .features, .pricing-grid { grid-template-columns: 1fr; }
    .nav-links { display: none; }
    .menu-btn { display: block; }
  }
</style>
</head>
<body>
  <nav>
    <div class="nav-inner">
      <div class="logo">Kinetic <span>Gear</span></div>
      <div class="nav-links">
        <a href="#features">Features</a>
        <a href="#pricing">Pricing</a>
        <a href="#buy" class="nav-cta">Shop</a>
      </div>
      <button class="menu-btn">☰</button>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <div class="hero-grid">
        <div>
          <div class="hero-badge">New collection · 2026</div>
          <h1>Performance gear that moves with you</h1>
          <p>Lightweight construction, weather-ready materials, and details designed for real daily use.</p>
          <a href="#buy" class="btn">Shop the range →</a>
        </div>

        <!-- Custom Media Player -->
        <div class="player" id="player">
          <div class="player-stage" id="stage">
            <div class="play-btn" id="playBtn">▶</div>
            <div class="player-label">Product film · 0:48</div>
          </div>
          <div class="player-controls">
            <button class="ctrl-btn" id="playCtrl">▶</button>
            <div class="progress" id="progress">
              <div class="progress-fill" id="fill"></div>
            </div>
            <div class="time" id="time">0:15 / 0:48</div>
            <button class="ctrl-btn">🔊</button>
            <button class="ctrl-btn">⛶</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <section id="features">
    <div class="container">
      <div class="section-label">Why Kinetic</div>
      <h2 class="section-title">Built for daily performance</h2>
      <div class="features">
        <div class="feature">
          <div class="feature-icon">🪶</div>
          <h3>Ultra light</h3>
          <p>Premium materials that keep weight down without sacrificing durability.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">💧</div>
          <h3>Weather ready</h3>
          <p>Water-resistant finishes designed for New Zealand conditions.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🔧</div>
          <h3>Built to last</h3>
          <p>Reinforced stress points and quality hardware for years of use.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="pricing" id="pricing">
    <div class="container">
      <div class="section-label">Simple pricing</div>
      <h2 class="section-title">Choose your setup</h2>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Essentials</h3>
          <div class="price">$89 <span>NZD</span></div>
          <ul>
            <li>Core daypack</li>
            <li>Water bottle pocket</li>
            <li>Laptop sleeve</li>
            <li>1 year warranty</li>
          </ul>
          <a href="#buy" class="btn" style="width:100%;justify-content:center;font-size:0.9rem">Select</a>
        </div>
        <div class="price-card featured">
          <h3>Performance</h3>
          <div class="price">$149 <span>NZD</span></div>
          <ul>
            <li>Everything in Essentials</li>
            <li>Weather shell</li>
            <li>Extra organisation</li>
            <li>2 year warranty</li>
          </ul>
          <a href="#buy" class="btn" style="width:100%;justify-content:center;font-size:0.9rem">Select</a>
        </div>
        <div class="price-card">
          <h3>Pro</h3>
          <div class="price">$219 <span>NZD</span></div>
          <ul>
            <li>Everything in Performance</li>
            <li>Travel expansion</li>
            <li>Premium hardware</li>
            <li>Lifetime support</li>
          </ul>
          <a href="#buy" class="btn" style="width:100%;justify-content:center;font-size:0.9rem">Select</a>
        </div>
      </div>
    </div>
  </section>

  <section class="cta" id="buy">
    <div class="container">
      <h2>Ready to move better?</h2>
      <p>Free shipping on orders over $100 within New Zealand.</p>
      <a href="mailto:orders@kineticgear.example" class="btn">Contact to order</a>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>Kinetic Gear · Demo product brand with custom media player</p>
      <p style="margin-top:5px">Template by AetherForge · Offline demonstration</p>
    </div>
  </footer>

  <script>
    // Simple player simulation
    const stage = document.getElementById('stage');
    const playBtn = document.getElementById('playBtn');
    const playCtrl = document.getElementById('playCtrl');
    const fill = document.getElementById('fill');
    const timeEl = document.getElementById('time');
    let playing = false;
    let progress = 32;
    let interval;

    function togglePlay() {
      playing = !playing;
      playBtn.textContent = playing ? '❚❚' : '▶';
      playCtrl.textContent = playing ? '❚❚' : '▶';
      if (playing) {
        interval = setInterval(() => {
          progress = Math.min(progress + 0.8, 100);
          fill.style.width = progress + '%';
          const current = Math.floor((progress / 100) * 48);
          const m = Math.floor(current / 60);
          const s = String(current % 60).padStart(2, '0');
          timeEl.textContent = \`\${m}:\${s} / 0:48\`;
          if (progress >= 100) {
            clearInterval(interval);
            playing = false;
            playBtn.textContent = '▶';
            playCtrl.textContent = '▶';
          }
        }, 400);
      } else {
        clearInterval(interval);
      }
    }
    stage.addEventListener('click', togglePlay);
    playCtrl.addEventListener('click', togglePlay);
  </script>
</body>
</html>
`,
  },
];

export function getShowcaseDesign(slug: string): ShowcaseDesign | undefined {
  return WEBSITE_DESIGN_SHOWCASE.find((d) => d.slug === slug);
}
