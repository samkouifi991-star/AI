'use client';

import { useState } from 'react';
import { StatusResult, STATUS_BADGE_CLASS } from '@/lib/status';

export default function StatusBadge({ result }: { result: StatusResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={STATUS_BADGE_CLASS[result.status]}>{result.label}</span>
        <span className="text-xs text-slate-600">{result.message}</span>
      </div>
      {result.nextAction && <p className="text-xs text-slate-500 mt-0.5">{result.nextAction}</p>}
      {result.technicalDetail && (
        <div className="mt-1">
          <button type="button" className="text-xs text-slate-400 underline" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>
          {expanded && <pre className="text-xs bg-slate-50 rounded p-2 mt-1 whitespace-pre-wrap">{result.technicalDetail}</pre>}
        </div>
      )}
    </div>
  );
}
