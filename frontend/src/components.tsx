import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { label } from "./format";

export function Button({
  children,
  variant = "primary",
  className = "",
  busy,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props} disabled={props.disabled || busy}>
      {busy ? <Loader2 size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Badge({ value, children }: { value: unknown; children?: ReactNode }) {
  const status = String(value ?? "draft").toLowerCase();
  const tone =
    /complete|received|paid|invoiced|dispatched/.test(status) && !/partial|unpaid/.test(status)
      ? "green"
      : /progress|active|partial|processing/.test(status)
        ? "blue"
        : /overdue|low|reject|cancel|error/.test(status)
          ? "red"
          : /open|pending|unpaid|reserved/.test(status)
            ? "amber"
            : "neutral";
  return (
    <span className={`badge badge-${tone}`}>
      <span />
      {children ?? label(value)}
    </span>
  );
}
export function Empty({
  title = "A clear start.",
  text = "Your records will appear here as your team gets to work.",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <span />
        <span />
        <span />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Metric({
  label: text,
  value,
  sub,
  icon,
  color = "teal",
  action,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  icon: ReactNode;
  color?: string;
  action?: () => void;
}) {
  return (
    <button className={`metric metric-${color}`} onClick={action} type="button">
      <div className="metric-top">
        <span>{text}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-bottom">
        <span>{sub}</span>
        <ArrowUpRight size={15} />
      </div>
    </button>
  );
}
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={active === tab.id ? "active" : ""}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={16} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search" type="button">
          <X size={13} />
        </button>
      )}
    </label>
  );
}
export type Column<T> = {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
};
export function Table<T>({
  columns,
  rows,
  rowKey,
  empty,
  compact = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  compact?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const pageSize = compact ? 5 : 8;
  useEffect(() => {
    setPage(0);
  }, [rows.length]);
  const sorted = [...rows];
  const column = columns.find((c) => c.key === sort?.key);
  if (sort && column?.sort)
    sorted.sort((a, b) => {
      const av = column.sort!(a),
        bv = column.sort!(b);
      return (
        (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) *
        (sort.desc ? -1 : 1)
      );
    });
  const actualPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  if (!rows.length) return <>{empty ?? <Empty />}</>;
  return (
    <>
      <div className="table-scroll">
        <table className={compact ? "compact" : ""}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.className}>
                  {c.sort ? (
                    <button
                      className="sort-button"
                      onClick={() => setSort({ key: c.key, desc: sort?.key === c.key ? !sort.desc : false })}
                    >
                      {c.label}
                      {sort?.key === c.key ? sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : null}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(actualPage * pageSize, (actualPage + 1) * pageSize).map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="pagination">
          <span>
            Showing {actualPage * pageSize + 1}–{Math.min((actualPage + 1) * pageSize, rows.length)} of {rows.length}
          </span>
          <div>
            <button aria-label="Previous page" disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span>
              {actualPage + 1} / {Math.ceil(rows.length / pageSize)}
            </span>
            <button
              aria-label="Next page"
              disabled={(actualPage + 1) * pageSize >= rows.length}
              onClick={() => setPage(actualPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
  drawer = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = () => dialog.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    requestAnimationFrame(focus);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
          ) ?? []),
        ];
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${drawer ? "drawer-backdrop" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`dialog ${wide ? "dialog-wide" : ""} ${drawer ? "drawer" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="dialog-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Progress({ value, color = "teal" }: { value: number; color?: string }) {
  return (
    <div className={`progress progress-${color}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function Toast({ text, onClose, error }: { text: string; onClose: () => void; error?: boolean }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6500);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={`toast ${error ? "toast-error" : ""}`} role="status">
      <span className="toast-check">{error ? <X size={17} /> : <Check size={17} />}</span>
      <span>{text}</span>
      <button aria-label="Dismiss notification" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}
