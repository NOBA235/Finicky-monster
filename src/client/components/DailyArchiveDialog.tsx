import { useEffect, useState } from 'react';
import type { DailyArchiveItem, DailyArchiveResponse } from '../../shared/api.ts';
import { ModalDialog } from './ModalDialog.tsx';
import { MonsterIllustration } from './MonsterIllustration.tsx';

type DailyArchiveDialogProps = {
  readonly open: boolean;
  readonly activeChallengeId: string | undefined;
  readonly onClose: () => void;
  readonly onSelectDay: (dayKey: string) => void;
};

const STATUS_STYLE: Readonly<
  Record<DailyArchiveItem['status'], { readonly label: string; readonly cls: string }>
> = {
  solved: { label: '✓ Solved', cls: 'bg-[#e6f4e9] text-[#1f592d] border-[#9fd1ab]' },
  in_progress: { label: 'In Progress', cls: 'bg-[#fdf4db] text-[#7c5308] border-[#e7cb7a]' },
  missed: { label: 'Missed', cls: 'bg-[#fdebe8] text-[#9e2b1e] border-[#e9a89f]' },
  unplayed: { label: 'Unplayed', cls: 'bg-[#faf4e8] text-[#68584a] border-[#dfd0b8]' },
};

export function DailyArchiveDialog({
  open,
  activeChallengeId,
  onClose,
  onSelectDay,
}: DailyArchiveDialogProps) {
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [items, setItems] = useState<readonly DailyArchiveItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const run = async () => {
      try {
        const res = await fetch('/api/daily-archive');
        const data: DailyArchiveResponse | { status: 'error'; message: string } = await res.json();
        if (!res.ok || 'status' in data) {
          throw new Error('message' in data ? data.message : 'Failed to load archive.');
        }
        if (active) {
          setErrorMsg(null);
          setItems(data.items);
          setLoadedOnce(true);
        }
      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Could not load daily archive.');
          setLoadedOnce(true);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [open]);

  const loading = open && !loadedOnce && errorMsg === null;

  return (
    <ModalDialog open={open} onClose={onClose} title="Daily Monster Archive">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#68584a]">
          Explore recent official daily monsters across every difficulty tier. Solve{' '}
          <strong>Today’s Daily</strong> to extend your active streak!
        </p>

        {loading && (
          <p className="py-6 text-center text-sm font-bold text-[#68584a]">
            Loading recent daily monsters...
          </p>
        )}

        {errorMsg && (
          <p role="alert" className="text-xs font-bold text-[#9e2b1e]">
            {errorMsg}
          </p>
        )}

        {!loading && !errorMsg && (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const badge = STATUS_STYLE[item.status];
              const isActive = activeChallengeId === item.id;
              return (
                <li
                  key={item.dayKey}
                  className={`rounded-2xl border-2 p-2.5 flex items-center justify-between gap-2.5 ${
                    isActive
                      ? 'border-[#2b2118] bg-[#fdf4db]'
                      : 'border-[#dfd0b8] bg-[#fffdf8]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MonsterIllustration
                      appearance={item.appearance}
                      mood={item.status === 'solved' ? 'celebrate' : 'idle'}
                      size={56}
                      name={item.name}
                      decorative
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-extrabold text-[#2b2118]">
                          #{item.dayNumber} · {item.name}
                        </span>
                        {item.isToday && (
                          <span className="rounded-full bg-[#df5a49] px-2 py-0.5 text-[10px] font-black text-white">
                            TODAY
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#68584a] capitalize">
                        {item.difficulty} · {item.dayKey} · Fairness {item.fairnessScore}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDay(item.dayKey);
                        onClose();
                      }}
                      className="touch-target rounded-xl border-2 border-[#2b2118] bg-[#faf4e8] px-3 py-1 text-xs font-extrabold text-[#2b2118] hover:bg-[#f0bc3a] cursor-pointer"
                    >
                      {isActive ? 'Playing' : item.status === 'solved' ? 'View' : 'Play'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalDialog>
  );
}
