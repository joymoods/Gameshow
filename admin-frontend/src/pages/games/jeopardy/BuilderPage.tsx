import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useGameStore } from '../../../store/gameStore';
import { useLobbyStore } from '../../../store/lobbyStore';
import { getQuiz, updateQuiz, saveQuiz } from '../../../api/library';
import type { Category, Question } from '../../../types';
import type { ToastType } from '../../../App';
import BoardPreview from '../../../components/BoardPreview';
import { API, apiFetch } from '../../../api/client';

function emptyQuestion(categoryId: string): Question {
  return { id: uuidv4(), categoryId, points: 200, text: '', answer: '', played: false };
}

function emptyCategory(): Category {
  return { id: uuidv4(), name: 'Neue Kategorie', questions: [] };
}

// ---- Question Editor ----

interface QuestionEditorProps {
  question: Question;
  onChange: (q: Question) => void;
  onDelete: () => void;
}

function QuestionEditor({ question, onChange, onDelete }: QuestionEditorProps) {
  async function uploadMedia(file: File, field: 'imageUrl' | 'audioUrl' | 'videoUrl') {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch(`${API}/api/media/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload fehlgeschlagen');
      const data = await res.json();
      onChange({ ...question, [field]: `${API}${data.url}` });
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="question-editor">
      <div className="question-editor-header">
        <select
          value={question.points}
          onChange={(e) => onChange({ ...question, points: Number(e.target.value) })}
        >
          {[100, 200, 300, 400, 500, 600, 800, 1000].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Punkte</span>
        <button className="question-delete-btn" onClick={onDelete}>×</button>
      </div>

      <textarea
        className="question-text-area"
        placeholder="Fragetext *"
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
        rows={2}
      />
      <textarea
        className="question-answer-area"
        placeholder="Antwort (nur für Moderator)"
        value={question.answer ?? ''}
        onChange={(e) => onChange({ ...question, answer: e.target.value })}
        rows={2}
      />

      <div className="media-row">
        <label className="media-label">
          🖼 Bild
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'imageUrl')} />
        </label>
        {question.imageUrl && (
          <span className="media-preview">
            <img src={question.imageUrl} alt="" height={40} />
            <button onClick={() => onChange({ ...question, imageUrl: undefined })}>✕</button>
          </span>
        )}

        <label className="media-label">
          🎵 Audio
          <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'audioUrl')} />
        </label>
        {question.audioUrl && (
          <span className="media-preview">
            <audio src={question.audioUrl} controls style={{ height: 30 }} />
            <button onClick={() => onChange({ ...question, audioUrl: undefined })}>✕</button>
          </span>
        )}

        <label className="media-label">
          🎬 Video
          <input type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'videoUrl')} />
        </label>
        {question.videoUrl && (
          <span className="media-preview">
            <video src={question.videoUrl} controls style={{ height: 40 }} />
            <button onClick={() => onChange({ ...question, videoUrl: undefined })}>✕</button>
          </span>
        )}
      </div>
    </div>
  );
}

// ---- Main page ----

interface Props {
  toast: (msg: string, type?: ToastType) => void;
}

interface QuestionDrag {
  catId: string;
  fromIdx: number;
}

export default function BuilderPage({ toast }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { builderCategories, setBuilderCategories } = useGameStore();
  const { activeRoomCode } = useLobbyStore();
  const importRef = useRef<HTMLInputElement>(null);
  const [questionDrag, setQuestionDrag] = useState<QuestionDrag | null>(null);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editingQuizName, setEditingQuizName] = useState('');
  const [editingQuizDesc, setEditingQuizDesc] = useState('');
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalDesc, setSaveModalDesc] = useState('');

  useEffect(() => {
    const quizId = searchParams.get('quizId');
    if (!quizId) return;
    getQuiz(quizId)
      .then((detail) => {
        setBuilderCategories(detail.categories as unknown as Category[]);
        setEditingQuizId(detail.id);
        setEditingQuizName(detail.name);
        setEditingQuizDesc(detail.description ?? '');
      })
      .catch((e) => toast(String(e), 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addCategory() {
    setBuilderCategories([...builderCategories, emptyCategory()]);
  }

  function renameCategory(id: string, name: string) {
    setBuilderCategories(builderCategories.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function deleteCategory(id: string) {
    if (!confirm('Kategorie löschen?')) return;
    setBuilderCategories(builderCategories.filter((c) => c.id !== id));
  }

  function addQuestion(catId: string) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId ? { ...c, questions: [...c.questions, emptyQuestion(catId)] } : c
      )
    );
  }

  function updateQuestion(catId: string, q: Question) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId ? { ...c, questions: c.questions.map((x) => (x.id === q.id ? q : x)) } : c
      )
    );
  }

  function deleteQuestion(catId: string, qId: string) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId ? { ...c, questions: c.questions.filter((q) => q.id !== qId) } : c
      )
    );
  }

  function onQuestionDragStart(catId: string, fromIdx: number) {
    setQuestionDrag({ catId, fromIdx });
  }

  function onQuestionDragOver(e: React.DragEvent, catId: string, toIdx: number) {
    e.preventDefault();
    if (!questionDrag || questionDrag.catId !== catId || questionDrag.fromIdx === toIdx) return;
    setBuilderCategories(
      builderCategories.map((c) => {
        if (c.id !== catId) return c;
        const qs = [...c.questions];
        const [moved] = qs.splice(questionDrag.fromIdx, 1);
        qs.splice(toIdx, 0, moved);
        return { ...c, questions: qs };
      })
    );
    setQuestionDrag({ catId, fromIdx: toIdx });
  }

  function onQuestionDragEnd() {
    setQuestionDrag(null);
  }

  function exportQuiz() {
    const blob = new Blob([JSON.stringify(builderCategories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importQuiz(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cats = JSON.parse(reader.result as string) as Category[];
        if (!Array.isArray(cats)) throw new Error('not an array');
        const reset = cats.map((c) => ({
          ...c,
          questions: c.questions.map((q) => ({ ...q, played: false })),
        }));
        setBuilderCategories(reset);
        toast('Quiz importiert', 'success');
      } catch {
        toast('Ungültige JSON-Datei', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function uploadQuiz() {
    if (!activeRoomCode) {
      toast('Keine aktive Lobby. Erstelle zuerst eine Lobby auf der Startseite.', 'error');
      return;
    }
    if (builderCategories.length === 0) {
      toast('Mindestens eine Kategorie erforderlich', 'error');
      return;
    }
    const hasEmpty = builderCategories.some((c) => c.questions.some((q) => !q.text.trim()));
    if (hasEmpty) {
      toast('Alle Fragen müssen einen Text haben', 'error');
      return;
    }
    try {
      const res = await apiFetch(`${API}/api/rooms/${activeRoomCode}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(builderCategories),
      });
      if (!res.ok) throw new Error('Quiz hochladen fehlgeschlagen');
      toast('Quiz hochgeladen!', 'success');
    } catch (e) {
      toast(String(e), 'error');
    }
  }

  async function saveToLibrary() {
    if (!editingQuizId) return;
    setSavingToLibrary(true);
    try {
      await updateQuiz(editingQuizId, editingQuizName, editingQuizDesc, builderCategories);
      toast('In Bibliothek gespeichert', 'success');
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  async function saveNewToLibrary() {
    if (!saveModalName.trim() || builderCategories.length === 0) return;
    setSavingToLibrary(true);
    try {
      const summary = await saveQuiz(saveModalName.trim(), saveModalDesc.trim(), 'jeopardy', builderCategories);
      setEditingQuizId(summary.id);
      setEditingQuizName(summary.name);
      setEditingQuizDesc(summary.description ?? '');
      setSaveModal(false);
      toast(`"${summary.name}" in Bibliothek gespeichert`, 'success');
    } catch (e) {
      toast(String(e), 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  const canUpload = !!activeRoomCode && builderCategories.length > 0;

  return (
    <div className="builder-layout">
      {/* Left: editor */}
      <div className="builder-editor">
        <div className="builder-header">
          <h1>
            {editingQuizId ? (
              <input
                className="category-name-input"
                style={{ fontSize: 18, fontWeight: 700, flex: 1 }}
                value={editingQuizName}
                onChange={(e) => setEditingQuizName(e.target.value)}
                placeholder="Quiz-Name"
              />
            ) : 'Quiz-Builder'}
          </h1>
          <div className="header-actions">
            <button className="btn-secondary btn-sm" onClick={() => navigate('/library')}>
              ← Bibliothek
            </button>
            <button className="btn-secondary btn-sm" onClick={addCategory}>+ Kategorie</button>
            {editingQuizId ? (
              <button
                className="btn-primary"
                onClick={saveToLibrary}
                disabled={savingToLibrary || builderCategories.length === 0}
              >
                {savingToLibrary ? 'Speichert…' : '💾 In Bibliothek speichern'}
              </button>
            ) : (
              <>
                <button className="btn-secondary btn-sm" onClick={() => importRef.current?.click()}>
                  📂 Import
                </button>
                <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importQuiz} />
                <button className="btn-secondary btn-sm" onClick={exportQuiz} disabled={builderCategories.length === 0}>
                  Export
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => { setSaveModalName(''); setSaveModalDesc(''); setSaveModal(true); }}
                  disabled={builderCategories.length === 0}
                >
                  💾 In Bibliothek speichern
                </button>
              </>
            )}
            <button
              className="btn-primary"
              onClick={uploadQuiz}
              disabled={!canUpload}
              title={!activeRoomCode ? 'Keine aktive Lobby' : ''}
            >
              In Raum laden
            </button>
            {activeRoomCode && (
              <button
                className="btn-success"
                onClick={() => navigate(`/rooms/${activeRoomCode}/lobby`)}
              >
                Zur Lobby →
              </button>
            )}
          </div>
        </div>

        {!activeRoomCode && (
          <div className="builder-notice">
            Kein aktiver Room.{' '}
            <button className="link-btn" onClick={() => navigate('/')}>
              Erstelle zuerst eine Lobby
            </button>
            {' '}auf der Startseite.
          </div>
        )}

        {builderCategories.length === 0 ? (
          <div className="empty-state">
            <p>Noch keine Kategorien. Klicke auf „+ Kategorie" um zu starten.</p>
          </div>
        ) : (
          <div className="categories-list">
            {builderCategories.map((cat, ci) => (
              <div key={cat.id} className="category-card">
                <div className="category-header">
                  <div className="category-num">{ci + 1}</div>
                  <input
                    className="category-name-input"
                    value={cat.name}
                    onChange={(e) => renameCategory(cat.id, e.target.value)}
                    placeholder="Kategoriename"
                  />
                  <span className="question-count">{cat.questions.length} Fragen</span>
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => deleteCategory(cat.id)}
                    style={{ opacity: 0.7 }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                  >
                    Löschen
                  </button>
                </div>

                <div className="questions-list">
                  {cat.questions.map((q, qi) => (
                    <div
                      key={q.id}
                      draggable
                      onDragStart={() => onQuestionDragStart(cat.id, qi)}
                      onDragOver={(e) => onQuestionDragOver(e, cat.id, qi)}
                      onDragEnd={onQuestionDragEnd}
                      className={questionDrag?.catId === cat.id && questionDrag.fromIdx === qi ? 'dragging' : ''}
                      style={{ cursor: 'grab' }}
                    >
                      <QuestionEditor
                        question={q}
                        onChange={(updated) => updateQuestion(cat.id, updated)}
                        onDelete={() => deleteQuestion(cat.id, q.id)}
                      />
                    </div>
                  ))}
                </div>

                <button className="add-question-btn" onClick={() => addQuestion(cat.id)}>
                  + Frage hinzufügen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: board preview */}
      <div className="builder-preview">
        <BoardPreview categories={builderCategories} />
      </div>

      {/* Modal: Neues Quiz in Bibliothek speichern */}
      {saveModal && (
        <div className="modal-backdrop" onClick={() => setSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Quiz in Bibliothek speichern</h2>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                type="text"
                placeholder="Name des Quizzes"
                value={saveModalName}
                onChange={(e) => setSaveModalName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNewToLibrary()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Beschreibung</label>
              <input
                className="form-input"
                type="text"
                placeholder="Optional"
                value={saveModalDesc}
                onChange={(e) => setSaveModalDesc(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSaveModal(false)}>Abbrechen</button>
              <button className="btn-primary" onClick={saveNewToLibrary} disabled={!saveModalName.trim() || savingToLibrary}>
                {savingToLibrary ? 'Speichert…' : '💾 Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
