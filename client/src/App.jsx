import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  // Read ?domain= from URL to pre-fill audit URL from email campaigns
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const prefillDomain = urlParams.get('domain') || '';
  
  const [url, setUrl] = useState(prefillDomain)
  const [report, setReport] = useState(null)
  const [whiteLabelName, setWhiteLabelName] = useState('ReportReady')
  const [showProModal, setShowProModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Auto-submit if domain was provided in URL
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (prefillDomain && !autoSubmitted.current) {
      autoSubmitted.current = true;
      // Small delay to let component mount
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) form.requestSubmit();
      }, 500);
    }
  }, [prefillDomain]);

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setReport(null)
    
    try {
      // Audit primary URL
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      
      if (!response.ok) throw new Error('Failed to generate report')
      const data = await response.json()
      setReport(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    // Check if it's the free version
    const isPro = false; // This would come from auth/subscription status in a real app
    
    if (!isPro) {
      const confirmed = window.confirm("Upgrade to ReportReady Pro to download professional PDF reports for just $29/month. Proceed to checkout?");
      if (confirmed) {
        try {
          const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priceId: 'price_1TmxRqBCtZYfGc1na9HUCLuL' }), // Live Price ID
          });
          const session = await response.json();
          if (session.url) window.location.href = session.url;
        } catch (err) {
          alert("Payment system currently in demo mode. Please set STRIPE_SECRET_KEY in .env to activate.");
        }
        return;
      }
    }

    if (!report) return
    
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report }),
      })
      
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${new Date().getTime()}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      alert('Failed to download report. Upgrade to Pro for full access.')
    }
  }

  const getFixForIssue = (issue) => {
    switch (issue.category) {
      case 'SEO':
        if (issue.message.includes('Title')) return 'Add: <title>Your Business Name | Primary Service in City</title> inside your <head> tag.';
        if (issue.message.includes('Description')) return 'Add: <meta name="description" content="Professional services in your city. Call us today!"> inside your <head> tag.';
        if (issue.message.includes('H1')) return 'Wrap your main page title in <h1> tags, e.g., <h1>Expert Plumbing Services</h1>.';
        return 'Consult an SEO specialist to optimize this tag.';
      case 'Accessibility':
        if (issue.message.includes('alt text')) return 'Add an alt attribute to your <img> tags, e.g., <img src="logo.png" alt="Company Logo">.';
        return 'Ensure your site follows WCAG guidelines for color contrast and navigation.';
      case 'AI Readiness':
        return 'Add JSON-LD Schema Markup to your homepage. This tells AI models exactly who you are and what services you provide.';
      default:
        return 'Refer to our full Pro Guide for a step-by-step resolution.';
    }
  }

  return (
    <div className="container">
      <header>
        <div className="brand-header">
          <h1>{whiteLabelName}</h1>
        </div>
        <p className="tagline">AI search changes every week. Your business might disappear from ChatGPT without you knowing. We watch for you.</p>
      </header>

      {showProModal && (
        <div className="modal-overlay" onClick={() => setShowProModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>White-Label Settings</h2>
            <p>ReportReady Pro allows you to rebrand these reports as your own. Your clients will only see your business name.</p>
            <div className="form-group">
              <label>Your Agency Name:</label>
              <input 
                type="text" 
                value={whiteLabelName} 
                onChange={(e) => setWhiteLabelName(e.target.value)}
                placeholder="Enter your agency name"
              />
            </div>
            <p className="modal-tip">The dashboard and PDF will immediately update to your brand.</p>
            <button className="pro-upgrade-btn" onClick={handleDownload}>Upgrade to Pro to Save Settings</button>
            <button className="modal-close" onClick={() => setShowProModal(false)}>Close Preview</button>
          </div>
        </div>
      )}

      <main>
        <section className="search-section">
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input
                type="url"
                placeholder="https://yourwebsite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Generate Report'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <p className="trust-line">🔒 We scan public data only. Your URL is never stored.</p>
        </section>

        {!report && (
          <section className="how-it-works">
            <h2>Why This Matters</h2>
            <p className="how-it-works-sub">ChatGPT and Google AI change how they find websites all the time. Your site might work fine today and disappear tomorrow. We check every month so you don't lose customers.</p>
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

              <div className="issues-list">
                <h3>Issues Identified</h3>
                <ul>
                  {report.issues.map((issue, index) => (
                    <li key={index} className={`issue ${issue.severity}`}>
                      <div className="issue-main">
                        <strong>{issue.category}:</strong> {issue.message}
                      </div>
                      <div className="issue-fix">
                        <span className="fix-label">Suggested Fix:</span>
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
            <div className="pricing-card">
              <h3>Free Check</h3>
              <p className="price">$0</p>
              <ul>
                <li>✅ See if ChatGPT can find you right now</li>
                <li>✅ See what's wrong with your site</li>
                <li>❌ Monthly re-checks when AI changes</li>
                <li>❌ Alert if you disappear from AI</li>
                <li>❌ Compare with competitors</li>
              </ul>
              <button className="secondary-btn" onClick={() => window.scrollTo(0,0)}>Check My Site</button>
            </div>
            <div className="pricing-card">
              <div className="popular-tag">FOR AGENCIES</div>
              <h3>Agency</h3>
              <p className="price">$99<span>/mo</span></p>
              <ul>
                <li>✅ Monitor unlimited client sites</li>
                <li>✅ White-label reports with your brand</li>
                <li>✅ Bill clients $29-50/mo — keep the profit</li>
                <li>✅ Bulk onboarding for all your clients</li>
                <li>✅ Priority support for your team</li>
              </ul>
              <button className="primary-btn agency-btn" onClick={() => window.location.href='https://buy.stripe.com/3cI14n8Ea3Wv5lebEY73G01'}>Agency — $99/mo</button>
            </div>
            <div className="pricing-card featured">
              <div className="popular-tag">RECOMMENDED</div>
              <h3>Stay Covered</h3>
              <p className="price">$29<span>/mo</span></p>
              <ul>
                <li>✅ Monthly re-checks — AI changes, we catch it</li>
                <li>✅ Alert if your site disappears from ChatGPT</li>
                <li>✅ See how competitors are doing in AI</li>
                <li>✅ Fix guide to give your web person</li>
                <li>✅ Email help if you get stuck</li>
              </ul>
              <button className="primary-btn" onClick={() => window.location.href='https://buy.stripe.com/bJe8wPg6C2Sr5lefVe73G00'}>Stay Covered — $29/mo</button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-content">
          <p>&copy; {new Date().getFullYear()} ReportReady. Professional Website Audits.</p>
          <div className="footer-links">
            <a className="link-btn" href="/terms">Terms of Service</a>
            <a className="link-btn" href="/refund">Refund Policy</a>
            <a className="link-btn" href="/privacy">Privacy Policy</a>
            <a className="link-btn" href="/contact">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
