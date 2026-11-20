export const PRODUCT = {
  name: 'CourseAccess',
  tagline: 'Every lesson. Accessible to everyone.',
  maxPdfBytes: 20 * 1024 * 1024,
  maxPages: 80,
  maxCanvasPixels: 2_500_000,
  // These are display-only proposals until a server-verified identity/usage service exists.
  plans: [
    { id: 'free', name: 'Free', monthlyPrice: 0, documents: 5, description: 'A clearer starting point for every educator.' },
    { id: 'one-time', name: 'Pay per document', monthlyPrice: null, documents: null, description: 'Advanced exports for occasional projects.' },
    { id: 'pro', name: 'Professor Pro', monthlyPrice: 12, documents: 100, description: 'Room for an entire semester of material.' },
    { id: 'institution', name: 'Institution', monthlyPrice: 79, documents: 1000, description: 'An accessible future for whole teams.' },
  ],
} as const;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
