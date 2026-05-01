import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuthStore } from '@/store/auth';
import { useBudgetStore } from '@/store/budget';
import { getDistinctLargeCategoriesApplied } from '@/lib/aggregate';
import { orderCategories } from '@/lib/budget';
import { colorForCategory } from '@/lib/categories';
import { cn } from '@/lib/utils';

export default function CategoryOrderEditor() {
  const config = useBudgetStore((s) => s.config);
  const setConfig = useBudgetStore((s) => s.setConfig);
  const isDirty = useBudgetStore((s) => s.isDirty);
  const status = useBudgetStore((s) => s.status);
  const error = useBudgetStore((s) => s.error);
  const save = useBudgetStore((s) => s.save);
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);

  const known = useLiveQuery(() => getDistinctLargeCategoriesApplied(), [], []);

  const allCategories = useMemo(() => {
    if (!config) return [];
    const all = new Set<string>([
      ...(config.categoryOrder ?? []),
      ...Object.keys(config.budgets.annual),
      ...known,
    ]);
    return orderCategories(config, all);
  }, [config, known]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!config) {
    return (
      <p className="text-sm text-ink-60">
        予算データを読み込み中… 先にダッシュボードでフォルダを選択している必要があります。
      </p>
    );
  }

  function reset() {
    setConfig((prev) => ({ ...prev, categoryOrder: [] }));
  }

  async function onSave() {
    const t = (await ensureFreshToken()) ?? accessToken;
    if (t) await save(t);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = allCategories.indexOf(active.id as string);
    const newIdx = allCategories.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(allCategories, oldIdx, newIdx);
    setConfig((prev) => ({ ...prev, categoryOrder: next }));
  }

  const orderSet = new Set(config.categoryOrder ?? []);

  return (
    <div className="space-y-3">
      {allCategories.length === 0 ? (
        <p className="text-sm text-ink-60">
          カテゴリがまだありません。データを同期するとMFのCSVから自動的に拾われます。
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allCategories} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {allCategories.map((c, i) => (
                <SortableRow key={c} id={c} index={i} inOrder={orderSet.has(c)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
        <button
          type="button"
          onClick={reset}
          className="text-xs text-ink-60 hover:text-ink underline-offset-2 hover:underline"
        >
          並び順をリセット（自動配置に戻す）
        </button>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-rose-700">{error}</span>}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!isDirty || status === 'saving'}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-opacity',
              !isDirty || status === 'saving'
                ? 'bg-ink-40/40 text-white cursor-not-allowed'
                : 'bg-accent text-white hover:opacity-90',
            )}
          >
            {status === 'saving' ? '保存中…' : isDirty ? '保存' : '保存済'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableRow({ id, index, inOrder }: { id: string; index: number; inOrder: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 border border-line rounded-md text-sm bg-white select-none',
        isDragging && 'shadow-lg z-10 opacity-90 cursor-grabbing',
        !isDragging && 'cursor-grab',
      )}
      {...attributes}
      {...listeners}
    >
      <span className="text-ink-40 text-base leading-none w-4 text-center" aria-hidden>
        ⋮⋮
      </span>
      <span className="text-[10px] tabular-nums text-ink-40 w-6 text-right">{index + 1}</span>
      <span
        className="text-[11px] px-1.5 py-0.5 rounded-sm"
        style={{
          color: colorForCategory(id),
          background: `${colorForCategory(id)}15`,
        }}
      >
        {id}
      </span>
      <span className="flex-1" />
      {!inOrder && <span className="text-[10px] text-ink-40">未配置（保存で確定）</span>}
    </li>
  );
}
