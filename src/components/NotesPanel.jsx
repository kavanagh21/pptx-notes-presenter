import { useMemo } from 'react';

/**
 * Collect top-level bullet groups from notesBlocks.
 * A "group" is a top-level paragraph (level 0 or first non-blank)
 * plus any following sub-items (level > 0) or blank lines until the next top-level item.
 * @param {{ text: string, level: number, isBullet: boolean, bulletChar?: string }[]} blocks
 * @returns {{ blocks: object[] }[]}
 */
function getTopLevelGroups(blocks) {
  if (!blocks || blocks.length === 0) return [];
  const groups = [];
  let current = null;

  for (const b of blocks) {
    const isTopLevel = b.text !== '' && b.level === 0;
    if (isTopLevel) {
      if (current) groups.push(current);
      current = { blocks: [b] };
    } else {
      if (!current) current = { blocks: [] };
      current.blocks.push(b);
    }
  }
  if (current && current.blocks.length > 0) groups.push(current);
  return groups;
}

function BlockRenderer({ block }) {
  if (block.text === '') {
    return <div className="notes-panel__paragraph notes-panel__paragraph--blank" />;
  }
  const indent = block.level * 1.5;
  return (
    <p
      className={`notes-panel__paragraph ${block.isBullet ? 'notes-panel__paragraph--bullet' : ''}`}
      style={{ marginLeft: block.level > 0 ? `${indent}em` : undefined }}
    >
      {block.isBullet && (
        <span className="notes-panel__bullet" aria-hidden="true">
          {block.bulletChar || '•'}{' '}
        </span>
      )}
      {block.text}
    </p>
  );
}

/**
 * Renders notes in two modes:
 *   - "all":    full notes for the slide (scrollable)
 *   - "bullet": one top-level bullet at a time, centered, with prev/next dimmed
 */
export function NotesPanel({
  notesBlocks = [],
  fontSize = 1,
  className = '',
  bulletMode = false,
  bulletIndex = 0,
}) {
  const groups = useMemo(() => getTopLevelGroups(notesBlocks), [notesBlocks]);

  if (!notesBlocks || notesBlocks.length === 0) {
    return (
      <div className={`notes-panel notes-panel--empty ${className}`.trim()}>
        <p className="notes-panel__empty">No notes for this slide.</p>
      </div>
    );
  }

  const style = { fontSize: `${fontSize}rem` };

  if (!bulletMode) {
    return (
      <div className={`notes-panel ${className}`.trim()} style={style}>
        <div className="notes-panel__content">
          {notesBlocks.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(bulletIndex, groups.length - 1));
  const prev = clamped > 0 ? groups[clamped - 1] : null;
  const curr = groups[clamped] || null;
  const next = clamped < groups.length - 1 ? groups[clamped + 1] : null;

  return (
    <div className={`notes-panel notes-panel--bullet ${className}`.trim()} style={style}>
      <div className="notes-panel__bullet-view">
        <div className="notes-panel__bullet-prev" aria-hidden="true">
          {prev && prev.blocks.map((b, i) => <BlockRenderer key={i} block={b} />)}
        </div>

        <div className="notes-panel__bullet-current">
          {curr && curr.blocks.map((b, i) => <BlockRenderer key={i} block={b} />)}
        </div>

        <div className="notes-panel__bullet-next" aria-hidden="true">
          {next
            ? next.blocks.map((b, i) => <BlockRenderer key={i} block={b} />)
            : clamped === groups.length - 1 && (
                <p className="notes-panel__next-slide">[Next slide]</p>
              )}
        </div>
      </div>
    </div>
  );
}

export { getTopLevelGroups };
