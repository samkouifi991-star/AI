import { Suspense } from 'react'
import { FindApplicationWizard } from '@/components/marketing/FindApplicationWizard'

export const metadata = { title: 'Find My Application' }

export default function FindMyApplicationPage() {
  return (
    <div className="container-page py-14">
      <Suspense fallback={null}>
        <FindApplicationWizard />
      </Suspense>
    </div>
  )
}
