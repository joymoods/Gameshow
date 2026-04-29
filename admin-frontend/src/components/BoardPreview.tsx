import type { Category } from '../types';

export default function BoardPreview({ categories }: { categories: Category[] }) {
  if (!categories.length) {
    return (
      <div className="board-preview-inner">
        <div className="board-preview-empty">
          <div className="board-preview-empty-icon">⊞</div>
          <div>Board-Vorschau</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Kein Quiz geladen</div>
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
