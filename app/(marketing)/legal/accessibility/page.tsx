export const metadata = { title: 'Accessibility' }

export default function AccessibilityPage() {
  return (
    <>
      <h1>Accessibility</h1>
      <p>
        Smart USA Visa is committed to making our platform usable by everyone, including people
        with disabilities. We work toward conformance with the Web Content Accessibility
        Guidelines (WCAG) 2.1 Level AA.
      </p>
      <h2>What we do</h2>
      <ul>
        <li>Semantic HTML and labeled form fields throughout the questionnaire.</li>
        <li>Visible keyboard focus states on every interactive element.</li>
        <li>Color contrast checked against WCAG AA guidelines.</li>
        <li>One primary action per screen in the application wizard, especially on mobile.</li>
        <li>Large touch targets for selectable cards and buttons.</li>
      </ul>
      <h2>Feedback</h2>
      <p>
        If you encounter an accessibility barrier anywhere on Smart USA Visa, please contact us
        through our Contact page — we want to fix it.
      </p>
    </>
  )
}
