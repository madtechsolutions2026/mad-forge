import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { api } from "./api";
import type { Member } from "./api";
import type { Session } from "./types";
import { Button, Dialog, Panel, Table } from "./components";
import { date, label } from "./format";

const roles = ["owner", "admin", "purchasing", "warehouse", "production", "finance", "viewer"];
const roleDescriptions: Record<string, string> = {
  owner: "All operations and team ownership",
  admin: "Workspace operations and team management",
  purchasing: "Purchase orders, sales orders, and master data",
  warehouse: "Receive, dispatch, and adjust warehouse stock",
  production: "Material recipes and production work orders",
  finance: "Bills, invoices, collections, payments, and expenses",
  viewer: "View company operations without making changes",
};

export function Team({ session, companyId }: { session: Session; companyId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const role = session.companies.find((c) => c.id === companyId)?.role.toLowerCase() ?? "viewer";
  const manage = role === "owner" || role === "admin";
  const availableRoles = roles.filter((r) => role === "owner" || !["owner", "admin"].includes(r));
  async function load() {
    setLoading(true);
    try {
      const result = await api.members();
      setMembers(result.members);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team members.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [companyId]);
  return (
    <>
      <Panel
        title="The people behind the work"
        subtitle="Company memberships and the access each person needs"
        action={
          manage ? (
            <Button variant="secondary" className="btn-small" onClick={() => setAdding(true)}>
              <Plus size={14} />
              Add member
            </Button>
          ) : (
            <span className="role-chip">View only</span>
          )
        }
        className="team-panel"
      >
        {notice && (
          <div className="team-notice">
            <Check size={13} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss team notice">
              ×
            </button>
          </div>
        )}
        {error ? (
          <div className="team-error">
            {error}
            <Button variant="secondary" className="btn-small" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="team-loading">
            <Loader2 size={17} className="spin" />
            Loading company members
          </div>
        ) : (
          <Table
            rows={members}
            rowKey={(m) => m.id}
            columns={[
              {
                key: "person",
                label: "TEAM MEMBER",
                render: (m) => (
                  <div className="table-identity">
                    <span className="initial-avatar">{m.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>
                        {m.name}
                        {m.id === session.user.id ? <span className="you-chip">You</span> : null}
                      </strong>
                      <small>{m.email}</small>
                    </div>
                  </div>
                ),
              },
              {
                key: "role",
                label: "ROLE / ACCESS",
                render: (m) => (
                  <div className="cell-stack">
                    <span className="team-role-label">{label(m.role)}</span>
                    <small>{roleDescriptions[m.role]}</small>
                  </div>
                ),
              },
              { key: "joined", label: "ADDED", render: (m) => date(m.createdAt, true) },
              {
                key: "manage",
                label: "",
                render: (m) =>
                  manage && (role === "owner" || !["owner", "admin"].includes(m.role)) ? (
                    <RoleControl
                      member={m}
                      roles={availableRoles}
                      onSave={async (next) => {
                        await api.updateRole(m.id, next);
                        await load();
                        setNotice(`${m.name}’s role updated to ${label(next)}.`);
                        if (m.id === session.user.id) location.reload();
                      }}
                    />
                  ) : (
                    <ShieldCheck size={15} className="muted" />
                  ),
              },
            ]}
          />
        )}
      </Panel>
      {adding && (
        <AddMember
          roles={availableRoles}
          onClose={() => setAdding(false)}
          onSave={async (body) => {
            await api.addMember(body);
            await load();
            setNotice(`${body.name} now has access to this workspace.`);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function RoleControl({
  member,
  roles: options,
  onSave,
}: {
  member: Member;
  roles: string[];
  onSave: (role: string) => Promise<void>;
}) {
  const [value, setValue] = useState(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(member.role);
  }, [member.role]);
  return (
    <div className="role-control">
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        disabled={busy}
        aria-label={`Role for ${member.name}`}
      >
        {options.map((role) => (
          <option value={role} key={role}>
            {label(role)}
          </option>
        ))}
      </select>
      {value !== member.role && (
        <Button
          className="btn-small"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to change role.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      )}
      {error && (
        <span className="role-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function AddMember({
  roles: options,
  onClose,
  onSave,
}: {
  roles: string[];
  onClose: () => void;
  onSave: (body: { name: string; email: string; password: string; role: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title="Give your team a clear place to work"
      eyebrow="ADD COMPANY MEMBER"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave({ name, email, password, role });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to add this member.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-content">
          <p className="form-intro">
            Create a company membership with a specific role. Access is available immediately; no invitation email is
            sent.
          </p>
          <div className="form-grid">
            <label className="form-field full">
              <span>Full name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                placeholder="Team member’s name"
              />
            </label>
            <label className="form-field full">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="colleague@company.com"
              />
            </label>
            <label className="form-field full">
              <span>Initial password</span>
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />
              <small>For an existing account, its current password is preserved.</small>
            </label>
            <label className="form-field full">
              <span>Workspace role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {options.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </select>
              <small>{roleDescriptions[role]}</small>
            </label>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            <Users size={15} />
            Add member
            <ArrowRight size={15} />
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
