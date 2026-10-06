// Landing page markup, converted from the original index.html.
// Interactive behaviour (menu, scroll effects) lives in LandingEffects.tsx.
import type React from "react";

export default function LandingMarkup() {
  return (
    <>
      {/* SVG icon sprite */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <symbol id="i-bank" viewBox="0 0 24 24"><path d="M3 21h18M4 10h16M5.5 10v8M9.8 10v8M14.2 10v8M18.5 10v8M12 3 3 8h18z"/></symbol>
          <symbol id="i-print" viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/><path d="M17 12h.01"/></symbol>
          <symbol id="i-aadhaar" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="10" r="3"/><path d="M7 18c1-2.4 3-3.5 5-3.5s4 1.1 5 3.5"/></symbol>
          <symbol id="i-vote" viewBox="0 0 24 24"><path d="M4 13h16v8H4z"/><path d="M7 13V3h10v10"/><path d="m9.5 8 1.8 1.8 3.2-3.3"/><path d="M2 13h20"/></symbol>
          <symbol id="i-pan" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h6M6 12h7M6 15h4"/><rect x="15" y="9" width="4" height="5" rx="1"/></symbol>
          <symbol id="i-cert" viewBox="0 0 24 24"><path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l4 4v3"/><path d="M8 8h5M8 12h5M8 16h3"/><circle cx="18" cy="15" r="3"/><path d="m16.5 17.6-.5 3.4 2-1 2 1-.5-3.4"/></symbol>
          <symbol id="i-file" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></symbol>
          <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></symbol>
          <symbol id="i-mobile" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/><path d="M10 8h4M10 8c1.7 0 2.5.8 2.5 1.8S11.7 11.6 10 11.6l3 2.9M10 9.8h4"/></symbol>
          <symbol id="i-passport" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="10" r="3.5"/><path d="M8.5 10h7M12 6.5c.9 1 1.4 2.2 1.4 3.5s-.5 2.5-1.4 3.5c-.9-1-1.4-2.2-1.4-3.5s.5-2.5 1.4-3.5M9 17.5h6"/></symbol>
          <symbol id="i-licence" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.5-1.3 1.6-2 3-2s2.5.7 3 2M14 9h5M14 12h5M14 15h3"/></symbol>
          <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></symbol>
          <symbol id="i-finger" viewBox="0 0 24 24"><path d="M12 11v3a8 8 0 0 1-1 4"/><path d="M8.6 7.3A6 6 0 0 1 18 12v1.5"/><path d="M6 11a6 6 0 0 1 .6-2.6"/><path d="M6 15c0 1-.2 2-.6 3"/><path d="M9 12a3 3 0 0 1 6 0v2a12 12 0 0 1-1.2 5.5"/><path d="M17.7 17.5c-.2.9-.4 1.7-.7 2.5"/><path d="M4.5 6.5A9.5 9.5 0 0 1 20 7"/></symbol>
          <symbol id="i-stamp" viewBox="0 0 24 24"><path d="M5 21h14"/><path d="M5 17h14v-2a2 2 0 0 0-2-2h-2.5l-.5-3a3 3 0 1 0-4 0l-.5 3H7a2 2 0 0 0-2 2z"/></symbol>
          <symbol id="i-card" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></symbol>
          <symbol id="i-cash" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></symbol>
          <symbol id="i-handcoins" viewBox="0 0 24 24"><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/></symbol>
          <symbol id="i-plane" viewBox="0 0 24 24"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></symbol>
          <symbol id="i-train" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M12 3v7M8 21l2-4M16 21l-2-4"/><path d="M8.5 13.5h.01M15.5 13.5h.01"/></symbol>
          <symbol id="i-bus" viewBox="0 0 24 24"><path d="M8 6v6M16 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2s-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></symbol>
          <symbol id="i-busfront" viewBox="0 0 24 24"><path d="M4 6 2 7M10 6h4M22 7l-2-1"/><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M8 15h.01M16 15h.01M6 19v2M18 21v-2"/></symbol>
          <symbol id="i-car" viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></symbol>
          <symbol id="i-tag" viewBox="0 0 24 24"><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/></symbol>
          <symbol id="i-shieldcar" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M8 14.5V13l1.2-2.5h5.6L16 13v1.5zM9.5 14.5v1.3M14.5 14.5v1.3"/></symbol>
          <symbol id="i-phone" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></symbol>
          <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></symbol>
          <symbol id="i-chat" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9 10.5c0 2.5 2 4.5 4.5 4.5l1-1.2-1.6-.9-.7.6c-.8-.3-1.4-1-1.7-1.7l.6-.7-.9-1.6L9 10.5"/></symbol>
          <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
          <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
          <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></symbol>
          <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
          <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></symbol>
          <symbol id="i-heart" viewBox="0 0 24 24"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></symbol>
          <symbol id="i-monitor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="3.5"/><path d="M8.5 10h7M12 6.5c.9 1 1.3 2.2 1.3 3.5s-.4 2.5-1.3 3.5c-.9-1-1.3-2.2-1.3-3.5s.4-2.5 1.3-3.5"/></symbol>
          <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3"/></symbol>
          <symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></symbol>
          <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
          <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
          <symbol id="i-docs" viewBox="0 0 24 24"><path d="M9 3h7l4 4v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2"/><path d="M16 3v4h4M4 7v12a2 2 0 0 0 2 2h9"/></symbol>
      
          {/* Lotus brand mark */}
          <symbol id="lotus" viewBox="0 0 48 48">
            <defs>
              <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f6e3ad"/><stop offset=".55" stopColor="#e2bd67"/><stop offset="1" stopColor="#b08834"/>
              </linearGradient>
            </defs>
            <path fill="url(#lg-gold)" d="M24 8c4 4.5 6 9 6 13.5 0 4-2.2 7.6-6 10.5-3.8-2.9-6-6.5-6-10.5C18 17 20 12.5 24 8z"/>
            <path fill="url(#lg-gold)" opacity=".85" d="M10 17c5 .3 9 2.2 11.5 5.6 2 2.8 2.6 6 2.5 9.4-3.6.3-7-.5-9.6-2.8C11.7 26.6 10.4 22.4 10 17zM38 17c-5 .3-9 2.2-11.5 5.6-2 2.8-2.6 6-2.5 9.4 3.6.3 7-.5 9.6-2.8 2.7-2.6 4-6.8 4.4-12.2z"/>
            <path fill="url(#lg-gold)" opacity=".6" d="M4 27c4.5-.8 9 0 13 2.6 2.6 1.7 4.8 3.8 7 6.4-4.6 1.4-9.3 1.2-13.2-.8C7.6 33.6 5.4 30.8 4 27zM44 27c-4.5-.8-9 0-13 2.6-2.6 1.7-4.8 3.8-7 6.4 4.6 1.4 9.3 1.2 13.2-.8 3.2-1.6 5.4-4.4 6.8-8.2z"/>
            <path fill="none" stroke="#d6b062" strokeWidth="1.6" strokeLinecap="round" d="M10 41h28"/>
          </symbol>
      
          {/* Mandala ornament */}
          <symbol id="mandala" viewBox="0 0 200 200">
            <g fill="none" stroke="currentColor" strokeWidth=".6">
              <circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="88"/><circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="34"/><circle cx="100" cy="100" r="14"/>
              <g id="petal-ring">
                <path d="M100 4c8 14 8 28 0 42-8-14-8-28 0-42z"/>
                <path d="M100 40c6 10 6 20 0 30-6-10-6-20 0-30z"/>
              </g>
              <use href="#petal-ring" transform="rotate(22.5 100 100)"/><use href="#petal-ring" transform="rotate(45 100 100)"/><use href="#petal-ring" transform="rotate(67.5 100 100)"/>
              <use href="#petal-ring" transform="rotate(90 100 100)"/><use href="#petal-ring" transform="rotate(112.5 100 100)"/><use href="#petal-ring" transform="rotate(135 100 100)"/><use href="#petal-ring" transform="rotate(157.5 100 100)"/>
              <use href="#petal-ring" transform="rotate(180 100 100)"/><use href="#petal-ring" transform="rotate(202.5 100 100)"/><use href="#petal-ring" transform="rotate(225 100 100)"/><use href="#petal-ring" transform="rotate(247.5 100 100)"/>
              <use href="#petal-ring" transform="rotate(270 100 100)"/><use href="#petal-ring" transform="rotate(292.5 100 100)"/><use href="#petal-ring" transform="rotate(315 100 100)"/><use href="#petal-ring" transform="rotate(337.5 100 100)"/>
            </g>
          </symbol>
        </defs>
      </svg>
      
      {/* ============ NAVBAR ============ */}
      <div className="nav-wrap">
        <nav className="nav" id="nav" aria-label="Primary">
          <a href="#top" className="brand" aria-label="Annapurna — home">
            <svg className="brand-mark"><use href="#lotus"/></svg>
            <span>
              <span className="brand-name">Annapurna</span>
              <span className="brand-sub">అన్నపూర్ణ ఆన్‌లైన్ సర్వీసెస్</span>
            </span>
          </a>
          <ul className="nav-links">
            <li><a href="#services">Services</a></li>
            <li><a href="#travel">Tours &amp; Travels</a></li>
            <li><a href="#why">Why Us</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <a className="nav-cta" href="tel:+919949810683"><svg className="icon"><use href="#i-phone"/></svg>Call Now</a>
          <button className="menu-btn" id="menuBtn" aria-label="Open menu" aria-expanded="false" aria-controls="mobilePanel">
            <svg className="icon"><use href="#i-menu"/></svg>
          </button>
        </nav>
        <div className="mobile-panel" id="mobilePanel">
          <a href="#services">Services</a>
          <a href="#travel">Tours &amp; Travels</a>
          <a href="#why">Why Us</a>
          <a href="#contact">Contact</a>
          <a className="nav-cta" href="tel:+919949810683"><svg className="icon"><use href="#i-phone"/></svg>Call 99498 10683</a>
        </div>
      </div>
      
      <main id="top">
      
      {/* ============ HERO ============ */}
      <section className="hero">
        <svg className="mandala" aria-hidden="true"><use href="#mandala"/></svg>
        <div className="container hero-grid">
          <div>
            <span className="eyebrow reveal"><span className="eyebrow-dot"><svg className="icon"><use href="#i-star"/></svg></span>Online Services · Tours &amp; Travels</span>
            <p className="hero-te reveal" style={{ "--d": ".05s" } as React.CSSProperties}>అన్నపూర్ణ ఆన్‌లైన్ సర్వీసెస్ &amp; అన్నపూర్ణ టూర్స్ &amp; ట్రావెల్స్</p>
            <h1 className="reveal" style={{ "--d": ".1s" } as React.CSSProperties}>Every service you need, <span className="gold-text">under one roof.</span></h1>
            <p className="hero-lead reveal" style={{ "--d": ".15s" } as React.CSSProperties}>From Aadhaar, PAN and certificates to bill payments, AEPS cash withdrawal and flight, train &amp; bus tickets — handled quickly, carefully and close to home.</p>
            <p className="hero-tag te-sans reveal" style={{ "--d": ".2s" } as React.CSSProperties}>మీ అవసరాలన్నింటికీ ఒకే చోట… వేగవంతమైన సేవలు… మీ సౌలభ్యం కోసం…</p>
            <div className="hero-actions reveal" style={{ "--d": ".25s" } as React.CSSProperties}>
              <a className="btn btn-gold" href="tel:+919949810683"><svg className="icon"><use href="#i-phone"/></svg>Call 99498 10683</a>
              <a className="btn btn-ghost" href="#services">Explore Services <svg className="icon"><use href="#i-arrow"/></svg></a>
            </div>
            <div className="hero-meta reveal" style={{ "--d": ".3s" } as React.CSSProperties}>
              <div><svg className="icon"><use href="#i-layers"/></svg>20+ services, one counter</div>
              <div><svg className="icon"><use href="#i-clock"/></svg>Fast, same-visit help</div>
              <div><svg className="icon"><use href="#i-shield"/></svg>Safe &amp; trusted</div>
            </div>
          </div>
      
          <div className="hero-visual" aria-hidden="true">
            <div className="orb a"></div><div className="orb b"></div>
      
            <div className="glass card-services">
              <div className="cs-head">
                <div className="cs-title">Online Services<small>Documents · Payments · Banking</small></div>
                <span className="live-pill"><i></i>Open</span>
              </div>
              <div className="cs-grid">
                <div className="cs-item"><svg className="icon"><use href="#i-aadhaar"/></svg>Aadhaar</div>
                <div className="cs-item"><svg className="icon"><use href="#i-pan"/></svg>PAN Card</div>
                <div className="cs-item"><svg className="icon"><use href="#i-passport"/></svg>Passport</div>
                <div className="cs-item"><svg className="icon"><use href="#i-zap"/></svg>Bill Pay</div>
                <div className="cs-item"><svg className="icon"><use href="#i-cert"/></svg>Certificates</div>
                <div className="cs-item"><svg className="icon"><use href="#i-finger"/></svg>AEPS</div>
                <div className="cs-item"><svg className="icon"><use href="#i-stamp"/></svg>e-Stamp</div>
                <div className="cs-item"><svg className="icon"><use href="#i-mobile"/></svg>Recharge</div>
              </div>
            </div>
      
            <div className="glass card-badge">
              <span className="badge-ic"><svg className="icon"><use href="#i-handcoins"/></svg></span>
              <span className="badge-txt"><b>Aadhaar Cash</b><span>Withdrawal available</span></span>
            </div>
      
            <div className="glass card-ticket">
              <div className="tk-top">
                <span className="tk-label">Tours &amp; Travels</span>
                <span className="tk-mode">
                  <span><svg className="icon"><use href="#i-plane"/></svg></span>
                  <span><svg className="icon"><use href="#i-train"/></svg></span>
                  <span><svg className="icon"><use href="#i-bus"/></svg></span>
                </span>
              </div>
              <div className="tk-route">
                <div className="tk-city">Your town<small>Departure</small></div>
                <div className="tk-line"><svg className="icon"><use href="#i-plane"/></svg></div>
                <div className="tk-city" style={{ textAlign: "right" }}>Anywhere<small>Destination</small></div>
              </div>
              <div className="tk-foot"><span>Flights · Trains · Buses · Cars</span><b>Book with us →</b></div>
            </div>
          </div>
        </div>
      </section>
      
      {/* ============ MARQUEE ============ */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span>Aadhaar Services</span><span>PAN Card</span><span>Passport</span><span>Voter ID</span><span>Flight Tickets</span><span>Train Tickets</span><span>APSRTC Buses</span><span>AEPS Cash Withdrawal</span><span>e-Stamp</span><span>FASTag</span><span>Electricity Bills</span><span>Insurance</span>
          <span>Aadhaar Services</span><span>PAN Card</span><span>Passport</span><span>Voter ID</span><span>Flight Tickets</span><span>Train Tickets</span><span>APSRTC Buses</span><span>AEPS Cash Withdrawal</span><span>e-Stamp</span><span>FASTag</span><span>Electricity Bills</span><span>Insurance</span>
        </div>
      </div>
      
      {/* ============ PILLARS ============ */}
      <section className="section">
        <div className="container">
          <div className="section-head center reveal">
            <span className="kicker">Two businesses, one promise</span>
            <h2 className="section-title">Simple help for life's <em>everyday paperwork</em> — and every journey.</h2>
            <p className="section-sub">Walk in with a need, walk out with it done. Our team guides you through every form, payment and booking.</p>
          </div>
          <div className="pillars">
            <a href="#services" className="pillar online reveal">
              <div className="pillar-bg"><svg className="icon"><use href="#i-monitor"/></svg></div>
              <div className="pillar-ic"><svg className="icon"><use href="#i-monitor"/></svg></div>
              <div>
                <h3>Online Services</h3>
                <p className="te">అన్నపూర్ణ ఆన్‌లైన్ సర్వీసెస్</p>
                <p className="desc">Government documents, certificates, banking, bill payments, insurance and cash withdrawal — all at one desk.</p>
              </div>
              <span className="pillar-link">View all services <svg className="icon"><use href="#i-arrow"/></svg></span>
            </a>
            <a href="#travel" className="pillar travel reveal" style={{ "--d": ".1s" } as React.CSSProperties}>
              <div className="pillar-bg"><svg className="icon"><use href="#i-globe"/></svg></div>
              <div className="pillar-ic"><svg className="icon"><use href="#i-plane"/></svg></div>
              <div>
                <h3>Tours &amp; Travels</h3>
                <p className="te">అన్నపూర్ణ టూర్స్ &amp; ట్రావెల్స్</p>
                <p className="desc">Flight, train and bus tickets, APSRTC reservations, car bookings, FASTag and vehicle insurance.</p>
              </div>
              <span className="pillar-link">Plan your trip <svg className="icon"><use href="#i-arrow"/></svg></span>
            </a>
          </div>
        </div>
      </section>
      
      {/* ============ ONLINE SERVICES ============ */}
      <section className="section services-bg" id="services">
        <div className="container">
          <div className="section-head reveal">
            <span className="kicker">Online Services</span>
            <h2 className="section-title">Documents, payments &amp; banking — <em>done right.</em></h2>
            <p className="section-sub te-sans">ఆధార్, పాన్, సర్టిఫికెట్లు, బిల్లు చెల్లింపులు — అన్నీ ఒకే చోట.</p>
          </div>
      
          <div className="svc-grid">
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-bank"/></svg></div><h4>Bank / Online Services</h4><p>Online banking help, form filling and digital applications.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-print"/></svg></div><h4>Xerox / Printing</h4><p>Photocopies and document printing, quick and clear.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-aadhaar"/></svg></div><h4>Aadhaar Services</h4><p>Aadhaar-related applications and assistance.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-vote"/></svg></div><h4>Voter ID Services</h4><p>Voter ID applications and corrections.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-pan"/></svg></div><h4>PAN Card Services</h4><p>New PAN applications and corrections.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-cert"/></svg></div><h4>Birth / Death Certificates</h4><p>Certificate applications, without the running around.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-file"/></svg></div><h4>Income / Caste Certificates</h4><p>Applications for income and caste certificates.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-zap"/></svg></div><h4>Electricity Bill Payments</h4><p>Pay your power bill in a minute.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-mobile"/></svg></div><h4>Mobile Recharge</h4><p>Prepaid recharges for your mobile number.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-passport"/></svg></div><h4>Passport Services</h4><p>Passport application and appointment assistance.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-licence"/></svg></div><h4>Driving Licence</h4><p>Licence applications and renewal assistance.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-shield"/></svg></div><h4>Insurance Services</h4><p>Insurance plans and premium payments.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-finger"/></svg></div><h4>AEPS Services</h4><p>Aadhaar-enabled banking with your fingerprint.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-stamp"/></svg></div><h4>e-Stamp Services</h4><p>e-Stamp paper for agreements and documents.</p></article>
            <article className="svc reveal"><div className="svc-ic"><svg className="icon"><use href="#i-card"/></svg></div><h4>Credit Card Services</h4><p>Credit card bill payments and support.</p></article>
          </div>
      
          <div className="cash reveal">
            <div className="cash-item">
              <div className="cash-ic"><svg className="icon"><use href="#i-card"/></svg></div>
              <div>
                <span className="cash-tag">Instant cash</span>
                <h4>Credit Card Cash Withdrawal</h4>
                <p>Need cash urgently? Withdraw against your credit card at our counter.</p>
              </div>
            </div>
            <div className="cash-item">
              <div className="cash-ic"><svg className="icon"><use href="#i-handcoins"/></svg></div>
              <div>
                <span className="cash-tag">No card needed</span>
                <h4>Aadhaar Cash Withdrawal</h4>
                <p>Withdraw money from your bank account using just your Aadhaar and fingerprint.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* ============ TOURS & TRAVELS ============ */}
      <section className="section travel" id="travel">
        <div className="container travel-grid">
          <div className="route-art reveal" aria-hidden="true">
            <svg className="paths" viewBox="0 0 400 400">
              <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(241,217,154,.25)" strokeWidth="1"/>
              <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(241,217,154,.7)" strokeWidth="1.4" className="dash"/>
              <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1"/>
              <circle cx="200" cy="200" r="105" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1"/>
            </svg>
            <div className="route-center"><b>Explore<br />Travel<br />Experience</b></div>
            <div className="route-node glass" style={{ left: "50%", top: "12.5%" }}><svg className="icon"><use href="#i-plane"/></svg></div>
            <div className="route-node glass" style={{ left: "87.5%", top: "50%" }}><svg className="icon"><use href="#i-train"/></svg></div>
            <div className="route-node glass" style={{ left: "50%", top: "87.5%" }}><svg className="icon"><use href="#i-bus"/></svg></div>
            <div className="route-node glass" style={{ left: "12.5%", top: "50%" }}><svg className="icon"><use href="#i-car"/></svg></div>
          </div>
      
          <div>
            <div className="section-head reveal" style={{ marginBottom: "0" }}>
              <span className="kicker">Tours &amp; Travels</span>
              <h2 className="section-title">Book your next journey <em>with ease.</em></h2>
              <p className="section-sub">Air, rail or road — tell us where you're going and we'll take care of the tickets.</p>
            </div>
            <div className="travel-list">
              <div className="t-item wide reveal"><span className="t-ic"><svg className="icon"><use href="#i-plane"/></svg></span><div><h4>Flight Tickets</h4><p>Domestic flights on IndiGo, Air India and more.</p></div></div>
              <div className="t-item reveal"><span className="t-ic"><svg className="icon"><use href="#i-train"/></svg></span><div><h4>Train Tickets</h4><p>Reserved train bookings.</p></div></div>
              <div className="t-item reveal" style={{ "--d": ".05s" } as React.CSSProperties}><span className="t-ic"><svg className="icon"><use href="#i-bus"/></svg></span><div><h4>Bus Tickets</h4><p>Bus bookings across routes.</p></div></div>
              <div className="t-item reveal"><span className="t-ic"><svg className="icon"><use href="#i-busfront"/></svg></span><div><h4>APSRTC Bus Tickets</h4><p>APSRTC reservations.</p></div></div>
              <div className="t-item reveal" style={{ "--d": ".05s" } as React.CSSProperties}><span className="t-ic"><svg className="icon"><use href="#i-car"/></svg></span><div><h4>Car / Travel Booking</h4><p>Cars for trips and tours.</p></div></div>
              <div className="t-item reveal"><span className="t-ic"><svg className="icon"><use href="#i-tag"/></svg></span><div><h4>FASTag Services</h4><p>New FASTag and recharges.</p></div></div>
              <div className="t-item reveal" style={{ "--d": ".05s" } as React.CSSProperties}><span className="t-ic"><svg className="icon"><use href="#i-shieldcar"/></svg></span><div><h4>Vehicle Insurance</h4><p>New policies and renewals.</p></div></div>
            </div>
            <div className="explore reveal">Explore <i></i> Travel <i></i> Experience</div>
          </div>
        </div>
      </section>
      
      {/* ============ WHY US ============ */}
      <section className="section" id="why">
        <div className="container">
          <div className="section-head center reveal">
            <span className="kicker">Why Annapurna</span>
            <h2 className="section-title">Service you can <em>count on.</em></h2>
            <p className="section-sub te-sans">వేగవంతమైన సేవలు… మీ సౌలభ్యం కోసం…</p>
          </div>
          <div className="why-grid">
            <div className="why reveal"><span className="why-num">01</span><div className="why-ic"><svg className="icon"><use href="#i-layers"/></svg></div><h4>One-stop counter</h4><p>Documents, payments, banking and travel — no need to visit five different offices.</p></div>
            <div className="why reveal" style={{ "--d": ".08s" } as React.CSSProperties}><span className="why-num">02</span><div className="why-ic"><svg className="icon"><use href="#i-clock"/></svg></div><h4>Fast turnaround</h4><p>Most payments, recharges and bookings are completed while you wait.</p></div>
            <div className="why reveal" style={{ "--d": ".16s" } as React.CSSProperties}><span className="why-num">03</span><div className="why-ic"><svg className="icon"><use href="#i-shield"/></svg></div><h4>Safe &amp; secure</h4><p>Your documents and personal details are handled with care and privacy.</p></div>
            <div className="why reveal" style={{ "--d": ".24s" } as React.CSSProperties}><span className="why-num">04</span><div className="why-ic"><svg className="icon"><use href="#i-heart"/></svg></div><h4>Friendly guidance</h4><p>We explain every step in Telugu or English, so you always know what's happening.</p></div>
          </div>
        </div>
      </section>
      
      {/* ============ HOW IT WORKS ============ */}
      <section className="section steps-wrap">
        <div className="container">
          <div className="section-head center reveal">
            <span className="kicker">How it works</span>
            <h2 className="section-title">Three steps. <em>That's it.</em></h2>
          </div>
          <div className="steps">
            <div className="step reveal"><div className="step-dot">1</div><h4>Call or walk in</h4><p>Tell us what you need — a certificate, a bill payment or a ticket.</p></div>
            <div className="step reveal" style={{ "--d": ".1s" } as React.CSSProperties}><div className="step-dot">2</div><h4>Share your details</h4><p>Bring the required documents; we'll tell you exactly what's needed.</p></div>
            <div className="step reveal" style={{ "--d": ".2s" } as React.CSSProperties}><div className="step-dot">3</div><h4>Consider it done</h4><p>We process it right away and keep you updated until it's complete.</p></div>
          </div>
        </div>
      </section>
      
      {/* ============ CONTACT ============ */}
      <section className="section" id="contact">
        <div className="container">
          <div className="cta reveal">
            <svg className="mandala" aria-hidden="true"><use href="#mandala"/></svg>
            <p className="te">మమ్మల్ని సంప్రదించండి</p>
            <h2>Let's get it done — <span className="gold-text">today.</span></h2>
            <p className="lead">Call us, message us on WhatsApp, or send an email. We're happy to help with any service or booking.</p>
            <div className="contact-cards">
              <a className="cc glass" href="tel:+919949810683">
                <span className="cc-ic phone"><svg className="icon"><use href="#i-phone"/></svg></span>
                <span><small>Call us</small><b>99498 10683</b></span>
              </a>
              <a className="cc glass" href="https://wa.me/919949810683" target="_blank" rel="noopener">
                <span className="cc-ic wa"><svg className="icon"><use href="#i-chat"/></svg></span>
                <span><small>WhatsApp</small><b>Chat with us</b></span>
              </a>
              <a className="cc glass" href="mailto:mclaponline@gmail.com">
                <span className="cc-ic mail"><svg className="icon"><use href="#i-mail"/></svg></span>
                <span><small>Email</small><b>mclaponline<wbr />@gmail.com</b></span>
              </a>
            </div>
          </div>
        </div>
      </section>
      
      </main>
      
      {/* ============ FOOTER ============ */}
      <footer>
        <div className="container">
          <div className="foot">
            <div>
              <a href="#top" className="brand">
                <svg className="brand-mark"><use href="#lotus"/></svg>
                <span><span className="brand-name">Annapurna</span><span className="brand-sub">Online Services · Tours &amp; Travels</span></span>
              </a>
              <p className="foot-te">అన్నపూర్ణ ఆన్‌లైన్ సర్వీసెస్ &amp; అన్నపూర్ణ టూర్స్ &amp; ట్రావెల్స్ — మీ అవసరాలన్నింటికీ ఒకే చోట.</p>
            </div>
            <div className="foot-links">
              <div>
                <h5>Explore</h5>
                <ul><li><a href="#services">Online Services</a></li><li><a href="#travel">Tours &amp; Travels</a></li><li><a href="#why">Why Us</a></li></ul>
              </div>
              <div>
                <h5>Contact</h5>
                <ul><li><a href="tel:+919949810683">99498 10683</a></li><li><a href="mailto:mclaponline@gmail.com">mclaponline@gmail.com</a></li><li><a href="https://wa.me/919949810683" target="_blank" rel="noopener">WhatsApp</a></li></ul>
              </div>
            </div>
          </div>
          <div className="copy">
            <span>© <span id="yr">{new Date().getFullYear()}</span> Annapurna Online Services. All rights reserved.</span>
            <span>Explore · Travel · Experience · <a href="/login" className="admin-link">Admin login</a></span>
          </div>
        </div>
      </footer>
      
      <a className="fab" href="https://wa.me/919949810683" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4M12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 0 1 2.2 12C2.2 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 6.9 2.9a9.7 9.7 0 0 1 2.9 6.9c0 5.4-4.4 9.8-9.8 9.8M20.5 3.5A11.8 11.8 0 0 0 12 0C5.5 0 .1 5.3.1 11.9c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.7a11.9 11.9 0 0 0 5.7 1.5c6.6 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.2-3.4-8.4"/></svg>
      </a>
    </>
  );
}
