import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useGameStore } from '../store/gameStore';
import type { Category, Question } from '../types';
import type { ToastType } from '../App';

const API = `http://${window.location.hostname}:8080`;

function emptyQuestion(categoryId: string): Question {
  return { id: uuidv4(), categoryId, points: 200, text: '', answer: '', played: false };
}

function emptyCategory(): Category {
  return { id: uuidv4(), name: 'Neue Kategorie', questions: [] };
}

// ---- Board Preview ----

function BoardPreview({ categories }: { categories: Category[] }) {
  if (!categories.length) {
    return (
      <div className="board-preview-inner">
        <div className="board-preview-empty">
          <div className="board-preview-empty-icon">⊞</div>
          <div>Board-Vorschau</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Füge Kategorien hinzu</div>
        </div>
      </div>
    );
  }

  const maxQ = Math.max(...categories.map((c) => c.questions.length), 1);

  return (
    <div className="board-preview-inner">
      <div className="board-preview-label">BOARD-VORSCHAU</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
          gridTemplateRows: `auto repeat(${maxQ}, 1fr)`,
          gap: 4,
        }}
      >
        {categories.map((cat) => (
          <div key={cat.id + 'h'} className="preview-cat-header">
            {cat.name || '—'}
          </div>
        ))}
        {Array.from({ length: maxQ }).map((_, ri) =>
          categories.map((cat) => {
            const q = cat.questions[ri];
            return q ? (
              <div key={q.id} className="preview-cell">
                {q.points}
              </div>
            ) : (
              <div key={`e-${cat.id}-${ri}`} className="preview-cell-empty" />
            );
          })
        )}
      </div>
      <div className="board-preview-stats">
        <span>{categories.length} Kategorien</span>
        <span>{categories.reduce((a, c) => a + c.questions.length, 0)} Fragen</span>
      </div>
    </div>
  );
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
      const res = await fetch(`${API}/api/media/upload`, { method: 'POST', body: form });
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

export default function BuilderPage({ toast }: Props) {
  const navigate = useNavigate();
  const { builderCategories, setBuilderCategories, resetGameState } = useGameStore();
  const importRef = useRef<HTMLInputElement>(null);

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
        setBuilderCategories(cats);
      } catch {
        toast('Ungültige JSON-Datei', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function goToLobby() {
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
      resetGameState();
      const res = await fetch(`${API}/api/rooms`, { method: 'POST' });
      if (!res.ok) throw new Error('Room erstellen fehlgeschlagen');
      const { code } = await res.json();
      useGameStore.setState({ roomCode: code });

      const uploadRes = await fetch(`${API}/api/rooms/${code}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(builderCategories),
      });
      if (!uploadRes.ok) throw new Error('Quiz hochladen fehlgeschlagen');

      navigate('/lobby');
    } catch (e) {
      toast(String(e), 'error');
    }
  }

  return (
    <div className="builder-layout">
      {/* Left: editor */}
      <div className="builder-editor">
        <div className="builder-header">
          <h1>Quiz-Builder</h1>
          <div className="header-actions">
            <button className="btn-secondary btn-sm" onClick={() => importRef.current?.click()}>
              📂 Import
            </button>
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importQuiz} />
            <button className="btn-secondary btn-sm" onClick={exportQuiz} disabled={builderCategories.length === 0}>
              💾 Export
            </button>
            <button className="btn-secondary" onClick={addCategory}>+ Kategorie</button>
            <button className="btn-success" onClick={goToLobby} disabled={builderCategories.length === 0}>
              Zur Lobby →
            </button>
          </div>
        </div>

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
                  {cat.questions.map((q) => (
                    <QuestionEditor
                      key={q.id}
                      question={q}
                      onChange={(updated) => updateQuestion(cat.id, updated)}
                      onDelete={() => deleteQuestion(cat.id, q.id)}
                    />
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
    </div>
  );
}
