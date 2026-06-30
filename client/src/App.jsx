import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [report, setReport] = useState(null)
  const [whiteLabelName, setWhiteLabelName] = useState('ReportReady')
  const [showProModal, setShowProModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
          <div className="pro-badge" onClick={() => setShowProModal(true)}>PRO FEATURE: White-Label Branding</div>
        </div>
        <p>Professional website audits in seconds.</p>
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
        </section>

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
                        <span className="fix-label">Suggested Fix:</span> {getFixForIssue(issue)}
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
             <button className="download-btn" onClick={handleDownload}>Download Professional PDF Report (Pro)</button>
          </div>
        )}

        <section className="pricing-section">
          <h2>Pricing Plans</h2>
          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Basic</h3>
              <p className="price">$0</p>
              <ul>
                <li>✅ Single Website Audit</li>
                <li>✅ Core SEO Metrics</li>
                <li>✅ AI Readiness Check</li>
                <li>❌ PDF Downloads</li>
                <li>❌ Competitor Comparison</li>
                <li>❌ White-Label Branding</li>
              </ul>
              <button className="secondary-btn" onClick={() => window.scrollTo(0,0)}>Get Started</button>
            </div>
            <div className="pricing-card featured">
              <div className="popular-tag">MOST POPULAR</div>
              <h3>Professional</h3>
              <p className="price">$29<span>/mo</span></p>
              <ul>
                <li>✅ Unlimited Comparison Audits</li>
                <li>✅ Professional PDF Reports</li>
                <li>✅ White-Label Branding</li>
                <li>✅ Agency Dashboard Preview</li>
                <li>✅ 24/7 Priority Support</li>
                <li>✅ Generative Engine Optimization</li>
              </ul>
              <button className="primary-btn" onClick={handleDownload}>Upgrade to Pro</button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-content">
          <p>&copy; {new Date().getFullYear()} ReportReady. Professional Website Audits.</p>
          <div className="footer-links">
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
            <a href="mailto:hello@getreportready.com">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
