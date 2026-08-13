export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>
        These Terms of Service ("Terms") govern your use of Smart USA Visa's website and
        self-service document preparation platform (the "Service"). By creating an account or
        using the Service, you agree to these Terms.
      </p>
      <h2>1. What Smart USA Visa is — and isn't</h2>
      <p>
        Smart USA Visa is a self-help document preparation service. We are not a law firm, we do
        not employ attorneys to represent you, and nothing on this platform is legal advice.
        Completing our questionnaire does not create an attorney-client relationship. We do not
        determine your immigration eligibility — only USCIS, an immigration court, or a qualified
        immigration attorney can do that.
      </p>
      <h2>2. Your responsibilities</h2>
      <ul>
        <li>You are responsible for the accuracy of the information you provide.</li>
        <li>You are responsible for reviewing your completed forms before signing and filing them.</li>
        <li>You are responsible for filing your application and paying any government fees directly to the appropriate agency.</li>
        <li>You must be at least 18 years old to create an account.</li>
      </ul>
      <h2>3. No government affiliation</h2>
      <p>
        Smart USA Visa is a private company. We are not affiliated with, endorsed by, or
        connected to USCIS, DHS, the U.S. Department of State, or any other government agency.
      </p>
      <h2>4. Accounts and security</h2>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials and
        for all activity under your account. Notify us immediately of any unauthorized use.
      </p>
      <h2>5. Payments</h2>
      <p>
        Fees you pay to Smart USA Visa cover document preparation services only. Government
        filing fees, when applicable, are separate and are paid directly by you to the relevant
        government agency — Smart USA Visa does not collect government filing fees on the
        government's behalf.
      </p>
      <h2>6. Limitation of liability</h2>
      <p>
        The Service is provided "as is." To the maximum extent permitted by law, Smart USA Visa
        is not liable for indirect, incidental, or consequential damages, including delays,
        denials, or other outcomes of any government filing.
      </p>
      <h2>7. Changes to these Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance.</p>
      <h2>8. Contact</h2>
      <p>Questions about these Terms can be sent through our Contact page.</p>
    </>
  )
}
