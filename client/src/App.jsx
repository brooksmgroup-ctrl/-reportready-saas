  {showProModal && (
    <div className="modal-overlay" onClick={() => setShowProModal(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>White-Label Settings</h2>
        <p>ReportReady Pro allows you to rebrand these reports as your own.</p>
        <div className="form-group">
          <label>Your Agency Name:</label>
          <input type="text" value={whiteLabelName} onChange={(e) => setWhiteLabelName(e.target.value)} placeholder="Enter your agency name" />
        </div>
        <button className="pro-upgrade-btn" onClick={handleDownload}>Upgrade to Pro to Save Settings</button>
        <button className="modal-close" onClick={() => setShowProModal(false)}>Close Preview</button>
      </div>
    </div>
  )}

  <main>
    <section className="search-section">
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input type="url" placeholder="https://yourwebsite.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Analyzing...' : 'Generate Report'}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="trust-line">🔒 We scan public data only. Your URL is never stored.</p>
    </section>

    {!report && (
      <section className="how-it-works">
        <h2>Why This Matters</h2>
        <p className="how-it-works-sub">AI search is the fastest growing channel. Most businesses don't know they're invisible.</p>
        <div className="steps">
          <div className="step"><span className="step-number">1</span><h3>We Check Your Site</h3><p>We look at your site like ChatGPT does.</p></div>
          <div className="step"><span className="step-number">2</span><h3>We Tell You What's Broken</h3><p>Simple list of what to fix.</p></div>
          <div className="step"><span className="step-number">3</span><h3>We Watch for You</h3><p>AI changes. We alert you if something breaks.</p></div>
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
            <li>❌ Disappear from AI alerts</li>
            <li>❌ Competitor comparisons</li>
          </ul>
          <button className="secondary-btn" onClick={() => window.scrollTo(0,0)}>Check My Site</button>
        </div>
        <div className="pricing-card featured">
          <div className="popular-tag">FOR AGENCIES</div>
          <h3>Agency</h3>
          <p className="price">$99<span>/mo</span></p>
          <ul>
            <li>✅ Monitor unlimited client sites</li>
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
    <div className="footer-content">
      <p>&copy; {new Date().getFullYear()} ReportReady.</p>
      <p className="founder-line">Built by <a href="https://www.linkedin.com/in/bryan-robinson-7044b0344" target="_blank" rel="noopener noreferrer">Bryan Robinson</a></p>
      <div className="footer-links">
        <a className="link-btn" href="/terms">Terms</a>
        <a className="link-btn" href="/refund">Refund Policy</a>
        <a className="link-btn" href="/privacy">Privacy</a>
        <a className="link-btn" href="/contact">Contact</a>
      </div>
    </div>
  </footer>
</div>
) }

export default App

