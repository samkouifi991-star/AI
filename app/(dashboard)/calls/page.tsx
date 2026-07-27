import { redirect } from 'next/navigation';

// Renamed to /conversations, which also shows the order and knowledge-gap
// context for each call. Kept as a redirect so any existing bookmark or
// link still lands somewhere real.
export default function CallsRedirectPage() {
  redirect('/conversations');
}
