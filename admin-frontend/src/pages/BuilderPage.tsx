import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useGameStore } from '../store/gameStore';
import type { Category, Question } from '../types';

const API = `http://${window.location.hostname}:8080`;

// ---- helpers ----

function emptyQuestion(categoryId: string): Question {
  return {
    id: uuidv4(),
    categoryId,
    points: 200,
    text: '',
    played: false,
  };
}

function emptyCategory(): Category {
  return { id: uuidv4(), name: 'Neue Kategorie', questions: [] };
}

// ---- Sub-components ----

interface QuestionEditorProps {
  question: Question;
  onChange: (q: Question) => void;
  onDelete: () => void;
}

function QuestionEditor({ question, onChange, onDelete }: QuestionEditorProps) {
  const [uploading, setUploading] = useState(false);

  async function uploadMedia(file: File, field: 'imageUrl' | 'audioUrl' | 'videoUrl') {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/api/media/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload fehlgeschlagen');
      const data = await res.json();
      onChange({ ...question, [field]: `${API}${data.url}` });
    } catch (e) {
      alert(String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="question-editor">
      <div className="question-header">
        <select
          value={question.points}
          onChange={(e) => onChange({ ...question, points: Number(e.target.value) })}
        >
          {[100, 200, 300, 400, 500, 600, 800, 1000].map((p) => (
            <option key={p} value={p}>{p} Punkte</option>
          ))}
        </select>
        <button className="btn-danger btn-sm" onClick={onDelete}>✕</button>
      </div>

      <textarea
        placeholder="Fragetext *"
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
        rows={2}
      />

      <div className="media-row">
        {/* Image */}
        <label className="media-label">
          🖼 Bild
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'imageUrl')}
          />
        </label>
        {question.imageUrl && (
          <span className="media-preview">
            <img src={question.imageUrl} alt="" height={40} />
            <button onClick={() => onChange({ ...question, imageUrl: undefined })}>✕</button>
          </span>
        )}

        {/* Audio */}
        <label className="media-label">
          🎵 Audio
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'audioUrl')}
          />
        </label>
        {question.audioUrl && (
          <span className="media-preview">
            <audio src={question.audioUrl} controls style={{ height: 30 }} />
            <button onClick={() => onChange({ ...question, audioUrl: undefined })}>✕</button>
          </span>
        )}

        {/* Video */}
        <label className="media-label">
          🎬 Video
          <input
            type="file"
            accept="video/*"
            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'videoUrl')}
          />
        </label>
        {question.videoUrl && (
          <span className="media-preview">
            <video src={question.videoUrl} controls style={{ height: 40 }} />
            <button onClick={() => onChange({ ...question, videoUrl: undefined })}>✕</button>
          </span>
        )}
      </div>

      {uploading && <span className="uploading">Hochladen…</span>}
    </div>
  );
}

// ---- Main page ----

export default function BuilderPage() {
  const navigate = useNavigate();
  const { builderCategories, setBuilderCategories, resetGameState } = useGameStore();
  const importRef = useRef<HTMLInputElement>(null);

  // ---- Category operations ----

  function addCategory() {
    setBuilderCategories([...builderCategories, emptyCategory()]);
  }

  function renameCategory(id: string, name: string) {
    setBuilderCategories(
      builderCategories.map((c) => (c.id === id ? { ...c, name } : c))
    );
  }

  function deleteCategory(id: string) {
    if (!confirm('Kategorie löschen?')) return;
    setBuilderCategories(builderCategories.filter((c) => c.id !== id));
  }

  // ---- Question operations ----

  function addQuestion(catId: string) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId
          ? { ...c, questions: [...c.questions, emptyQuestion(catId)] }
          : c
      )
    );
  }

  function updateQuestion(catId: string, q: Question) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId
          ? { ...c, questions: c.questions.map((x) => (x.id === q.id ? q : x)) }
          : c
      )
    );
  }

  function deleteQuestion(catId: string, qId: string) {
    setBuilderCategories(
      builderCategories.map((c) =>
        c.id === catId
          ? { ...c, questions: c.questions.filter((q) => q.id !== qId) }
          : c
      )
    );
  }

  // ---- Export / Import ----

  function exportQuiz() {
    const blob = new Blob([JSON.stringify(builderCategories, null, 2)], {
      type: 'application/json',
    });
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
        alert('Ungültige JSON-Datei');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ---- To Lobby: create room + upload quiz ----

  async function goToLobby() {
    if (builderCategories.length === 0) {
      alert('Mindestens eine Kategorie erforderlich');
      return;
    }
    const hasEmpty = builderCategories.some((c) =>
      c.questions.some((q) => !q.text.trim())
    );
    if (hasEmpty) {
      alert('Alle Fragen müssen einen Text haben');
      return;
    }

    try {
      // Always create a fresh room — never reuse a previous session's room
      resetGameState();
      const res = await fetch(`${API}/api/rooms`, { method: 'POST' });
      if (!res.ok) throw new Error('Room erstellen fehlgeschlagen');
      const { code } = await res.json();

      const uploadRes = await fetch(`${API}/api/rooms/${code}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(builderCategories),
      });
      if (!uploadRes.ok) throw new Error('Quiz hochladen fehlgeschlagen');

      navigate('/lobby');
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="page builder-page">
      <header className="page-header">
        <h1>Quiz-Builder</h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => importRef.current?.click()}>
            📂 Importieren
          </button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importQuiz} />
          <button className="btn-secondary" onClick={exportQuiz} disabled={builderCategories.length === 0}>
            💾 Exportieren
          </button>
          <button className="btn-primary" onClick={addCategory}>
            + Kategorie
          </button>
          <button className="btn-success" onClick={goToLobby} disabled={builderCategories.length === 0}>
            Weiter zur Lobby →
          </button>
        </div>
      </header>

      {builderCategories.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Kategorien. Klicke auf „+ Kategorie" um zu starten.</p>
        </div>
      ) : (
        <div className="categories-list">
          {builderCategories.map((cat) => (
            <div key={cat.id} className="category-card">
              <div className="category-header">
                <input
                  className="category-name-input"
                  value={cat.name}
                  onChange={(e) => renameCategory(cat.id, e.target.value)}
                />
                <span className="question-count">{cat.questions.length} Fragen</span>
                <button className="btn-danger btn-sm" onClick={() => deleteCategory(cat.id)}>
                  Kategorie löschen
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

              <button className="btn-secondary btn-sm add-question-btn" onClick={() => addQuestion(cat.id)}>
                + Frage hinzufügen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
