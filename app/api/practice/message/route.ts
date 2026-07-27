import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getOpenAI } from '@/lib/openai';
import { buildSystemPrompt, PRACTICE_TOOLS, toOpenAiChatTools } from '@/lib/vapi-tools';
import { dispatchTool } from '@/lib/ava-dispatcher';

const MAX_TOOL_ROUNDS = 6;

/**
 * Runs one turn of a practice conversation: the owner's message goes in,
 * Ava's reply comes out, and every tool call she makes along the way runs
 * through the exact same lib/ava-dispatcher.ts a real call uses — in
 * 'practice' mode, so SMS/Stripe/calendar writes are suppressed and
 * replaced with an honest "would have..." result instead of a real one.
 *
 * Cross-turn history is reconstructed from the plain customer/assistant
 * text already stored in practice_messages — the tool-call bookkeeping
 * OpenAI needs (tool_call_id pairing) only has to hold together within
 * this one request's loop, not across separate HTTP calls.
 */
export async function POST(req: NextRequest) {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId, message } = await req.json();
  if (!sessionId || !message?.trim()) {
    return NextResponse.json({ error: 'sessionId and message are required' }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .select('id, business_id, status')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
  if (session.status !== 'in_progress') return NextResponse.json({ error: 'This practice session has ended.' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, business_type, service_area')
    .eq('id', session.business_id)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const { data: priorMessages } = await supabase
    .from('practice_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .in('role', ['customer', 'assistant'])
    .order('created_at', { ascending: true });

  await supabase.from('practice_messages').insert({
    session_id: sessionId,
    business_id: business.id,
    role: 'customer',
    content: message
  });

  const openai = getOpenAI();
  const chatMessages: any[] = [
    { role: 'system', content: buildSystemPrompt(business) },
    ...(priorMessages ?? []).map((m) => ({ role: m.role === 'customer' ? 'user' : 'assistant', content: m.content ?? '' })),
    { role: 'user', content: message }
  ];

  const actions: Array<{ tool: string; params: any; result: any; suppressedAction?: string }> = [];
  const tools = toOpenAiChatTools(PRACTICE_TOOLS);

  let finalReply = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: chatMessages,
      tools,
      tool_choice: 'auto'
    });

    const choice = completion.choices[0].message;

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      finalReply = choice.content ?? '';
      break;
    }

    chatMessages.push({ role: 'assistant', content: choice.content, tool_calls: choice.tool_calls });

    for (const toolCall of choice.tool_calls) {
      const name = toolCall.function.name;
      let params: any = {};
      try {
        params = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        params = {};
      }

      const result = await dispatchTool(name, params, { businessId: business.id, mode: 'practice', practiceSessionId: sessionId });

      await supabase.from('practice_messages').insert({
        session_id: sessionId,
        business_id: business.id,
        role: 'tool',
        tool_name: name,
        tool_params: params,
        tool_result: result,
        suppressed_action: result.suppressed_action ?? null
      });

      actions.push({ tool: name, params, result, suppressedAction: result.suppressed_action });

      chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }

    if (round === MAX_TOOL_ROUNDS - 1) {
      finalReply = "Let's pause there — that's a lot of back and forth for a practice run. Try wrapping up or starting a new session.";
    }
  }

  await supabase.from('practice_messages').insert({
    session_id: sessionId,
    business_id: business.id,
    role: 'assistant',
    content: finalReply
  });

  return NextResponse.json({ reply: finalReply, actions });
}
