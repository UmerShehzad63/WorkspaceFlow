// AI calls are handled server-side by the FastAPI backend (backend/ai_engine.py).
// Use NEXT_PUBLIC_BACKEND_URL to reach the backend from client components.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
