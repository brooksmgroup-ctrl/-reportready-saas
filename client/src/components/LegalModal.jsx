import React from 'react';

const LegalModal = ({ type, onClose }) => {
  const content = {
    terms: {
      title: 'Terms of Service',
      body: (
        <>
          <p>Welcome to ReportReady. By using our service, you agree to the following terms:</p>
          <ul>
            <li><strong>Service:</strong> ReportReady provides automated website audits for SEO and AI discovery. These reports are for informational purposes.</li>
            <li><strong>Usage:</strong> You are responsible for the URLs you submit for auditing. You must have the right to audit the website.</li>
            <li><strong>Subscriptions:</strong> Professional subscriptions are billed monthly at $29/mo. You can cancel anytime via your dashboard.</li>
            <li><strong>Liability:</strong> ReportReady is not liable for any changes in search engine or AI engine rankings resulting from the use of our recommendations.</li>
          </ul>
        </>
      )
    },
    refund: {
      title: 'Refund Policy',
      body: (
        <>
          <p>We want you to be happy with ReportReady. Our refund policy is simple:</p>
          <ul>
            <li><strong>14-Day Guarantee:</strong> We offer a 14-day "no questions asked" refund policy for any monthly subscription or standalone premium audit.</li>
            <li><strong>How to Request:</strong> To request a refund, please email us at <code>reportready-2162dbe4@ctomail.io</code> within 14 days of your purchase.</li>
            <li><strong>Processing:</strong> Refunds will be processed back to your original payment method within 5-10 business days.</li>
          </ul>
        </>
      )
    },
    privacy: {
      title: 'Privacy Policy',
      body: (
        <>
          <p>Your privacy is important to us. Here is how we handle your data:</p>
          <ul>
            <li><strong>Data Collection:</strong> We collect the URLs you audit and your email address if you sign up for a Pro account.</li>
            <li><strong>Usage:</strong> We use this data to provide the service and improve our audit algorithms.</li>
            <li><strong>Payment Data:</strong> Payment processing is handled by Stripe. We do not store your credit card information on our servers.</li>
            <li><strong>Security:</strong> We take reasonable measures to protect your data from unauthorized access.</li>
          </ul>
        </>
      )
    }
  };

  const activeContent = content[type] || content.terms;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content legal-modal" onClick={e => e.stopPropagation()}>
        <h2>{activeContent.title}</h2>
        <div className="legal-body">
          {activeContent.body}
        </div>
        <button className="modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default LegalModal;
