'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Goal = {
  key: string
  title: string
  icon: string
}

const goals: Goal[] = [
  { key: 'green-card', title: 'Get a Green Card', icon: '🪪' },
  { key: 'family', title: 'Help a Family Member Get a Green Card', icon: '🤝' },
  { key: 'citizenship', title: 'Apply for U.S. Citizenship', icon: '🇺🇸' },
  { key: 'renew-green-card', title: 'Renew or Replace My Green Card', icon: '🔄' },
  { key: 'remove-conditions', title: 'Remove Conditions From My Green Card', icon: '📋' },
  { key: 'fiance', title: "Bring My Fiancé(e) to the U.S.", icon: '💍' },
  { key: 'work-permit', title: 'Get or Renew a Work Permit', icon: '💼' },
  { key: 'travel-document', title: 'Apply for a Travel Document', icon: '✈️' },
  { key: 'sponsor', title: 'Financially Sponsor a Family Member', icon: '💵' },
  { key: 'replace-cert', title: 'Replace a Citizenship Certificate', icon: '📄' },
  { key: 'cert-of-citizenship', title: 'Apply for Certificate of Citizenship', icon: '🪶' },
  { key: 'address', title: 'Change My Address', icon: '📮' },
  { key: 'other', title: 'Something Else', icon: '❓' },
]

type Question = {
  key: string
  prompt: string
  options: { value: string; label: string }[]
}

type Recommendation = { slug: string; note?: string }

// One small decision tree per goal. Each question's answer key feeds into
// `resolve`, which returns the application slug to send the visitor to.
// This is a real (if intentionally simple) rules engine — not a static
// lookup table — so goals with meaningfully different paths (like
// "get a green card") actually branch.
const flows: Record<
  string,
  {
    questions: (answers: Record<string, string>) => Question[]
    resolve: (answers: Record<string, string>) => Recommendation
  }
> = {
  'green-card': {
    questions: (a) => {
      const qs: Question[] = [
        {
          key: 'location',
          prompt: 'Are you currently inside or outside the United States?',
          options: [
            { value: 'inside', label: 'Inside the United States' },
            { value: 'outside', label: 'Outside the United States' },
          ],
        },
      ]
      if (a.location === 'inside') {
        qs.push({
          key: 'sponsor',
          prompt: 'Who is sponsoring you?',
          options: [
            { value: 'family', label: 'A family member' },
            { value: 'employer', label: 'An employer' },
            { value: 'asylee', label: "I'm an asylee or refugee" },
            { value: 'none', label: 'No one yet / not sure' },
          ],
        })
      }
      if (a.location === 'inside' && a.sponsor === 'family') {
        qs.push({
          key: 'relationship',
          prompt: 'What is your relationship to your sponsor?',
          options: [
            { value: 'spouse', label: 'Spouse' },
            { value: 'parent', label: 'Parent' },
            { value: 'child', label: 'Child' },
            { value: 'sibling', label: 'Sibling' },
          ],
        })
      }
      return qs
    },
    resolve: (a) => {
      if (a.location === 'outside') {
        return {
          slug: 'family-green-card-petition',
          note: 'Since you are outside the U.S., a family or employer petition is usually filed first, followed by consular processing rather than Form I-485.',
        }
      }
      if (a.sponsor === 'none') {
        return { slug: 'green-card-adjustment-of-status', note: 'Your situation may need a closer look — an underlying petition is usually required before filing Form I-485.' }
      }
      return { slug: 'green-card-adjustment-of-status' }
    },
  },
  family: {
    questions: () => [
      {
        key: 'relationship',
        prompt: 'What is your relationship to the family member you want to sponsor?',
        options: [
          { value: 'spouse', label: 'Spouse' },
          { value: 'parent', label: 'Parent' },
          { value: 'child', label: 'Child' },
          { value: 'sibling', label: 'Sibling' },
        ],
      },
    ],
    resolve: () => ({ slug: 'family-green-card-petition' }),
  },
  citizenship: {
    questions: () => [
      {
        key: 'basis',
        prompt: 'Which describes your situation?',
        options: [
          { value: 'five_year', label: 'Permanent resident for 5+ years' },
          { value: 'three_year', label: 'Permanent resident for 3+ years, married to a U.S. citizen' },
          { value: 'unsure', label: "I'm not sure" },
        ],
      },
    ],
    resolve: () => ({ slug: 'citizenship-application' }),
  },
  'renew-green-card': { questions: () => [], resolve: () => ({ slug: 'green-card-renewal-replacement' }) },
  'remove-conditions': { questions: () => [], resolve: () => ({ slug: 'remove-conditions-green-card' }) },
  fiance: { questions: () => [], resolve: () => ({ slug: 'fiance-visa-petition' }) },
  'work-permit': { questions: () => [], resolve: () => ({ slug: 'work-permit' }) },
  'travel-document': { questions: () => [], resolve: () => ({ slug: 'travel-document' }) },
  sponsor: { questions: () => [], resolve: () => ({ slug: 'affidavit-of-support' }) },
  'replace-cert': { questions: () => [], resolve: () => ({ slug: 'replace-citizenship-certificate' }) },
  'cert-of-citizenship': { questions: () => [], resolve: () => ({ slug: 'certificate-of-citizenship' }) },
  address: { questions: () => [], resolve: () => ({ slug: 'change-of-address' }) },
}

export function FindApplicationWizard() {
  const searchParams = useSearchParams()
  const [goal, setGoal] = useState<string | null>(searchParams.get('goal'))
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)

  const flow = goal ? flows[goal] : null
  const questions = useMemo(() => (flow ? flow.questions(answers) : []), [flow, answers])
  const currentQuestion = questions[step]
  const isOther = goal === 'other'
  const isDone = flow ? !currentQuestion : false

  function reset() {
    setGoal(null)
    setAnswers({})
    setStep(0)
  }

  function answer(value: string) {
    if (!currentQuestion) return
    const next = { ...answers, [currentQuestion.key]: value }
    setAnswers(next)
    const newQuestions = flow!.questions(next)
    if (step + 1 < newQuestions.length) {
      setStep(step + 1)
    } else {
      setStep(newQuestions.length)
    }
  }

  if (!goal) {
    return (
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">What are you trying to do?</h1>
        <p className="mt-3 max-w-2xl text-ink-600">
          Pick the option that sounds closest to your situation — we'll ask a couple of quick
          questions and point you to the right application.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <button key={g.key} onClick={() => setGoal(g.key)} className="select-card text-left">
              <span className="text-2xl">{g.icon}</span>
              <div className="mt-3 font-heading font-semibold text-ink-900">{g.title}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (isOther) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-bold">Let's find the right starting point.</h1>
        <p className="mt-3 text-ink-600">
          Browse every application we support, or reach out and we'll help you figure out where to
          begin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/applications" className="btn-primary">Browse All Applications</Link>
          <Link href="/contact" className="btn-outline">Contact Support</Link>
        </div>
        <button onClick={reset} className="mt-6 text-sm font-semibold text-harbor-700">← Start over</button>
      </div>
    )
  }

  if (isDone && flow) {
    const rec = flow.resolve(answers)
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="badge-success">Recommended for you</span>
        <h1 className="mt-4 text-2xl font-bold">Based on your answers, here's where to start.</h1>
        {rec.note && <p className="mt-4 rounded-xl bg-warning-50 p-4 text-sm text-ink-700">{rec.note}</p>}
        <p className="mt-4 text-sm text-ink-500">
          This is a starting-point suggestion, not a legal eligibility determination — you'll
          confirm the details on the next screen.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/applications/${rec.slug}`} className="btn-primary">View This Application</Link>
          <Link href="/applications" className="btn-outline">See All Applications</Link>
        </div>
        <button onClick={reset} className="mt-6 text-sm font-semibold text-harbor-700">← Start over</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={reset} className="text-sm font-semibold text-harbor-700">← Start over</button>
      {currentQuestion && (
        <>
          <h1 className="mt-4 text-2xl font-bold">{currentQuestion.prompt}</h1>
          <div className="mt-6 grid gap-3">
            {currentQuestion.options.map((opt) => (
              <button key={opt.value} onClick={() => answer(opt.value)} className="select-card text-left">
                <span className="font-medium text-ink-900">{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
