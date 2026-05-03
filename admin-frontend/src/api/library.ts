import type { QuizSummary, QuizDetail } from '../types/library';
import type { Category } from '../types';
import { API, apiFetch } from './client';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function listQuizzes(): Promise<QuizSummary[]> {
  return request(`${API}/api/library`);
}

export function getQuiz(id: string): Promise<QuizDetail> {
  return request(`${API}/api/library/${id}`);
}

export function saveQuiz(name: string, description: string, gameType: string, categories: Category[]): Promise<QuizSummary> {
  return request(`${API}/api/library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, game_type: gameType, categories }),
  });
}

export function updateQuiz(id: string, name: string, description: string, categories: Category[]): Promise<QuizSummary> {
  return request(`${API}/api/library/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, categories }),
  });
}

export function deleteQuiz(id: string): Promise<void> {
  return request(`${API}/api/library/${id}`, { method: 'DELETE' });
}

export function loadQuizFromLibrary(roomCode: string, quizId: string): Promise<void> {
  return request(`${API}/api/rooms/${roomCode}/quiz/library/${quizId}`, { method: 'POST' });
}

export function saveRoomQuizToLibrary(roomCode: string, name: string, description: string): Promise<QuizSummary> {
  return request(`${API}/api/library/from-room/${roomCode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}
