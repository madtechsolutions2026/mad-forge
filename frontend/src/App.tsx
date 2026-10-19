import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Factory,
  Fingerprint,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { api, ApiError, setContext } from "./api";
import { Badge, Button, Dialog, Empty, SearchField, Toast } from "./components";
import { FormDialog } from "./Forms";
import { PurchaseOrderPage } from "./PurchaseOrderPage";
import type { Action } from "./Forms";
import { date, label, money, number, relative } from "./format";
import { Finance, Inventory, Overview, Procurement, Production, Sales, WorkspacePage } from "./Pages";
import type { PageProps } from "./Pages";
import type { Page, Session, Workspace } from "./types";

const purchasePath = () => {
  const match = location.hash.match(/^#procurement\/purchase\/(new|[0-9a-f-]{36})$/i);
  return match?.[1] ?? "";
};

const navigation: { id: Page; label: string; icon: typeof LayoutDashboard; shortcut?: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "procurement", label: "Procurement", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "production", label: "Production", icon: Factory },
  { id: "sales", label: "Sales & dispatch", icon: ShoppingBag },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "workspace", label: "Workspace", icon: Settings2 },
];
const pages: Record<Page, React.ComponentType<PageProps>> = {
  overview: Overview,
  procurement: Procurement,
  inventory: Inventory,
  production: Production,
  sales: Sales,
  finance: Finance,
  workspace: WorkspacePage,
};
const permissions: Record<string, string[]> = {
  purchase: ["purchasing"],
  sale: ["purchasing", "sales"],
  receive: ["warehouse"],
  dispatch: ["warehouse"],
  adjustment: ["warehouse"],
  bom: ["production"],
  workorder: ["production"],
  start: ["production"],
  complete: ["production"],
  bill: ["finance"],
  invoice: ["finance"],
  payment: ["finance"],
  expense: ["finance"],
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-symbol">
        <i />
        <i />
        <i />
      </span>
      <div>
        <strong>
          forge<span>®</span>
        </strong>
        <small>BY MADTECH</small>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [w, setWorkspace] = useState<Workspace | null>(null);
  const [companyId, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(new Date());
  const [page, setPage] = useState<Page>(() =>
    navigation.some((n) => n.id === location.hash.slice(1).split("/")[0])
      ? (location.hash.slice(1).split("/")[0] as Page)
      : "overview",
  );
  const [purchaseRoute, setPurchaseRoute] = useState(purchasePath);
  const [mobile, setMobile] = useState(false);
  const [smallScreen, setSmallScreen] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [activity, setActivity] = useState(false);
  const [account, setAccount] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [details, setDetails] = useState<{ record: any; type: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => {
      setSmallScreen(media.matches);
      if (!media.matches) setMobile(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const notify = (text: string, error = false) => setToast({ text, error });
  useEffect(() => {
    api
      .me()
      .then((s) => {
        setContext(s);
        setSession(s);
        setCompany(s.companies[0]?.id ?? "");
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, []);
  const load = useCallback(async () => {
    if (!session || !companyId) return;
    setLoading(true);
    setContext(session, companyId);
    try {
      const next = await api.workspace();
      setWorkspace(next);
      setError("");
      setUpdated(new Date());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null);
        setWorkspace(null);
      } else setError(err instanceof Error ? err.message : "Unable to load the workspace.");
    } finally {
      setLoading(false);
    }
  }, [session, companyId]);
  useEffect(() => {
    setWorkspace(null);
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !action) void load();
    }, 60000);
    return () => clearInterval(timer);
  }, [load, action]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((p) => !p);
      }
      if (event.key === "Escape") {
        setMobile(false);
        setAccount(false);
      }
    };
    const onHash = () => {
      const next = location.hash.slice(1).split("/")[0] as Page;
      if (navigation.some((n) => n.id === next)) setPage(next);
      setPurchaseRoute(purchasePath());
      setAction(null);
      setDetails(null);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const navigate = (next: Page) => {
    setPurchaseRoute("");
    setAction(null);
    setDetails(null);
    setPage(next);
    location.hash = next;
    setMobile(false);
    setPalette(false);
    main.current?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const role = session?.companies.find((c) => c.id === companyId)?.role.toLowerCase() ?? "viewer";
  const can = (operation: string) =>
    ["owner", "admin"].includes(role) ||
    (permissions[operation] ?? ["purchasing", "warehouse", "production"]).includes(role);
  const openPurchase = (id = "new") => {
    setAction(null);
    setDetails(null);
    setPage("procurement");
    setPurchaseRoute(id);
    setMobile(false);
    setPalette(false);
    location.hash = "procurement/purchase/" + id;
    main.current?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openAction = (next: Action) => {
    if (next.type === "purchase") openPurchase();
    else setAction(next);
  };
  const openDetail = (record: any, type: string) => {
    if (type === "purchase") openPurchase(record.id);
    else setDetails({ record, type });
  };
  async function savePurchase(body: unknown, key: string) {
    const result = await api.mutate("/purchase-orders", body, key);
    await load();
    notify((result.code ?? "Purchase order") + " saved successfully.");
    openPurchase(result.id);
  }
  async function onMutation(path: string, body: unknown, key: string) {
    const result = await api.mutate(path, body, key);
    await load();
    notify(result.code ? `${result.code} saved successfully.` : "Record saved successfully.");
  }
  async function logout() {
    try {
      await api.logout();
      setSession(null);
      setWorkspace(null);
      setAccount(false);
      setContext({ user: { id: "", name: "", email: "" }, companies: [], csrfToken: "" });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Unable to sign out.", true);
    }
  }
  if (initializing)
    return (
      <div className="splash">
        <Brand />
        <Loader2 size={22} className="spin" />
        <span>Connecting your workspace</span>
      </div>
    );
  if (!session)
    return (
      <Auth
        onLogin={(s) => {
          setContext(s);
          setSession(s);
          setCompany(s.companies[0]?.id ?? "");
        }}
      />
    );
  const PageView = pages[page];
  const demo = /demo/i.test(w?.company.name ?? "") || session.user.email === "demo@madtech.local";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      {mobile && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
      <aside
        className={`sidebar ${mobile ? "sidebar-open" : ""}`}
        inert={smallScreen && !mobile ? true : undefined}
        aria-hidden={smallScreen && !mobile ? true : undefined}
      >
        <div className="sidebar-brand">
          <Brand />
          <button className="sidebar-close icon-button" onClick={() => setMobile(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-monogram">{(w?.company.name ?? "M").slice(0, 1)}</span>
          <div>
            <small>YOUR WORKSPACE</small>
            <select
              value={companyId}
              onChange={(e) => {
                setCompany(e.target.value);
                setAction(null);
                setDetails(null);
                setPurchaseRoute("");
                setPage("procurement");
                location.hash = "procurement";
              }}
              aria-label="Select company"
            >
              {session.companies.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={13} />
        </div>
        <span className="nav-section-label">OPERATIONS</span>
        <nav aria-label="Main navigation">
          {navigation.map((nav, index) => (
            <button
              key={nav.id}
              className={`nav-item ${page === nav.id ? "active" : ""} ${index === 6 ? "nav-settings" : ""}`}
              onClick={() => navigate(nav.id)}
              aria-current={page === nav.id ? "page" : undefined}
            >
              <nav.icon size={18} strokeWidth={1.7} />
              <span>{nav.label}</span>
              {nav.id === "procurement" && Number(w?.summary.openPurchases ?? 0) > 0 ? (
                <i>{w?.summary.openPurchases}</i>
              ) : (
                nav.id === "overview" && <span className="nav-active-mark" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-insight">
            <span className="insight-orbit">
              <Sparkles size={17} />
            </span>
            <strong>
              A little more clarity.
              <br />A lot more possibility.
            </strong>
            <p>One connected place for the work that matters.</p>
            <button onClick={() => setHelp(true)}>
              Explore Forge
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            Help & getting started
            <ArrowUpRight size={13} />
          </button>
          <div className="sidebar-footer">
            <span>
              <i />
              {error ? "Connection interrupted" : w ? "System connected" : "Connecting…"}
            </span>
            <small>v1.0</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobile(true)} aria-label="Open navigation">
              <Menu size={21} />
            </button>
            <span className="breadcrumb-brand">Workspace</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <button className="command-trigger" onClick={() => setPalette(true)} aria-label="Search workspace">
            <Search size={16} />
            <span>Search anything…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <button
              className="icon-button refresh-button"
              title={`Refresh · updated ${updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
              aria-label="Refresh workspace"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="View recent activity"
              onClick={() => setActivity(true)}
            >
              <Bell size={18} />
              {w && w.activity.length > 0 && <span />}
            </button>
            <span className="topbar-divider" />
            <button
              className="account-trigger"
              onClick={() => setAccount((a) => !a)}
              aria-expanded={account}
              aria-label="Account menu"
            >
              <span className="user-avatar">{session.user.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{session.user.name}</strong>
                <small>{label(role)}</small>
              </div>
              <ChevronDown size={13} />
            </button>
            {account && (
              <div className="account-menu">
                <strong>{session.user.name}</strong>
                <span>{session.user.email}</span>
                <button
                  onClick={() => {
                    navigate("workspace");
                    setAccount(false);
                  }}
                >
                  <Settings2 size={15} />
                  Workspace settings
                </button>
                <button onClick={() => void logout()}>
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main id="workspace-content" ref={main} className="main-content">
          {demo && (
            <div className="demo-ribbon">
              <span>
                <span className="demo-dot" />
                DEMO WORKSPACE
              </span>
              <p>Sample data. Real workflows. Changes here are saved.</p>
              <button onClick={() => setHelp(true)}>
                How it works
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
          {error && (
            <div className="workspace-error" role="alert">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => void load()} busy={loading}>
                Try again
              </Button>
            </div>
          )}
          {w ? (
            purchaseRoute ? (
              <PurchaseOrderPage
                key={companyId + purchaseRoute}
                w={w}
                isNew={purchaseRoute === "new"}
                order={w.purchaseOrders.find((o) => o.id === purchaseRoute)}
                canCreate={can("purchase")}
                canReceive={can("receive")}
                onBack={() => navigate("procurement")}
                onNew={() => openPurchase()}
                onReceive={(record) => setAction({ type: "receive", record })}
                onSave={savePurchase}
              />
            ) : (
              <PageView
                w={w}
                session={session}
                openAction={openAction}
                detail={openDetail}
                navigate={navigate}
                can={can}
              />
            )
          ) : loading ? (
            <LoadingWorkspace />
          ) : (
            !error && (
              <Empty title="No company workspace" text="Your account needs a company membership to use Forge." />
            )
          )}
          <footer className="main-footer">
            <span>
              MADTECH <i>/</i> FORGE
            </span>
            <small>Manufacturing, connected.</small>
            <span className="footer-lock">
              <LockKeyhole size={11} />
              Secure workspace
            </span>
          </footer>
        </main>
      </div>
      {action && w && (
        <FormDialog action={action} workspace={w} onClose={() => setAction(null)} onSubmit={onMutation} />
      )}
      {details && <DetailDialog record={details.record} type={details.type} onClose={() => setDetails(null)} />}
      {palette && (
        <CommandPalette
          w={w}
          navigate={navigate}
          openAction={openAction}
          detail={(record, type) => {
            openDetail(record, type);
            setPalette(false);
          }}
          can={can}
          onClose={() => setPalette(false)}
        />
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {activity && (
        <Dialog title="Your workspace in motion" eyebrow="RECENT ACTIVITY" onClose={() => setActivity(false)} drawer>
          <div className="dialog-content activity-drawer">
            {w?.activity.map((a) => (
              <div className="activity-drawer-row" key={a.id}>
                <span>
                  <Activity size={15} />
                </span>
                <div>
                  <strong>{a.description || label(a.action)}</strong>
                  <p>
                    {label(a.entityType)} · {relative(a.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            {!w?.activity.length && <Empty title="Nothing recorded yet" text="Your next operation will appear here." />}
          </div>
        </Dialog>
      )}
      {toast && <Toast text={toast.text} error={toast.error} onClose={() => setToast(null)} />}
    </div>
  );
}

function Auth({ onLogin }: { onLogin: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function submit(event?: React.FormEvent, demo = false) {
    event?.preventDefault();
    setBusy(demo ? "demo" : "form");
    setError("");
    try {
      const session = demo
        ? await api.login("demo@madtech.local", "ForgeDemo@2026!")
        : mode === "login"
          ? await api.login(email, password)
          : await api.register(name, email, password, company);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn’t connect. Please try again.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-left">
        <Brand />
        <div className="auth-form-wrap">
          <span className="auth-eyebrow">
            <span />
            THE MANUFACTURING WORKSPACE
          </span>
          <h1>
            {mode === "login" ? (
              <>
                Good work starts
                <br />
                with a clear view<span>.</span>
              </>
            ) : (
              <>
                Your next chapter
                <br />
                starts here<span>.</span>
              </>
            )}
          </h1>
          <p>
            {mode === "login"
              ? "Welcome to Forge. Bring your people, materials, and operations together."
              : "Create a company workspace and build a more connected manufacturing business."}
          </p>
          <form onSubmit={(event) => void submit(event)}>
            {mode === "register" && (
              <>
                <label className="form-field">
                  <span>Your name</span>
                  <div className="auth-input">
                    <UserRound size={17} />
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                      autoComplete="name"
                    />
                  </div>
                </label>
                <label className="form-field">
                  <span>Company name</span>
                  <div className="auth-input">
                    <Building2 size={17} />
                    <input
                      required
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Your manufacturing company"
                      autoComplete="organization"
                    />
                  </div>
                </label>
              </>
            )}
            <label className="form-field">
              <span>Work email</span>
              <div className="auth-input">
                <Mail size={17} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="username"
                />
              </div>
            </label>
            <label className="form-field">
              <span>Password{mode === "register" && <small>At least 12 characters</small>}</span>
              <div className="auth-input">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  required
                  minLength={mode === "register" ? 12 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" busy={busy === "form"} disabled={Boolean(busy)} className="auth-submit">
              {mode === "login" ? "Enter your workspace" : "Create workspace"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-separator">
            <span />
            or take a closer look
            <span />
          </div>
          <Button
            variant="secondary"
            className="demo-button"
            onClick={() => void submit(undefined, true)}
            busy={busy === "demo"}
            disabled={Boolean(busy)}
          >
            <Sparkles size={17} />
            Explore the demo workspace
            <ArrowUpRight size={16} />
          </Button>
          <p className="auth-mode">
            {mode === "login" ? "New to Forge?" : "Already have a workspace?"}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <div className="auth-bottom">
          <span>Thoughtfully built by Madtech.</span>
          <span>
            <ShieldCheck size={13} />
            Secure by design
          </span>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-visual-top">
          <span>CLARITY AT EVERY STAGE.</span>
          <span>FORGE / 01</span>
        </div>
        <div className="factory-visual">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-orbit orbit-three" />
          <svg className="factory-diagram" viewBox="0 0 700 600" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="front" x1="350" y1="100" x2="350" y2="500">
                <stop stopColor="#24473f" />
                <stop offset="1" stopColor="#142b2e" />
              </linearGradient>
              <linearGradient id="top">
                <stop stopColor="#4d8376" />
                <stop offset="1" stopColor="#264e48" />
              </linearGradient>
              <linearGradient id="side">
                <stop stopColor="#193c36" />
                <stop offset="1" stopColor="#1d303a" />
              </linearGradient>
            </defs>
            <path d="m95 365 250-145 260 150-250 147z" fill="#0e2228" stroke="#3b555b" />
            <path d="m155 321 185-107 200 116-185 107z" fill="url(#top)" stroke="#73968c" />
            <path d="m155 321 200 116v-98L155 223z" fill="url(#front)" stroke="#4e766c" />
            <path d="m355 437 185-107V223L355 330z" fill="url(#side)" stroke="#4e766c" />
            <path d="m155 223 50-29 50 29 45-83 55 24 55-56 50 29 80 86-185 107z" fill="url(#top)" stroke="#7ca798" />
            <path d="m205 194 50 29 45-83 55 24 55-56" stroke="#a0c8b8" />
            <path d="m300 140 55 91 55-67 50 29 80 30M355 231v99" stroke="#507d70" />
            <path d="m192 309 45 26v45l-45-26zm80 47 45 26v45l-45-26z" fill="#142c30" stroke="#6a9381" />
            <path d="m378 339 129-75v31l-129 75z" fill="#73ac91" opacity=".8" />
            <path d="m390 400 40-23v-41l-40 23zm65-38 40-23v-41l-40 23z" fill="#101f28" stroke="#4e766c" />
            <path d="m473 182 27-16v-90l-27 15z" fill="#2f554d" stroke="#688b7f" />
            <path d="m473 91 27-15-20-12-27 15z" fill="#70a28c" />
            <path d="m453 79 20 12v90l-20-23z" fill="#24473f" stroke="#688b7f" />
            <path d="m205 435 55-32 50 29-55 32z" fill="#bc9872" stroke="#d9b894" />
            <path d="m205 435 50 29v39l-50-29z" fill="#9b7958" />
            <path d="m255 464 55-32v39l-55 32z" fill="#6e604c" />
            <path d="m95 365 250 145 260-140M345 510v25" stroke="#45605e" strokeDasharray="4 7" />
            <path d="m118 256 50-30m390 145 40 23m-143 120 48 28" stroke="#70b69c" strokeDasharray="3 6" />
          </svg>
          <div className="visual-callout callout-material">
            <span className="callout-icon">
              <Boxes size={17} />
            </span>
            <div>
              <small>MATERIALS</small>
              <strong>Every unit, accounted for.</strong>
            </div>
            <span className="callout-check">
              <Check size={12} />
            </span>
          </div>
          <div className="visual-callout callout-production">
            <span className="callout-icon">
              <Factory size={17} />
            </span>
            <div>
              <small>PRODUCTION</small>
              <strong>A clearer path to finished.</strong>
            </div>
            <span className="callout-live" />
          </div>
          <div className="visual-coordinate">23.076° N / 72.581° E</div>
        </div>
        <div className="auth-visual-copy">
          <span className="auth-visual-eyebrow">LESS FRICTION. MORE FORWARD.</span>
          <h2>
            Great things are made
            <br />
            when everything <em>connects.</em>
          </h2>
          <p>
            Purchasing. Inventory. Production. Sales.
            <br />
            One considered workspace for the way you work.
          </p>
          <div className="auth-visual-dots">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="auth-visual-bottom">
          <span>DESIGNED FOR THE PEOPLE WHO MAKE.</span>
          <Fingerprint size={24} />
        </div>
      </div>
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="loading-workspace" aria-label="Loading workspace">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-subtitle" />
      <div className="skeleton-metrics">
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
      <div className="skeleton-panels">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

function DetailDialog({ record: r, type, onClose }: { record: any; type: string; onClose: () => void }) {
  const lines = r.lines ?? [];
  const isWork = type === "workorder";
  const fields = [
    { label: "Reference", value: r.code ?? r.sku },
    { label: "Business partner", value: r.supplierName ?? r.customerName ?? r.partyName },
    { label: "Warehouse", value: r.warehouseName },
    { label: "Created", value: r.createdAt ? date(r.createdAt, true) : undefined },
    { label: "Due date", value: r.dueDate ? date(r.dueDate, true) : undefined },
    { label: "Email", value: r.email },
    { label: "Phone", value: r.phone },
    { label: "Address", value: r.address },
    { label: "Unit", value: r.unit },
    { label: "Kind", value: r.kind ? label(r.kind) : undefined },
    { label: "Version", value: r.version },
    { label: "Planned output", value: isWork ? `${number(r.plannedQuantity)} units` : undefined },
  ].filter((f) => f.value !== undefined && f.value !== null && f.value !== "");
  return (
    <Dialog
      title={r.productName ?? r.name ?? r.code ?? "Record details"}
      eyebrow={`${label(type)} DETAILS`}
      onClose={onClose}
      drawer
    >
      <div className="dialog-content detail-content">
        {r.status && <Badge value={r.status} />}
        <div className="detail-fields">
          {fields.map((field) => (
            <div key={field.label}>
              <span>{field.label}</span>
              <strong>{field.value}</strong>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <>
            <h3 className="detail-section-title">
              {type === "bom" ? "Materials per finished unit" : isWork ? "Raw material consumption" : "Line items"}
            </h3>
            <div className="detail-lines">
              {lines.map((line: any, index: number) => (
                <div key={line.id ?? line.itemId ?? index}>
                  <div>
                    <strong>{line.itemName}</strong>
                    <small>
                      {isWork
                        ? `${number(line.issuedQuantity)} ${line.unit} issued · ${number(line.returnedQuantity)} returned`
                        : `${number(line.quantity, 6)} ${line.unit}${line.unitPrice ? ` × ${money(line.unitPrice)}` : ""}`}
                    </small>
                  </div>
                  <strong>
                    {isWork
                      ? `${number(Number(line.issuedQuantity) - Number(line.returnedQuantity))} ${line.unit}`
                      : line.unitPrice
                        ? money(Number(line.quantity) * Number(line.unitPrice))
                        : `${number(line.quantity, 6)} ${line.unit}`}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
        {isWork && (
          <div className="cost-breakdown">
            <h3>Production costing</h3>
            <div>
              <span>Accepted output</span>
              <strong>{number(r.goodQuantity)} units</strong>
            </div>
            <div>
              <span>Rejected output</span>
              <strong>{number(r.rejectedQuantity)} units</strong>
            </div>
            <div>
              <span>Consumed material</span>
              <strong>{money(r.materialCost)}</strong>
            </div>
            <div>
              <span>Labour cost</span>
              <strong>{money(r.labourCost)}</strong>
            </div>
            <div className="cost-total">
              <span>Cost per accepted unit</span>
              <strong>{money(r.unitCost)}</strong>
            </div>
            <small>Recorded operational cost; excludes overhead and tax.</small>
          </div>
        )}
        {r.total !== undefined && (
          <div className="detail-total">
            <span>Document total</span>
            <strong>{money(r.total)}</strong>
          </div>
        )}
        {r.balance !== undefined && (
          <>
            <div className="summary-row">
              <span>Paid / collected</span>
              <strong>{money(r.paid)}</strong>
            </div>
            <div className="summary-row">
              <span>Remaining balance</span>
              <strong>{money(r.balance)}</strong>
            </div>
          </>
        )}
        {r.unitCost !== undefined && !isWork && (
          <div className="summary-row">
            <span>Standard unit cost</span>
            <strong>{money(r.unitCost)}</strong>
          </div>
        )}
        {r.sellingPrice !== undefined && (
          <div className="summary-row">
            <span>Selling price</span>
            <strong>{money(r.sellingPrice)}</strong>
          </div>
        )}
        <div className="detail-assurance">
          <ShieldCheck size={15} />
          Saved in your company’s workspace
        </div>
      </div>
      <footer className="dialog-footer">
        <Button variant="secondary" onClick={onClose}>
          Close details
        </Button>
      </footer>
    </Dialog>
  );
}

function CommandPalette({
  w,
  navigate,
  openAction,
  detail,
  can,
  onClose,
}: {
  w: Workspace | null;
  navigate: (page: Page) => void;
  openAction: (action: Action) => void;
  detail: (record: any, type: string) => void;
  can: (action: string) => boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const records = w
    ? [
        ...w.purchaseOrders.map((record) => ({
          record,
          type: "purchase",
          title: `${record.code} · ${record.supplierName}`,
        })),
        ...w.salesOrders.map((record) => ({ record, type: "sale", title: `${record.code} · ${record.customerName}` })),
        ...w.workOrders.map((record) => ({
          record,
          type: "workorder",
          title: `${record.code} · ${record.productName}`,
        })),
        ...w.items.map((record) => ({ record, type: "item", title: `${record.sku} · ${record.name}` })),
      ]
        .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 7)
    : [];
  return (
    <Dialog title="Find your next move" eyebrow="COMMAND CENTRE · CTRL / ⌘ K" onClose={onClose}>
      <div className="command-content">
        <SearchField value={query} onChange={setQuery} placeholder="Find a page, item, or order…" />
        <span className="command-section-label">GO TO</span>
        {navigation
          .filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
          .map((n) => (
            <button className="command-result" key={n.id} onClick={() => navigate(n.id)}>
              <n.icon size={17} />
              <span>{n.label}</span>
              <ArrowRight size={14} />
            </button>
          ))}
        {!query && (
          <>
            <span className="command-section-label">QUICK ACTIONS</span>
            {[
              { type: "purchase", label: "Create purchase order" },
              { type: "workorder", label: "Plan production" },
              { type: "sale", label: "Create sales order" },
            ]
              .filter((a) => can(a.type))
              .map((a) => (
                <button
                  className="command-result"
                  key={a.type}
                  onClick={() => {
                    onClose();
                    openAction({ type: a.type });
                  }}
                >
                  <Plus size={17} />
                  <span>{a.label}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </>
        )}
        {query && records.length > 0 && (
          <>
            <span className="command-section-label">WORKSPACE RECORDS</span>
            {records.map((r) => (
              <button className="command-result" key={r.record.id} onClick={() => detail(r.record, r.type)}>
                <Search size={16} />
                <span>
                  {r.title}
                  <small>{label(r.type)}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </>
        )}
        {query && !records.length && !navigation.some((n) => n.label.toLowerCase().includes(query.toLowerCase())) && (
          <Empty title="No matches yet" text="Try an item name, order code, or page name." />
        )}
      </div>
      <div className="command-footer">
        <kbd>ESC</kbd> to close<span>Your whole workspace, a little closer.</span>
      </div>
    </Dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="A more connected way to work" eyebrow="WELCOME TO FORGE" onClose={onClose} wide>
      <div className="dialog-content help-content">
        <p className="form-intro">
          Forge brings three manufacturing workflows into one workspace. Every action saves a real record to PostgreSQL.
        </p>
        <div className="help-steps">
          <div>
            <span>01</span>
            <ShoppingCart size={24} />
            <h3>Procure to pay</h3>
            <p>Create a purchase order, receive the actual quantity, create a supplier bill, and record payment.</p>
          </div>
          <div>
            <span>02</span>
            <Factory size={24} />
            <h3>Plan to produce</h3>
            <p>
              Build a material recipe, plan a work order, issue raw materials, then record finished output and rejects.
            </p>
          </div>
          <div>
            <span>03</span>
            <ShoppingBag size={24} />
            <h3>Order to cash</h3>
            <p>Reserve finished goods with a sales order, dispatch them, create an invoice, and record collection.</p>
          </div>
        </div>
        <div className="help-shortcuts">
          <Command size={18} />
          <div>
            <strong>Find anything with Ctrl + K</strong>
            <span>Jump between pages, find records, and create your next order.</span>
          </div>
        </div>
        <div className="help-limits">
          <ShieldCheck size={18} />
          <div>
            <strong>A professional development foundation</strong>
            <p>
              This version supports single-stage production and operational finance in INR. Tax/GST, payroll, statutory
              accounts, returns, cancellations, transfers, and multi-currency require further implementation before a
              production rollout.
            </p>
            <p>
              Demo records are sample data. Access permissions, stock availability, payment limits, and transaction
              history are checked on the server.
            </p>
          </div>
        </div>
      </div>
      <footer className="dialog-footer">
        <Button onClick={onClose}>
          Let’s get to work
          <ArrowRight size={15} />
        </Button>
      </footer>
    </Dialog>
  );
}
