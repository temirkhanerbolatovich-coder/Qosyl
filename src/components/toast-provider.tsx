'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X } from 'lucide-react';
import { useI18n } from './locale-provider';

export type ToastInput = {
  text: string;
  /** Language of `text` when it is not the interface language (for example publisher text). */
  lang?: string;
  /** A visible undo or follow-up action; its toast stays longer. */
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type Toast = ToastInput & { id: number; leaving: boolean };

const ToastContext = createContext<{ show: (toast: ToastInput) => void }>({ show: () => {} });
/** Short confirmations and undo for quick actions. Outside the provider it does nothing. */
export const useToast = () => useContext(ToastContext);

const maxToasts = 3;
const plainMs = 6000;
const actionMs = 10000;
// Matches --motion-exit; the toast keeps its place until the exit animation has played.
const leaveMs = 200;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { locale, t } = useI18n();
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  // The timer stops while the pointer or keyboard focus is on the toast and restarts afterwards.
  useEffect(() => {
    if (paused || busy || toast.leaving) return;
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      toast.actionLabel ? actionMs : plainMs,
    );
    return () => window.clearTimeout(timer);
  }, [paused, busy, toast.leaving, toast.actionLabel, toast.id, onDismiss]);
  return (
    <div
      className="toast"
      data-state={toast.leaving ? 'leaving' : 'open'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p lang={toast.lang ?? locale}>{toast.text}</p>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          className="button secondary small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await toast.onAction?.();
            } finally {
              onDismiss(toast.id);
            }
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="icon-button toast-close"
        aria-label={t('Закрыть уведомление', 'Хабарламаны жабу')}
        onClick={() => onDismiss(toast.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<number>());
  const dismiss = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
    );
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, leaveMs);
    timers.current.add(timer);
  }, []);
  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    // A newer confirmation replaces an identical text, and only the latest few stay on screen.
    setToasts((current) =>
      [
        ...current.filter((toast) => toast.text !== input.text),
        { ...input, id, leaving: false },
      ].slice(-maxToasts),
    );
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The region exists from the start, so screen readers announce what is added to it. */}
      <div className="toast-region" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
