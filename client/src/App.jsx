
import { useState, useEffect, useRef } from 'react'
import './App.css'

const BRAND_LOGOS = {
  'agency': { name: 'Your Agency Name', tagline: 'Powered by ReportReady — AI Readiness Audit for your clients' },
  'demo': { name: 'Demo Agency', tagline: 'Powered by ReportReady — AI Readiness Audit for your clients' }
};

function App() {
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const prefillDomain = urlParams.get('domain') || '';
  const brand = urlParams.get('brand') || '';
  
  const [url, setUrl] = useState(prefillDomain)
  const [report, setReport] = useState(null)
  const brandInfo = BRAND_LOGOS[brand] || null;
  const [whiteLabelName, setWhiteLabelName] = useState(brandInfo ? brandInfo.name : 'ReportReady')
      const [agencyNameInput, setAgencyNameInput] = useState('')
  const [showProModal, setShowProModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (prefillDomain && !autoSubmitted.current) {
      autoSubmitted.current = true;
      // Auto-run the audit when a domain is provided in the URL
      const runAutoAudit = async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: prefillDomain }) });
          if (!res.ok) throw new Error('Failed');
          setReport(await res.json());
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
      };
      setTimeout(runAutoAudit, 800);
    }
  }, [prefillDomain]);

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      if (!res.ok) throw new Error('Failed')
      setReport(await res.json())
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const getFixForIssue = (issue) => {
    switch (issue.category) {
      case 'SEO':
        if (issue.message.includes('page title')) return 'Go to your website settings and give your page a short, clear name. This helps AI describe you to customers.';
        if (issue.message.includes('too short') || issue.message.includes('too long')) return 'Make your page title about 5-10 words. Too short or too long and AI won\'t show you in results.';
        if (issue.message.includes('no summary') || issue.message.includes('description')) return 'Write 1-2 sentences about your business in your website settings. This is what ChatGPT shows people searching for you.';
        if (issue.message.includes('can\'t figure out') || issue.message.includes('what your page')) return 'Give your page one clear main title that says what you do. This helps AI match you to people searching.';
        if (issue.message.includes('confused')) return 'Your page has more than one main title. Pick one so AI knows what you\'re about.';
        return 'Ask your web person to check your page.';
      case 'Accessibility':
        if (issue.message.includes('image')) return 'Add a short description to each image so AI can show your products to customers. Most website builders have an "alt text" field when you click an image.';
        if (issue.message.includes('language')) return 'Set your website language in settings (usually "General" or "Site Settings"). This helps AI read your content correctly.';
        return 'Ask your web person to check your site.';
      case 'AI Readiness':
        return 'Ask your web person to add "Schema Markup" to your homepage. It helps ChatGPT show your business when people search for services like yours.';
      case 'Performance':
        if (issue.message.includes('slow')) return 'Your page loads too slow and AI gives up. Make images smaller, remove unused plugins, or upgrade hosting.';
        if (issue.message.includes('tools')) return 'Too many extra things on your site (chat boxes, trackers) — AI leaves before reading. Ask your web person to clean them up.';
        if (issue.message.includes('design')) return 'Too many design files slowing AI down. Ask your web person to combine them.';
        return 'Ask your web person to speed up your site.';
      default:
        return 'Upgrade to Pro for a step-by-step fix guide.';
    }
  }

  return <>
    <header>
      <div className="brand-header">
        <h1>{whiteLabelName}</h1>
      </div>
      <p className="tagline">{brandInfo ? brandInfo.tagline : "60% of people use AI to find businesses. If you're not visible in ChatGPT, your competitors get the traffic."}</p>
    </header>

    <main>
      <section className="search-section">
        <form onSubmit={handleSubmit}>
          <input type="url" placeholder="https://yourwebsite.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Analyzing...' : 'Generate Report'}</button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="trust-line">Secured - We scan public data only. Your URL is never stored.</p>
      </section>

      {!report && (
        <section className="how-it-works">
          <h2>Why This Matters</h2>
          <p className="how-it-works-sub">AI search is the fastest growing channel. Most businesses don't know they're invisible.</p>
        </section>
      )}

      {report && (
        <div className="results-container">
          <section className="report-section primary-report">
            <h2>Audit Results</h2>
            <p className="report-url">{report.url}</p>
            <div className="scores">
              {Object.entries(report.scores).map(([key, value]) => (
                <div key={key} className="score-card">
                  <h3>{key.charAt(0).toUpperCase() + key.slice(1)}</h3>
                  <div className={`score-circle score-${value > 80 ? 'high' : value > 50 ? 'med' : 'low'}`}>
                    <span className="score-value">{value}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="issues-summary">
              <h3>Red {report.issues.length} Issue{report.issues.length > 1 ? 's' : ''} Found</h3>
              <ol>
                {report.issues.slice(0, 5).map((issue, i) => (
                  <li key={i} className={`summary-item ${issue.severity}`}>
                    <strong>{issue.category}</strong> - {issue.message.split('.')[0]}.
                  </li>
                ))}
              </ol>
            </div>

            <div className="issues-list">
              <h3>Issues Identified</h3>
              <ul>
                {report.issues.map((issue, index) => (
                  <li key={index} className={`issue ${issue.severity}`}>
                    <div className="issue-main">
                      <span className="issue-category">{issue.category}</span>
                      <p className="issue-impact">{issue.message}</p>
                    </div>
                    <div className="issue-fix">
                      <span className="fix-label">Quick Fix:</span>
                      <p className="fix-text">{getFixForIssue(issue)}</p>
                      <div className="fix-cta">
                        <a className="mini-contact-btn" href="mailto:brooksmgroup@gmail.com?subject=ReportReady%20Fix%20Request&body=Here's%20the%20issue%20I%20need%20fixed%3A%0A%0A">Have us fix this for you</a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      {report && (
                  <div className="pro-cta-footer">
                    <p className="pro-cta-text">We monitor your site monthly so you stay visible in AI search</p>
                    <button className="download-btn" onClick={() => window.location.href='https://buy.stripe.com/bJe8wPg6C2Sr5lefVe73G00'}>Keep Getting Found - $29/mo</button>
                  </div>
                )}

                {report && (
                              <section className="agency-cta">
                                <h2>Agencies: Send This Report to Every Client</h2>
                                <p className="agency-cta-sub">Branded with your logo. Delivered monthly. Your clients see their score improve — you get a built-in reason to stay top of mind.</p>
                                                                    <div className="branded-preview">
                                                                      <label>See your brand in action:</label>
                                                                      <input
                                                                        type="text"
                                                                        className="branded-input"
                                                                        placeholder="Type your agency name..."
                                                                        value={agencyNameInput}
                                                                        onChange={(e) => {
                                                                          setAgencyNameInput(e.target.value);
                                                                          setWhiteLabelName(e.target.value || (brandInfo ? brandInfo.name : 'ReportReady'));
                                                                        }}
                                                                      />
                                                                      {agencyNameInput && <p className="branded-preview-note">↑ Check the header — it updates live as you type</p>}
                                                                    </div>
                                                                    <div className="agency-options">
                                  <div className="agency-option">
                                    <h3>💰 Charge Your Clients</h3>
                                    <p>$29/mo per client. 10 clients = $290/mo new revenue on a $99 flat cost.</p>
                                  </div>
                                  <div className="agency-option">
                                    <h3>🎁 Give It Away Free</h3>
                                    <p>Use it as a retention tool. Clients stay because you're the one keeping them visible.</p>
                                  </div>
                                </div>
                                <p className="agency-bottom"><strong>Either way, $99/mo unlimited.</strong> We run the scans. You take the credit.</p>
                                <button className="primary-btn agency-btn" onClick={() => window.location.href='https://buy.stripe.com/3cI14n8Ea3Wv5lebEY73G01'}>Add a Revenue Stream — $99/mo</button>
                              </section>
                            )}


        {!report && (
          <section className="how-it-works">
            <h2>Why This Matters</h2>
            <p className="how-it-works-sub">AI search is the fastest growing channel — ChatGPT, Google AI, Perplexity. Most businesses don't know they're invisible. Your competitors are probably fixing this right now.</p>
            <div className="steps">
              <div className="step">
                <span className="step-number">1</span>
                <h3>We Check Your Site</h3>
                <p>We look at your website the same way ChatGPT does. If something's wrong, we find it.</p>
              </div>
              <div className="step">
                <span className="step-number">2</span>
                <h3>We Tell You What's Broken</h3>
                <p>Simple list of what to fix — nothing technical. Give it to your web person.</p>
              </div>
              <div className="step">
                <span className="step-number">3</span>
                <h3>We Watch for You</h3>
                <p>AI changes. We re-check every month and alert you if something breaks. You're covered.</p>
              </div>
            </div>
          </section>
        )}
        {!report && (
          <section className="pricing-section">
            <h2>Pricing Plans</h2>
            <div className="pricing-grid">
              <div className="pricing-card">
                <h3>Free Check</h3>
                <p className="price">$0<span></span></p>
                <ul>
                  <li>Full AI-readiness audit</li>
                  <li>Score & issue breakdown</li>
                  <li>Quick Fix suggestions</li>
                  <li>No credit card needed</li>
                </ul>
                <button className="primary-btn" onClick={() => document.querySelector('.search-section input')?.focus()}>Try It Free</button>
              </div>
              <div className="pricing-card featured">
                <div className="popular-tag">FOR AGENCIES</div>
                <h3>Agency</h3>
                <p className="price">$99<span>/mo</span></p>
                <p className="pricing-subtitle">For agencies with clients. Add a new revenue line to every retainer.</p>
                <ul>
                  <li>Add a new service line to every client retainer</li>
                  <li>Unlimited client sites — one flat fee</li>
                  <li>White-label reports you can brand as your own</li>
                  <li>Bill clients $29-50/mo, keep the difference</li>
                  <li>Zero extra work — we run the scans, you take the credit</li>
                  <li>Monthly check-in reason to stay in front of clients</li>
                  <li>We fix issues for your clients</li>
                  <li>Priority support — replies within 4 hrs</li>
                </ul>
                <p className="agency-note">One subscription. Resell to your clients at whatever markup you want. <strong>10 clients at $29/mo = $290/mo new revenue on $99 cost.</strong></p>
                <button className="primary-btn agency-btn" onClick={() => window.location.href='https://buy.stripe.com/3cI14n8Ea3Wv5lebEY73G01'}>Add a Revenue Stream - $99/mo</button>
            </div>
            <div className="pricing-card featured">
                <div className="popular-tag">RECOMMENDED</div>
                <h3>Stay Covered</h3>
                <p className="price">$29<span>/mo</span></p>
                <ul>
                  <li>Monthly re-checks</li>
                  <li>AI disappearance alerts</li>
                  <li>Competitor comparison</li>
                  <li>Fix issues for you — $100/fix</li>
                  <li>Email support — replies within 24 hrs</li>
                </ul>
                <button className="primary-btn" onClick={() => window.location.href='https://buy.stripe.com/bJe8wPg6C2Sr5lefVe73G00'}>Stay Covered - $29/mo</button>
              </div>
            </div>
          </section>
        )}
    </main>

    <footer>
      <div className="footer-content">
        <p>(c) {new Date().getFullYear()} ReportReady. Professional Website Audits.</p>
        <p className="founder-line">Built by <a href="https://www.linkedin.com/in/bryan-robinson-7044b0344" target="_blank">Bryan Robinson</a></p>
        <div className="footer-links">
          <a className="link-btn" href="/terms">Terms of Service</a>
          <a className="link-btn" href="/refund">Refund Policy</a>
          <a className="link-btn" href="/privacy">Privacy Policy</a>
          <span className="link-btn">Support: brooksmgroup@gmail.com</span>
        </div>
      </div>
    </footer>
  </>
}

export default App
