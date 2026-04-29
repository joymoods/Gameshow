import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore } from '../store/lobbyStore';
import { listQuizzes, deleteQuiz, loadQuizFromLibrary, saveRoomQuizToLibrary } from '../api/library';
import type { QuizSummary } from '../types/library';
import type { ToastType } from '../App';

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

export default function LibraryPage({ toast }: Props) {
  const navigate = useNavigate();
  const activeRoomCode = useLobbyStore((s) => s.activeRoomCode);

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchQuizzes() {
    try {
      const list = await listQuizzes();
      setQuizzes(list);
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchQuizzes(); }, []);

  async function handleLoad(quiz: QuizSummary) {
    if (!activeRoomCode) {
      toast('Kein aktiver Raum – bitte zuerst eine Lobby öffnen', 'warning');
      return;
    }
    try {
      await loadQuizFromLibrary(activeRoomCode, quiz.id);
      toast(`"${quiz.name}" in Raum ${activeRoomCode} geladen`, 'success');
    } catch (e) {
      toast(String(e), 'error');
    }
  }

  async function handleDelete(quiz: QuizSummary) {
    if (!confirm(`Quiz "${quiz.name}" wirklich löschen?`)) return;
    try {
      await deleteQuiz(quiz.id);
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      toast(`"${quiz.name}" gelöscht`, 'success');
    } catch (e) {
      toast(String(e), 'error');
    }
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    if (!activeRoomCode) {
      toast('Kein aktiver Raum – bitte zuerst eine Lobby öffnen', 'warning');
      return;
    }
    setSaving(true);
    try {
      const summary = await saveRoomQuizToLibrary(activeRoomCode, saveName.trim(), saveDesc.trim());
      setQuizzes((prev) => [summary, ...prev]);
      toast(`"${summary.name}" gespeichert`, 'success');
      setSaveModal(false);
      setSaveName('');
      setSaveDesc('');
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  return (
    <div className="home-page">
      <div className="home-header">
        <div>
          <h1 className="home-title">Quiz-Bibliothek</h1>
          <p className="home-subtitle">Gespeicherte Quizzes laden oder aus einem aktiven Raum sichern.</p>
        </div>
        <div className="home-header-actions">
          <button className="btn-secondary btn-sm" onClick={() => navigate(-1)}>
            ← Zurück
          </button>
          {activeRoomCode && (
            <button className="btn-primary" onClick={() => setSaveModal(true)}>
              Quiz speichern
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>Lade…</p></div>
      ) : quizzes.length === 0 ? (
        <div className="empty-state">
          <p>Keine Quizzes gespeichert.</p>
          {activeRoomCode && (
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setSaveModal(true)}>
              Erstes Quiz speichern
            </button>
          )}
        </div>
      ) : (
        <div className="library-table-wrapper">
          <table className="library-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
                <th>Fragen</th>
                <th>Erstellt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td>
                    <div className="library-quiz-name">{quiz.name}</div>
                    {quiz.description && (
                      <div className="library-quiz-desc">{quiz.description}</div>
                    )}
                  </td>
                  <td><span className="room-card-game">{quiz.game_type}</span></td>
                  <td>{quiz.question_count}</td>
                  <td>{formatDate(quiz.created_at)}</td>
                  <td>
                    <div className="library-actions">
                      {activeRoomCode && (
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => handleLoad(quiz)}
                          title={`In Raum ${activeRoomCode} laden`}
                        >
                          Laden
                        </button>
                      )}
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleDelete(quiz)}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saveModal && (
        <div className="modal-backdrop" onClick={() => setSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Quiz aus Raum {activeRoomCode} speichern</h2>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                type="text"
                placeholder="z.B. Geographie-Quiz 2025"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Beschreibung</label>
              <input
                className="form-input"
                type="text"
                placeholder="Optional"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSaveModal(false)}>
                Abbrechen
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={!saveName.trim() || saving}
              >
                {saving ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
