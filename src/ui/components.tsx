/* ============================================================
   SHARED UI COMPONENTS  ( src/ui/ )
   ============================================================ */
import { useState } from 'react';
import type { Artifact } from '../data/types';
import { rarityForScore } from '../data/constants';

/* --- artifact thumbnail with letter fallback ----------------
   Tries /artifacts/<file>. Until that file exists (it doesn't
   yet), the artifact's first letter is shown instead. Dropping
   real images into public/artifacts/ later needs no code change. */
export function Thumb({
  artifact, size, onClick,
}: {
  artifact: Artifact;
  size?: 'sm' | 'lg';
  onClick?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const cls = 'thumb'
    + (size ? ' ' + size : '')
    + (onClick ? ' clickable' : '');
  return (
    <div
      className={cls}
      title={artifact.name}
      onClick={onClick}
    >
      {failed ? (
        artifact.name.charAt(0).toUpperCase()
      ) : (
        <img
          src={import.meta.env.BASE_URL + artifact.image}
          alt={artifact.name}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/* --- rarity pill (derived from score) ----------------------- */
export function RarityPill({ score }: { score: number }) {
  const band = rarityForScore(score);
  return <span className={'pill ' + band.cls}>{band.name}</span>;
}

/* --- artifact detail view ----------------------------------- */
export function ArtifactDetail({
  artifact, onBack,
}: {
  artifact: Artifact;
  onBack: () => void;
}) {
  const band = rarityForScore(artifact.score);
  return (
    <div className="panel">
      <h2>
        Catalogue Entry
        <span className="sub">artifact detail</span>
      </h2>
      <div className="divider" />
      <div className="detail-head">
        <Thumb artifact={artifact} size="lg" />
        <div className="detail-body">
          <div className="detail-title">{artifact.name}</div>
          <div className="detail-meta">
            {artifact.author} · {artifact.year}
          </div>
          <div>
            <RarityPill score={artifact.score} />{' '}
            <span className={'score-badge ' + band.cls}>
              Score {artifact.score}
            </span>
          </div>
        </div>
      </div>
      <dl className="detail-grid">
        <dt>Type</dt><dd>{artifact.type}</dd>
        <dt>Style</dt><dd>{artifact.style}</dd>
        <dt>Author</dt><dd>{artifact.author}</dd>
        <dt>Year</dt><dd>{artifact.year}</dd>
      </dl>
      <p className="detail-desc">{artifact.description}</p>
      <div className="divider" />
      <button className="ghost" onClick={onBack}>← Back</button>
    </div>
  );
}
