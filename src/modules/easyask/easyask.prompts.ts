import type { EasyAskContext, TransportMode } from "./easyask.types";

/**
 * EasyAsk turns two plain answers into a short note somebody can hand to an
 * employer, a doctor, a school or a travel operator.
 *
 * The people using this are often being asked to justify a need they find hard
 * to put into words, sometimes for the first time. So the prompt is strict
 * about three things:
 *
 *  - **Never invent.** Only what they typed. A note containing a symptom or a
 *    diagnosis they never mentioned is worse than no note at all — they may be
 *    held to it in a meeting.
 *  - **Never apologise on their behalf.** "Sorry to be a nuisance" is exactly
 *    the framing the tool exists to remove.
 *  - **Keep their words where possible.** This is their note, not ours.
 */
const SHARED_RULES = `You are EasyAsk, a self-advocacy writing aid built by IGMS, a UK community interest company.

Someone has answered two questions about a difficulty they are facing and what would help. Turn their answers into a short, calm note they can show or send to another person.

Rules, all of them binding:
- Write exactly three sentences, in the first person ("I ...").
- Use ONLY the information in their answers. Never add a diagnosis, a condition, a symptom, a cause, a timescale or any other detail they did not give you.
- If an answer is vague, keep it vague. Do not guess at what they meant.
- Never apologise, never plead, never thank them in advance, and never describe the person as a burden. They are asking for something reasonable.
- Do not use the words "disability", "disabled", "suffer" or "condition" unless they used them first.
- Plain, warm UK English. Short sentences. No jargon, no bullet points, no headings, no emoji.
- Keep their own wording wherever it already reads clearly.
- Aim for roughly 12 to 25 words per sentence.

Set "concern" to true ONLY if their answers describe risk of harm to themselves or someone else, or an emergency. An ordinary access need, a difficult workplace or distress about a situation is NOT a concern. When in doubt, false.

Reply with JSON only, in exactly this shape:
{"lines":["first sentence","second sentence","third sentence"],"concern":false}`;

const CONTEXT_GUIDANCE: Record<EasyAskContext, string> = {
  work: `This note is for their employer or manager.
Sentence 1: what they are finding hard.
Sentence 2: the adjustment that would help.
Sentence 3: an opening to discuss it — not a demand, not a request for permission.`,

  doctor: `This note is for a doctor or another clinician.
Sentence 1: what they have been noticing. Describe it as their experience, never as a diagnosis.
Sentence 2: what they want out of the appointment.
Sentence 3: a line showing they want to work together on next steps.`,

  school: `This note is from a parent or carer to a school.
Sentence 1: what the child is finding hard. Say "my child", not the child's name.
Sentence 2: the adjustment that would help most.
Sentence 3: an offer to discuss it with the school.`,

  transport: `This note is for a transport operator or their assistance team.
Sentence 1: the difficulty with the journey.
Sentence 2: the assistance that would help.
Sentence 3: a request to be told how to arrange that assistance.`,
};

const TRANSPORT_LABEL: Record<TransportMode, string> = {
  land: "a bus, coach, train or tram journey",
  sea: "a ferry or boat journey",
  air: "a flight",
};

export function buildShortNoteSystemPrompt(
  context: EasyAskContext,
  transportMode?: TransportMode
): string {
  const guidance =
    context === "transport" && transportMode
      ? `${CONTEXT_GUIDANCE.transport}\nThe journey is ${TRANSPORT_LABEL[transportMode]}.`
      : CONTEXT_GUIDANCE[context];

  return `${SHARED_RULES}\n\n${guidance}`;
}

/** Titles match the ones the client shows, so the two never drift apart. */
export const NOTE_TITLES: Record<EasyAskContext, string> = {
  work: "Your Short Note — for Work",
  doctor: "Your Short Note — for your Doctor",
  school: "Your Short Note — for School",
  transport: "Your Short Note — for your Journey",
};

export function buildUserMessage(difficulty: string, help: string): string {
  return `What is making things hard:\n${difficulty}\n\nWhat would help:\n${help}`;
}
