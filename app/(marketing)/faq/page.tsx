import type { Metadata } from 'next';
import FaqAccordion from '@/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to common questions about Business Pilot AI.'
};

export default function FaqPage() {
  return (
    <div>
      <section className="bg-slate-50 py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-4xl font-display font-semibold text-ink mb-3">Frequently asked questions</h1>
        </div>
      </section>
      <section className="max-w-2xl mx-auto px-6 py-16">
        <FaqAccordion />
      </section>
    </div>
  );
}
