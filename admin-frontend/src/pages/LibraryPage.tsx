import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore } from '../store/lobbyStore';
import { listQuizzes, deleteQuiz, loadQuizFromLibrary, saveQuiz, getQuiz } from '../api/library';
import type { QuizSummary } from '../types/library';
import type { Category } from '../types';
import type { ToastType } from '../App';

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

export default function LibraryPage({ toast }: Props) {
  const navigate = useNavigate();
  const activeRoomCode = useLobbyStore((s) => s.activeRoomCode);
  const importRef = useRef<HTMLInputElement>(null);

  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [importModal, setImportModal] = useState(false);
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importCategories, setImportCategories] = useState<Category[] | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    listQuizzes()
      .then(setQuizzes)
      .catch((e) => toast(String(e), 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function handleLoad(quiz: QuizSummary) {
    if (!activeRoomCode) {
      toast('Kein aktiver Raum – bitte zuerst eine Lobby öffnen', 'warning');
      return;
    }
    try {
      await loadQuizFromLibrary(activeRoomCode, quiz.id);
      navigate(`/rooms/${activeRoomCode}/lobby`);
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

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cats = JSON.parse(reader.result as string) as Category[];
        if (!Array.isArray(cats)) throw new Error('not an array');
        setImportCategories(cats);
        setImportName(file.name.replace(/\.json$/i, ''));
        setImportDesc('');
        setImportModal(true);
      } catch {
        toast('Ungültige JSON-Datei', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImportSave() {
    if (!importName.trim() || !importCategories) return;
    setImporting(true);
    try {
      const summary = await saveQuiz(importName.trim(), importDesc.trim(), 'jeopardy', importCategories);
      setQuizzes((prev) => [summary, ...prev]);
      toast(`"${summary.name}" importiert`, 'success');
      setImportModal(false);
      setImportCategories(null);
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleExport(quiz: QuizSummary) {
    try {
      const detail = await getQuiz(quiz.id);
      const blob = new Blob([JSON.stringify(detail.categories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quiz.name.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(String(e), 'error');
    }
  }

  return (
    <div className="home-page" style={{ gap: 0 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button className="btn-secondary btn-sm" onClick={() => navigate('/')}>
          ← Zurück
        </button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
          <button className="btn-secondary btn-sm" onClick={() => importRef.current?.click()}>
            📂 Importieren
          </button>
          <button className="btn-primary btn-sm" onClick={() => navigate('/builder/jeopardy')}>
            + Neues Quiz
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state"><p>Lade…</p></div>
      ) : quizzes.length === 0 ? (
        <div className="empty-state">
          <p>Keine Quizzes gespeichert.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            <button className="btn-primary btn-sm" onClick={() => navigate('/builder/jeopardy')}>+ Neues Quiz erstellen</button>
            <button className="btn-secondary btn-sm" onClick={() => importRef.current?.click()}>📂 Importieren</button>
          </div>
        </div>
      ) : (
        <div className="library-table-wrapper">
          <table className="library-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Fragen</th>
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
                  <td>{quiz.question_count}</td>
                  <td>
                    <div className="library-actions">
                      {activeRoomCode && (
                        <button className="btn-primary btn-sm" onClick={() => handleLoad(quiz)} title={`In Raum ${activeRoomCode} laden`}>
                          Laden
                        </button>
                      )}
                      <button className="btn-secondary btn-sm" onClick={() => navigate(`/builder/jeopardy?quizId=${quiz.id}`)}>
                        Bearbeiten
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => handleExport(quiz)}>
                        Exportieren
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => handleDelete(quiz)}>
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

      {/* Modal: Importiertes Quiz benennen */}
      {importModal && (
        <div className="modal-backdrop" onClick={() => setImportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Quiz importieren</h2>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                type="text"
                placeholder="Name des Quizzes"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleImportSave()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Beschreibung</label>
              <input
                className="form-input"
                type="text"
                placeholder="Optional"
                value={importDesc}
                onChange={(e) => setImportDesc(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setImportModal(false)}>Abbrechen</button>
              <button className="btn-primary" onClick={handleImportSave} disabled={!importName.trim() || importing}>
                {importing ? 'Importiert…' : 'Importieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
