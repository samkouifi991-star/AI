export const metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>
        This Privacy Policy explains how Smart USA Visa collects, uses, and protects your
        personal information, including sensitive immigration-related data.
      </p>
      <h2>1. Information we collect</h2>
      <ul>
        <li>Account information: name, email address, authentication credentials.</li>
        <li>Application information: everything you enter in the questionnaire, including biographic, immigration, family, employment, and travel history.</li>
        <li>Documents you upload, such as identity documents, immigration records, and financial records.</li>
        <li>Payment information, processed by our payment provider (Stripe) — we do not store full card numbers.</li>
        <li>Usage data such as pages visited and device/browser information.</li>
      </ul>
      <h2>2. How we use your information</h2>
      <ul>
        <li>To prepare your immigration forms, document checklist, and filing instructions.</li>
        <li>To operate your account, including autosave and save-and-resume.</li>
        <li>To process payments and certified translation orders.</li>
        <li>To provide customer support.</li>
        <li>To maintain security, including audit logs of access to sensitive data.</li>
      </ul>
      <h2>3. How we protect your information</h2>
      <p>
        Data is encrypted in transit (HTTPS) and at rest. Uploaded documents are stored in
        private storage and accessed only through short-lived, signed URLs. Database access is
        restricted with row-level security so your data is visible only to you and authorized
        staff performing support functions.
      </p>
      <h2>4. Sharing your information</h2>
      <p>
        We do not sell your personal information. We share data only with service providers
        necessary to operate the platform (such as our database, payment, email, and translation
        providers), each bound by confidentiality obligations, or when required by law.
      </p>
      <h2>5. Your rights</h2>
      <p>
        You can access, correct, export, or request deletion of your data by contacting us.
        Deleting your account removes your application data, subject to any legal retention
        requirements.
      </p>
      <h2>6. Contact</h2>
      <p>Questions about this policy can be sent through our Contact page.</p>
    </>
  )
}
