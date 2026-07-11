
import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const prefillDomain = urlParams.get('domain') || '';
  
  const [url, setUrl] = useState(prefillDomain)
  const [report, setReport] = useState(null)
  const [whiteLabelName, setWhiteLabelName] = useState('ReportReady')
  const [showProModal, setShowProModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (prefillDomain && !autoSubmitted.current) {
      autoSubmitted.current = true;
      setTimeout(() => document.querySelector('form')?.requestSubmit(), 500);
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
        if (issue.message.includes('Add a simple page title')) return 'Go to your website settings and type a short name for your page. This tells ChatGPT what to call you.';
        if (issue.message.includes('too short') || issue.message.includes('too long')) return 'Make your page title about 5-10 words so AI doesn\'t skip you.';
        if (issue.message.includes('Add a short description')) return 'Write 1-2 sentences about your business in settings under "Meta Description". This is what ChatGPT shows people.';
        if (issue.message.includes('can\'t figure out') || issue.message.includes('won\'t find you')) return 'Give your page one clear main title that says what you do. Most builders have a "Page Title" field.';
        if (issue.message.includes('confused')) return 'Your page has multiple titles. Pick one main title.';
        return 'Ask your web person to check page titles.';
      case 'Accessibility':
        if (issue.message.includes('image')) return 'Click each image and look for "Alt Text". Write a short description so AI can describe it to customers.';
        if (issue.message.includes('language')) return 'Go to Settings > General > Language and pick "English".';
        return 'Ask your web person to check your site.';
      case 'AI Readiness':
        return 'Ask your web developer to add "JSON-LD Schema Markup" to your homepage. It tells ChatGPT who you are and what you do.';
      case 'Performance':
        if (issue.message.includes('slow')) return 'Your page loads too slow — AI gives up. Ask your web person to optimize images or upgrade hosting.';
        if (issue.message.includes('tools')) return 'Too many extras (chat widgets, trackers). Ask your web person to clean up.';
        return 'Ask your web person to speed up your site.';
      default:
        return 'Upgrade to Pro for a step-by-step guide.';
    }
  }

  return <>
    <header>
      <div className="brand-header">
        <h1>{whiteLabelName}</h1>
      </div>
      <p className="tagline">60% of people use AI to find businesses. If you're not visible in ChatGPT, your competitors get the traffic.</p>
    </header>

    <main>
      <section className="search-section">
        <form onSubmit={handleSubmit}>
          <input type="url" placeholder="https://yourwebsite.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Analyzing...' : 'Generate Report'}</button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="trust-line">🔒 We scan public data only. Your URL is never stored.</p>
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
              <h3>🔴 {report.issues.length} Issue{report.issues.length > 1 ? 's' : ''} Found</h3>
              <ol>
                {report.issues.slice(0, 5).map((issue, i) => (
                  <li key={i} className={`summary-item ${issue.severity}`}>
                    <strong>{issue.category}</strong> — {issue.message.split('.')[0]}.
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
                        <button className="mini-contact-btn" onClick={() => window.location.href='mailto:hello@getreportready.com?subject=Help fixing ' + issue.category + ' on my site'}>
                          Have us fix this for you
                        </button>
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
          <button className="download-btn" onClick={() => window.location.href='https://buy.stripe.com/bJe8wPg6C2Sr5lefVe73G00'}>Get PDF Reports — $29/mo</button>
        </div>
      )}

      <section className="pricing-section">
        <h2>Pricing Plans</h2>
        <div className="pricing-grid">
          <div className="pricing-card featured">
            <h3>Free Check</h3>
            <p className="price">$0</p>
            <ul>
              <li>✅ See if ChatGPT can find you</li>
              <li>✅ See what's wrong with your site</li>
              <li>❌ Monthly re-checks</li>
              <li>❌ AI disappearance alerts</li>
              <li>❌ Competitor comparison</li>
            </ul>
            <button className="secondary-btn" onClick={() => window.scrollTo(0,0)}>Check My Site</button>
          </div>
          <div className="pricing-card featured">
            <div className="popular-tag">FOR AGENCIES</div>
            <h3>Agency</h3>
            <p className="price">$99<span>/mo</span></p>
            <ul>
              <li>✅ Unlimited client sites</li>
              <li>✅ White-label reports</li>
              <li>✅ Bill clients $29-50/mo</li>
              <li>✅ Bulk onboarding</li>
              <li>✅ Priority support</li>
            </ul>
            <button className="primary-btn agency-btn" onClick={() => window.location.href='https://buy.stripe.com/3cI14n8Ea3Wv5lebEY73G01'}>Agency — $99/mo</button>
          </div>
          <div className="pricing-card featured">
            <div className="popular-tag">RECOMMENDED</div>
            <h3>Stay Covered</h3>
            <p className="price">$29<span>/mo</span></p>
            <ul>
              <li>✅ Monthly re-checks</li>
              <li>✅ AI disappearance alerts</li>
              <li>✅ Competitor comparison</li>
              <li>✅ Fix guide for your web person</li>
              <li>✅ Email support</li>
            </ul>
            <button className="primary-btn" onClick={() => window.location.href='https://buy.stripe.com/bJe8wPg6C2Sr5lefVe73G00'}>Stay Covered — $29/mo</button>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <p>&copy; {new Date().getFullYear()} ReportReady.</p>
      <p className="founder-line">Built by <a href="https://www.linkedin.com/in/bryan-robinson-7044b0344" target="_blank">Bryan Robinson</a></p>
      <div className="footer-links">
        <a className="link-btn" href="/terms">Terms</a>
        <a className="link-btn" href="/refund">Refund</a>
        <a className="link-btn" href="/privacy">Privacy</a>
        <a className="link-btn" href="/contact">Contact</a>
      </div>
    </footer>
  </>
}

export default App
