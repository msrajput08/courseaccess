// A provider seam, not an enabled AI feature. No document data is sent to a third party.
export type SuggestionKind = 'figure-description' | 'diagram-explanation' | 'structure' | 'math-transcription';
export type DraftSuggestion = { text: string; kind: SuggestionKind; requiresHumanApproval: true; provider: string };
export interface ConsentContext { documentName: string; explicitConsent: boolean; }
export interface AIProvider {
  readonly id: string;
  suggest(kind: SuggestionKind, source: string, consent: ConsentContext): Promise<DraftSuggestion>;
}
export class UnconfiguredAIProvider implements AIProvider {
  readonly id = 'not-configured';
  async suggest(): Promise<DraftSuggestion> {
    throw new Error('AI is not configured. No content was sent or generated.');
  }
}
export function assertConsent(consent: ConsentContext): void {
  if (!consent.explicitConsent) throw new Error('Explicit permission is required before any document content is sent to an external AI provider.');
}
