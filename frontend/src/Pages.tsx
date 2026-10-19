import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Box,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Factory,
  FileCheck2,
  FileText,
  Layers3,
  Leaf,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button, Empty, Metric, Panel, Progress, SearchField, Table, Tabs } from "./components";
import { Team } from "./Team";
import { date, label, money, number, quantityScaled, relative } from "./format";
import type { Action } from "./Forms";
import type { Bill, Document, Entity, Page, Session, Workspace, WorkOrder } from "./types";

export type PageProps = {
  w: Workspace;
  session: Session;
  openAction: (action: Action) => void;
  detail: (record: any, type: string) => void;
  navigate: (page: Page) => void;
  can: (action: string) => boolean;
};
const contains = (record: unknown, query: string) => JSON.stringify(record).toLowerCase().includes(query.toLowerCase());
const isComplete = (status: string) =>
  /complete|received|dispatched|closed/.test(status.toLowerCase()) && !/partial/.test(status.toLowerCase());
const Icon = ({ children, color = "teal" }: { children: ReactNode; color?: string }) => (
  <span className={`entity-icon entity-${color}`}>{children}</span>
);
const Amount = ({ value }: { value: unknown }) => <span className="amount">{money(value)}</span>;
const Code = ({ code, onClick }: { code: string; onClick: () => void }) => (
  <button className="code-link" onClick={onClick}>
    {code}
    <ArrowUpRight size={12} />
  </button>
);

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="page-heading-actions">{children}</div>
    </div>
  );
}

export function Overview(props: PageProps) {
  const { w, session, navigate, openAction, detail, can } = props;
  const [period, setPeriod] = useState(7);
  const revenueData = useMemo(
    () =>
      Array.from({ length: period }, (_, index) => {
        const day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - period + index + 1);
        const total = w.bills
          .filter((b) => b.direction === "receivable" && new Date(b.createdAt).toDateString() === day.toDateString())
          .reduce((s, b) => s + Number(b.total), 0);
        const spend = w.bills
          .filter((b) => b.direction === "payable" && new Date(b.createdAt).toDateString() === day.toDateString())
          .reduce((s, b) => s + Number(b.total), 0);
        return { day, total, spend };
      }),
    [period, w.bills],
  );
  const max = Math.max(1, ...revenueData.flatMap((d) => [d.total, d.spend]));
  const chartTotal = revenueData.reduce((s, d) => s + d.total, 0);
  const materials = w.inventory
    .filter((i) => i.kind === "raw")
    .reduce((s, i) => s + Number(i.onHand) * Number(i.unitCost), 0);
  const finished = w.inventory
    .filter((i) => i.kind === "finished")
    .reduce((s, i) => s + Number(i.onHand) * Number(i.unitCost), 0);
  const inventoryTotal = materials + finished;
  const materialPercent = inventoryTotal ? Math.round((materials / inventoryTotal) * 100) : 0;
  const openOrders = w.purchaseOrders.filter((o) => !isComplete(o.status));
  const currentOrders = [
    ...w.purchaseOrders.map((o) => ({ ...o, type: "Purchase", party: o.supplierName, color: "blue" })),
    ...w.salesOrders.map((o) => ({ ...o, type: "Sale", party: o.customerName, color: "teal" })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = w.workOrders.filter((o) => /progress|active|started/.test(o.status));
  const firstName = session.user.name.split(" ")[0];
  return (
    <>
      <PageHeading
        eyebrow="YOUR OPERATIONS, CONNECTED"
        title={`A clear view, ${firstName}`}
        description="From the first material to the final delivery. Everything in its place."
      >
        <span className="date-pill">
          <CalendarDays size={15} />
          {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <Button onClick={() => openAction({ type: "purchase" })} disabled={!can("purchase")}>
          <Plus size={16} />
          New purchase
        </Button>
      </PageHeading>
      <div className="overview-banner">
        <div className="banner-emblem">
          <Layers3 size={20} />
        </div>
        <div>
          <strong>Your factory, in sync.</strong>
          <span>
            {w.company.name} <i /> {w.warehouses.length} {w.warehouses.length === 1 ? "warehouse" : "warehouses"}{" "}
            connected
          </span>
        </div>
        <div className="banner-right">
          <span className="live-indicator">
            <i />
            Live workspace
          </span>
          <button onClick={() => navigate("workspace")} aria-label="Open workspace">
            <ArrowUpRight size={19} />
          </button>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Invoiced revenue"
          value={money(w.summary.revenue)}
          sub={`${money(w.summary.collected)} collected`}
          icon={<ArrowUpRight size={19} />}
          action={() => navigate("finance")}
        />
        <Metric
          label="Inventory value"
          value={money(w.summary.inventoryValue)}
          sub={`${w.items.length} items across your warehouses`}
          icon={<Boxes size={18} />}
          color="blue"
          action={() => navigate("inventory")}
        />
        <Metric
          label="Active production"
          value={
            <>
              {number(w.summary.activeWorkOrders)}
              <small>work orders</small>
            </>
          }
          sub={`${w.workOrders.filter((o) => isComplete(o.status)).length} orders completed`}
          icon={<Factory size={18} />}
          color="copper"
          action={() => navigate("production")}
        />
        <Metric
          label="Outstanding receivables"
          value={money(w.summary.receivables)}
          sub={`${w.bills.filter((b) => b.direction === "receivable" && Number(b.balance) > 0).length} invoices awaiting collection`}
          icon={<Wallet size={18} />}
          color="violet"
          action={() => navigate("finance")}
        />
      </div>
      <div className="overview-middle">
        <Panel
          title="The business pulse"
          subtitle="Customer invoices and supplier bills, by posting date"
          action={
            <div className="segmented">
              <button className={period === 7 ? "active" : ""} onClick={() => setPeriod(7)}>
                7 days
              </button>
              <button className={period === 30 ? "active" : ""} onClick={() => setPeriod(30)}>
                30 days
              </button>
            </div>
          }
          className="revenue-panel"
        >
          <div className="chart-top">
            <div>
              <span>Invoiced this period</span>
              <strong>{money(chartTotal)}</strong>
            </div>
            <div className="chart-legend">
              <span>
                <i className="teal-dot" />
                Sales
              </span>
              <span>
                <i className="blue-dot" />
                Purchases
              </span>
            </div>
          </div>
          <div className="bar-chart">
            <div className="chart-grid">
              <span>{money(max, true)}</span>
              <span>{money(max / 2, true)}</span>
              <span>₹0</span>
            </div>
            <div className="chart-bars">
              {revenueData.map((point, i) => (
                <div
                  className="bar-group"
                  key={i}
                  title={`${date(point.day.toISOString())}: Sales ${money(point.total)}, purchases ${money(point.spend)}`}
                >
                  <div className="bar-pair">
                    <span
                      className="sales-bar"
                      style={{ height: `${(point.total / max) * 100}%`, minHeight: point.total ? 4 : 0 }}
                    />
                    <span
                      className="purchase-bar"
                      style={{ height: `${(point.spend / max) * 100}%`, minHeight: point.spend ? 4 : 0 }}
                    />
                  </div>
                  <span className="bar-label">
                    {period === 7
                      ? point.day.toLocaleDateString("en-IN", { weekday: "short" })
                      : i % 5 === 0 || i === period - 1
                        ? point.day.getDate()
                        : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-foot">
            <span>
              <span className="tiny-dot" />
              Figures reflect posted invoices and bills
            </span>
            <button onClick={() => navigate("finance")}>
              View finances
              <ArrowRight size={13} />
            </button>
          </div>
        </Panel>
        <Panel
          title="Inventory composition"
          subtitle="Know what’s on your floor"
          action={
            <button className="icon-button" aria-label="View inventory" onClick={() => navigate("inventory")}>
              <ArrowUpRight size={18} />
            </button>
          }
          className="composition-panel"
        >
          <div className="donut-wrap">
            <svg
              viewBox="0 0 180 180"
              className="donut"
              role="img"
              aria-label={`Inventory: ${materialPercent}% raw material by standard value`}
            >
              <circle cx="90" cy="90" r="65" stroke="#edf1f3" strokeWidth="15" fill="none" />
              <circle
                cx="90"
                cy="90"
                r="65"
                stroke="#127c70"
                strokeWidth="15"
                fill="none"
                strokeDasharray={`${materialPercent * 4.084} 408.4`}
                strokeLinecap="round"
                transform="rotate(-90 90 90)"
              />
              <circle
                cx="90"
                cy="90"
                r="65"
                stroke="#a7c5d7"
                strokeWidth="15"
                fill="none"
                strokeDasharray={`${Math.max(0, 100 - materialPercent) * 4.084 - (inventoryTotal ? 5 : 0)} 408.4`}
                strokeDashoffset={-materialPercent * 4.084 - 2}
                transform="rotate(-90 90 90)"
              />
            </svg>
            <div>
              <span>Total stock value</span>
              <strong>{money(inventoryTotal, true)}</strong>
              <small>Standard cost estimate</small>
            </div>
          </div>
          <div className="composition-legend">
            <div>
              <span>
                <i className="teal-dot" />
                Raw materials
              </span>
              <strong>{money(materials)}</strong>
            </div>
            <div>
              <span>
                <i className="blue-dot" />
                Finished goods
              </span>
              <strong>{money(finished)}</strong>
            </div>
          </div>
        </Panel>
      </div>
      <div className="overview-bottom">
        <Panel
          title="Orders in motion"
          subtitle="Your latest purchase and sales activity"
          action={
            <button className="text-button" onClick={() => navigate("procurement")}>
              All orders
              <ArrowRight size={14} />
            </button>
          }
        >
          <Table
            compact
            rows={currentOrders}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "ORDER",
                render: (r) => (
                  <div className="table-identity">
                    <Icon color={r.color}>
                      {r.type === "Purchase" ? <ShoppingCart size={16} /> : <ShoppingBag size={16} />}
                    </Icon>
                    <div>
                      <Code code={r.code} onClick={() => detail(r, r.type === "Purchase" ? "purchase" : "sale")} />
                      <small>{r.type} order</small>
                    </div>
                  </div>
                ),
              },
              { key: "party", label: "PARTNER", render: (r) => r.party },
              { key: "status", label: "STATUS", render: (r) => <Badge value={r.status} /> },
              { key: "total", label: "VALUE", render: (r) => <Amount value={r.total} />, className: "align-right" },
            ]}
          />
        </Panel>
        <Panel
          title="Activity stream"
          subtitle="A trace of every important move"
          action={<span className="live-dot" />}
          className="activity-panel"
        >
          <div className="activity-list">
            {w.activity.slice(0, 4).map((activity, index) => (
              <div className="activity-row" key={activity.id}>
                <span className={`activity-icon activity-${index % 3}`}>
                  {index % 3 === 0 ? (
                    <Check size={13} />
                  ) : index % 3 === 1 ? (
                    <Package size={13} />
                  ) : (
                    <Receipt size={13} />
                  )}
                </span>
                <div>
                  <strong>{activity.description || label(activity.action)}</strong>
                  <small>{relative(activity.createdAt)}</small>
                </div>
              </div>
            ))}
            {!w.activity.length && (
              <Empty title="Your story starts here" text="Changes made in this workspace will appear here." />
            )}
          </div>
          <button className="activity-more" onClick={() => navigate("workspace")}>
            Explore your workspace
            <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
      <div className="next-actions">
        <div className="next-label">
          <Sparkles size={17} />
          <div>
            <strong>Keep things moving</strong>
            <span>Your next operation is one click away.</span>
          </div>
        </div>
        <button onClick={() => openAction({ type: "workorder" })} disabled={!can("workorder")}>
          <Factory size={18} />
          <span>Plan production</span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => openAction({ type: "sale" })} disabled={!can("sale")}>
          <ShoppingBag size={18} />
          <span>Create sales order</span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => navigate("inventory")}>
          <Boxes size={18} />
          <span>Explore inventory</span>
          <ArrowUpRight size={15} />
        </button>
      </div>
      {(w.summary.lowStockCount > 0 || openOrders.length > 0 || active.length > 0) && (
        <div className="workspace-footnote">
          <ShieldCheck size={13} />
          Company-scoped records · Traceable stock movements · Live database
        </div>
      )}
    </>
  );
}

export function Procurement({ w, openAction, detail, can }: PageProps) {
  const [tab, setTab] = useState("orders");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const open = w.purchaseOrders.filter((o) => !isComplete(o.status));
  const total = open.reduce((s, o) => s + Number(o.total), 0);
  const orders = w.purchaseOrders.filter(
    (o) =>
      contains(o, query) &&
      (status === "all" ||
        (status === "open" && !isComplete(o.status)) ||
        (status === "closed" && isComplete(o.status))),
  );
  return (
    <>
      <PageHeading
        eyebrow="PROCURE TO PAY"
        title="Supply, without the guesswork"
        description="Plan purchases, receive materials, and keep every supplier in the loop."
      >
        <Button variant="secondary" onClick={() => openAction({ type: "supplier" })} disabled={!can("supplier")}>
          <Users size={16} />
          Add supplier
        </Button>
        <Button onClick={() => openAction({ type: "purchase" })} disabled={!can("purchase")}>
          <Plus size={16} />
          Purchase order
        </Button>
      </PageHeading>
      <div className="mini-stats">
        <div>
          <Icon color="blue">
            <ShoppingCart size={18} />
          </Icon>
          <span>
            Open orders<strong>{open.length}</strong>
          </span>
        </div>
        <div>
          <Icon>
            <Truck size={18} />
          </Icon>
          <span>
            Full value of open POs<strong>{money(total)}</strong>
          </span>
        </div>
        <div>
          <Icon color="copper">
            <PackageCheck size={18} />
          </Icon>
          <span>
            Goods receipts<strong>{w.receipts.length}</strong>
          </span>
        </div>
        <div>
          <Icon color="violet">
            <Users size={18} />
          </Icon>
          <span>
            Supplier network<strong>{w.suppliers.length}</strong>
          </span>
        </div>
      </div>
      <Panel>
        <div className="table-top">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "orders", label: "Purchase orders", count: w.purchaseOrders.length },
              { id: "receipts", label: "Goods receipts", count: w.receipts.length },
              { id: "suppliers", label: "Suppliers", count: w.suppliers.length },
            ]}
          />
          <div className="table-tools">
            <SearchField value={query} onChange={setQuery} />
            {tab === "orders" && (
              <label className="filter-select">
                <SlidersHorizontal size={14} />
                <select aria-label="Filter order status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="open">Open orders</option>
                  <option value="closed">Received</option>
                </select>
              </label>
            )}
          </div>
        </div>
        {tab === "orders" && (
          <Table
            rows={orders}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "PURCHASE ORDER",
                render: (r) => <Code code={r.code} onClick={() => detail(r, "purchase")} />,
                sort: (r) => r.code,
              },
              {
                key: "supplier",
                label: "SUPPLIER",
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.supplierName}</strong>
                    <small>{r.lines.length} line items</small>
                  </div>
                ),
                sort: (r) => r.supplierName ?? "",
              },
              {
                key: "warehouse",
                label: "DESTINATION",
                render: (r) => (
                  <span className="muted-cell">
                    <MapPin size={13} />
                    {r.warehouseName}
                  </span>
                ),
              },
              { key: "date", label: "CREATED", render: (r) => date(r.createdAt), sort: (r) => r.createdAt },
              { key: "status", label: "STATUS", render: (r) => <Badge value={r.status} /> },
              {
                key: "total",
                label: "ORDER VALUE",
                render: (r) => <Amount value={r.total} />,
                sort: (r) => Number(r.total),
                className: "align-right",
              },
              {
                key: "action",
                label: "",
                render: (r) =>
                  !isComplete(r.status) ? (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "receive", record: r })}
                      disabled={!can("receive")}
                    >
                      Receive
                      <ArrowDownLeft size={13} />
                    </Button>
                  ) : (
                    <span className="table-complete">
                      <CheckCheck size={15} />
                      Received
                    </span>
                  ),
              },
            ]}
            empty={
              <Empty
                title="Start with a purchase order"
                text="Add a supplier and your first material to begin procurement."
                action={
                  <Button onClick={() => openAction({ type: "purchase" })} disabled={!can("purchase")}>
                    <Plus size={15} />
                    Create purchase order
                  </Button>
                }
              />
            }
          />
        )}
        {tab === "receipts" && (
          <Table
            rows={w.receipts.filter((r) => contains(r, query))}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "GOODS RECEIPT",
                render: (r) => <Code code={r.code} onClick={() => detail(r, "receipt")} />,
              },
              { key: "po", label: "PURCHASE ORDER", render: (r) => r.purchaseOrderCode },
              { key: "supplier", label: "SUPPLIER", render: (r) => r.supplierName },
              { key: "date", label: "RECEIVED", render: (r) => date(r.createdAt), sort: (r) => r.createdAt },
              { key: "value", label: "VALUE", render: (r) => <Amount value={r.total} />, className: "align-right" },
              {
                key: "action",
                label: "BILLING",
                render: (r) =>
                  r.billId ? (
                    <Badge value="invoiced">Bill created</Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "bill", record: r })}
                      disabled={!can("bill")}
                    >
                      Create bill
                      <ArrowRight size={13} />
                    </Button>
                  ),
              },
            ]}
          />
        )}
        {tab === "suppliers" && (
          <PartyTable rows={w.suppliers.filter((r) => contains(r, query))} detail={(r) => detail(r, "supplier")} />
        )}
      </Panel>
      <ProcessStrip steps={["Purchase order", "Goods receipt", "Supplier bill", "Payment"]} current={0} />
    </>
  );
}

function PartyTable({ rows, detail }: { rows: Entity[]; detail: (record: any) => void }) {
  return (
    <Table
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        {
          key: "name",
          label: "BUSINESS PARTNER",
          render: (r) => (
            <div className="table-identity">
              <span className="initial-avatar">{r.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <button className="plain-link" onClick={() => detail(r)}>
                  {r.name}
                </button>
                <small>{r.code}</small>
              </div>
            </div>
          ),
          sort: (r) => r.name,
        },
        { key: "email", label: "EMAIL", render: (r) => r.email || "—" },
        { key: "phone", label: "PHONE", render: (r) => r.phone || "—" },
        { key: "address", label: "LOCATION", render: (r) => <span className="truncate-cell">{r.address || "—"}</span> },
        {
          key: "action",
          label: "",
          render: (r) => (
            <button className="icon-button" onClick={() => detail(r)} aria-label={`View ${r.name}`}>
              <ArrowUpRight size={16} />
            </button>
          ),
        },
      ]}
    />
  );
}
function ProcessStrip({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="process-strip">
      <span>ONE CONNECTED FLOW</span>
      <div>
        {steps.map((step, i) => (
          <span className={i === current ? "active" : ""} key={step}>
            <i>{String(i + 1).padStart(2, "0")}</i>
            {step}
            {i < steps.length - 1 && <ChevronRight size={13} />}
          </span>
        ))}
      </div>
      <ShieldCheck size={16} />
    </div>
  );
}

export function Inventory({ w, openAction, detail, can }: PageProps) {
  const [tab, setTab] = useState("stock");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const lowItemIds = new Set(
    w.items
      .filter(
        (item) =>
          w.inventory
            .filter((stock) => stock.itemId === item.id)
            .reduce((sum, stock) => sum + quantityScaled(stock.available), 0n) < quantityScaled(item.reorderLevel),
      )
      .map((item) => item.id),
  );
  const stocks = w.inventory.filter(
    (r) =>
      contains(r, query) &&
      (kind === "all" || kind === "low" ? kind !== "low" || lowItemIds.has(r.itemId) : r.kind === kind),
  );
  return (
    <>
      <PageHeading
        eyebrow="MATERIAL INTELLIGENCE"
        title="Everything, accounted for"
        description="Know what you have, where it is, and what’s ready for the next move."
      >
        <Button variant="secondary" onClick={() => openAction({ type: "adjustment" })} disabled={!can("adjustment")}>
          <SlidersHorizontal size={15} />
          Adjust stock
        </Button>
        <Button onClick={() => openAction({ type: "item" })} disabled={!can("item")}>
          <Plus size={16} />
          New item
        </Button>
      </PageHeading>
      <div className="inventory-top">
        <div className="inventory-value-card">
          <span className="eyebrow">ON YOUR FACTORY FLOOR</span>
          <strong>{money(w.summary.inventoryValue)}</strong>
          <span>Indicative stock value at standard item cost</span>
          <Boxes size={76} />
        </div>
        <div className="stock-counter">
          <Package size={21} />
          <strong>{w.items.filter((i) => i.kind === "raw").length}</strong>
          <span>Raw materials</span>
        </div>
        <div className="stock-counter">
          <Box size={21} />
          <strong>{w.items.filter((i) => i.kind === "finished").length}</strong>
          <span>Finished products</span>
        </div>
        <button
          className="stock-counter low-stock-counter"
          onClick={() => {
            setTab("stock");
            setKind(kind === "low" ? "all" : "low");
          }}
        >
          <Activity size={21} />
          <strong>{w.summary.lowStockCount}</strong>
          <span>
            Below company reorder level
            <ArrowRight size={12} />
          </span>
        </button>
      </div>
      <Panel>
        <div className="table-top">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "stock", label: "Stock overview", count: w.inventory.length },
              { id: "items", label: "Item master", count: w.items.length },
              { id: "ledger", label: "Movement ledger" },
              { id: "warehouses", label: "Warehouses", count: w.warehouses.length },
            ]}
          />
          <div className="table-tools">
            <SearchField value={query} onChange={setQuery} placeholder="Find an item or warehouse…" />
            {tab === "stock" && (
              <label className="filter-select">
                <Layers3 size={14} />
                <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter stock type">
                  <option value="all">All items</option>
                  <option value="raw">Raw materials</option>
                  <option value="finished">Finished goods</option>
                  <option value="low">Low stock</option>
                </select>
              </label>
            )}
            {tab === "warehouses" && (
              <Button
                variant="secondary"
                className="btn-small"
                onClick={() => openAction({ type: "warehouse" })}
                disabled={!can("warehouse")}
              >
                <Plus size={14} />
                Add warehouse
              </Button>
            )}
          </div>
        </div>
        {tab === "stock" && (
          <Table
            rows={stocks}
            rowKey={(r) => `${r.itemId}-${r.warehouseId}`}
            columns={[
              {
                key: "item",
                label: "ITEM",
                render: (r) => (
                  <div className="table-identity">
                    <Icon color={r.kind === "raw" ? "teal" : "blue"}>
                      {r.kind === "raw" ? <Leaf size={18} /> : <Package size={18} />}
                    </Icon>
                    <div>
                      <strong>{r.itemName}</strong>
                      <small>
                        {r.sku} · {r.kind === "raw" ? "Raw material" : "Finished product"}
                      </small>
                    </div>
                  </div>
                ),
                sort: (r) => r.itemName,
              },
              { key: "warehouse", label: "WAREHOUSE", render: (r) => r.warehouseName },
              {
                key: "stock",
                label: "ON HAND",
                render: (r) => (
                  <span className="stock-number">
                    {number(r.onHand)}
                    <small>{r.unit}</small>
                  </span>
                ),
                sort: (r) => Number(r.onHand),
                className: "align-right",
              },
              {
                key: "reserved",
                label: "RESERVED",
                render: (r) => (
                  <span className="stock-number muted">
                    {number(r.reserved)}
                    <small>{r.unit}</small>
                  </span>
                ),
                className: "align-right",
              },
              {
                key: "available",
                label: "AVAILABLE",
                render: (r) => (
                  <div className="available-cell">
                    <strong>
                      {number(r.available)} <small>{r.unit}</small>
                    </strong>
                    <Progress
                      value={
                        Number(r.reorderLevel) > 0
                          ? (Number(r.available) / (Number(r.reorderLevel) * 3)) * 100
                          : Number(r.available)
                            ? 100
                            : 0
                      }
                      color={lowItemIds.has(r.itemId) ? "copper" : "teal"}
                    />
                  </div>
                ),
              },
              {
                key: "status",
                label: "STOCK HEALTH",
                render: (r) =>
                  lowItemIds.has(r.itemId) ? (
                    <Badge value="low">Company stock low</Badge>
                  ) : (
                    <Badge value="received">Healthy stock</Badge>
                  ),
              },
            ]}
          />
        )}
        {tab === "items" && (
          <Table
            rows={w.items.filter((r) => contains(r, query))}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "name",
                label: "ITEM",
                render: (r) => (
                  <div className="cell-stack">
                    <button className="plain-link" onClick={() => detail(r, "item")}>
                      {r.name}
                    </button>
                    <small>{r.sku}</small>
                  </div>
                ),
                sort: (r) => r.name,
              },
              {
                key: "kind",
                label: "TYPE",
                render: (r) => (
                  <span className={`kind-chip ${r.kind}`}>
                    {r.kind === "raw" ? "Raw material" : "Finished product"}
                  </span>
                ),
              },
              { key: "unit", label: "BASE UNIT", render: (r) => r.unit },
              {
                key: "reorder",
                label: "REORDER LEVEL",
                render: (r) => `${number(r.reorderLevel)} ${r.unit}`,
                className: "align-right",
              },
              {
                key: "cost",
                label: "STANDARD COST",
                render: (r) => <Amount value={r.unitCost} />,
                className: "align-right",
              },
              {
                key: "price",
                label: "SELLING PRICE",
                render: (r) => <Amount value={r.sellingPrice} />,
                className: "align-right",
              },
            ]}
          />
        )}
        {tab === "ledger" && (
          <Table
            rows={w.stockLedger.filter((r) => contains(r, query))}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "date",
                label: "POSTED",
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{date(r.createdAt)}</strong>
                    <small>
                      {new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </small>
                  </div>
                ),
                sort: (r) => r.createdAt,
              },
              {
                key: "item",
                label: "ITEM / WAREHOUSE",
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.itemName}</strong>
                    <small>{r.warehouseName}</small>
                  </div>
                ),
              },
              {
                key: "type",
                label: "MOVEMENT",
                render: (r) => (
                  <span className={`movement ${Number(r.quantity) > 0 ? "positive" : "negative"}`}>
                    {Number(r.quantity) > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    {label(r.movement)}
                  </span>
                ),
              },
              {
                key: "reference",
                label: "REFERENCE",
                render: (r) => <span className="monospace">{r.referenceCode || "—"}</span>,
              },
              {
                key: "quantity",
                label: "QUANTITY CHANGE",
                render: (r) => (
                  <strong className={Number(r.quantity) > 0 ? "text-teal" : "text-copper"}>
                    {Number(r.quantity) > 0 ? "+" : ""}
                    {number(r.quantity)} {w.items.find((i) => i.id === r.itemId)?.unit}
                  </strong>
                ),
                className: "align-right",
              },
              { key: "note", label: "NOTE", render: (r) => <span className="truncate-cell">{r.note || "—"}</span> },
            ]}
          />
        )}
        {tab === "warehouses" && (
          <div className="warehouse-grid">
            {w.warehouses.map((warehouse) => (
              <div className="warehouse-card" key={warehouse.id}>
                <span className="warehouse-icon">
                  <Building2 size={25} />
                </span>
                <div>
                  <span className="eyebrow">{warehouse.code}</span>
                  <h3>{warehouse.name}</h3>
                  <p>
                    {w.inventory.filter((s) => s.warehouseId === warehouse.id && Number(s.onHand) > 0).length} items in
                    stock
                  </p>
                </div>
                <ShieldCheck size={17} />
              </div>
            ))}
            {!w.warehouses.length && (
              <Empty
                title="Give your stock a home"
                text="Create your first warehouse to receive and store materials."
              />
            )}
          </div>
        )}
      </Panel>
      <div className="info-inline">
        <ShieldCheck size={15} />
        <span>
          Every posted movement is recorded in the stock ledger. Reserved quantities stay unavailable for other orders.
        </span>
      </div>
    </>
  );
}

export function Production({ w, openAction, detail, can }: PageProps) {
  const [tab, setTab] = useState("orders");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const draft = w.workOrders.filter((o) => o.status === "draft");
  const active = w.workOrders.filter((o) => /progress|active|started/.test(o.status));
  const complete = w.workOrders.filter((o) => isComplete(o.status));
  const statuses = [
    {
      id: "all",
      label: "All work orders",
      count: w.workOrders.length,
      icon: <Layers3 size={19} />,
      desc: "Your complete production picture",
    },
    {
      id: "draft",
      label: "Planned",
      count: draft.length,
      icon: <CalendarDays size={19} />,
      desc: "Ready for material release",
    },
    {
      id: "active",
      label: "On the floor",
      count: active.length,
      icon: <Factory size={19} />,
      desc: "Materials issued, work in motion",
    },
    {
      id: "completed",
      label: "Completed",
      count: complete.length,
      icon: <CheckCheck size={19} />,
      desc: "Finished and added to stock",
    },
  ];
  const orders = w.workOrders.filter(
    (o) =>
      contains(o, query) &&
      (filter === "all" ||
        (filter === "draft" && o.status === "draft") ||
        (filter === "active" && /progress|active|started/.test(o.status)) ||
        (filter === "completed" && isComplete(o.status))),
  );
  return (
    <>
      <PageHeading
        eyebrow="PLAN TO PRODUCE"
        title="Make every run count"
        description="Turn material recipes into traceable production, with clear output and costs."
      >
        <Button variant="secondary" onClick={() => openAction({ type: "bom" })} disabled={!can("bom")}>
          <Layers3 size={16} />
          New material recipe
        </Button>
        <Button onClick={() => openAction({ type: "workorder" })} disabled={!can("workorder")}>
          <Plus size={16} />
          Plan production
        </Button>
      </PageHeading>
      <div className="production-statuses">
        {statuses.map((s, i) => (
          <button
            key={s.id}
            className={filter === s.id ? "selected" : ""}
            onClick={() => {
              setFilter(s.id);
              setTab("orders");
            }}
          >
            <span className={`production-status-icon production-status-${i}`}>{s.icon}</span>
            <div>
              <span>{s.label}</span>
              <strong>{s.count}</strong>
              <small>{s.desc}</small>
            </div>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <Panel>
        <div className="table-top">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "orders", label: "Work orders", count: w.workOrders.length },
              { id: "boms", label: "Bills of materials", count: w.boms.length },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="Search production…" />
        </div>
        {tab === "orders" && (
          <Table
            rows={orders}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "WORK ORDER",
                render: (r) => (
                  <div className="cell-stack">
                    <Code code={r.code} onClick={() => detail(r, "workorder")} />
                    <small>{date(r.createdAt)}</small>
                  </div>
                ),
                sort: (r) => r.code,
              },
              {
                key: "product",
                label: "PRODUCT",
                render: (r) => (
                  <div className="table-identity">
                    <Icon color="copper">
                      <Factory size={17} />
                    </Icon>
                    <div>
                      <strong>{r.productName}</strong>
                      <small>{r.warehouseName}</small>
                    </div>
                  </div>
                ),
              },
              {
                key: "planned",
                label: "PLANNED",
                render: (r) => (
                  <strong>
                    {number(r.plannedQuantity)} <span className="unit">units</span>
                  </strong>
                ),
                className: "align-right",
              },
              {
                key: "output",
                label: "ACCEPTED OUTPUT",
                render: (r) =>
                  isComplete(r.status) ? (
                    <div className="cell-stack align-right">
                      <strong className="text-teal">{number(r.goodQuantity)} units</strong>
                      <small>{number(r.rejectedQuantity)} rejected</small>
                    </div>
                  ) : (
                    <span className="muted">Awaiting completion</span>
                  ),
                className: "align-right",
              },
              { key: "status", label: "STATUS", render: (r) => <Badge value={r.status} /> },
              {
                key: "action",
                label: "NEXT STEP",
                render: (r) =>
                  r.status === "draft" ? (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "start", record: r })}
                      disabled={!can("start")}
                    >
                      Release
                      <ArrowRight size={13} />
                    </Button>
                  ) : !isComplete(r.status) ? (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "complete", record: r })}
                      disabled={!can("complete")}
                    >
                      Complete
                      <Check size={13} />
                    </Button>
                  ) : (
                    <button className="text-button" onClick={() => detail(r, "workorder")}>
                      View costing
                      <ArrowUpRight size={13} />
                    </button>
                  ),
              },
            ]}
          />
        )}
        {tab === "boms" && (
          <div className="bom-grid">
            {w.boms
              .filter((b) => contains(b, query))
              .map((bom) => (
                <button className="bom-card" key={bom.id} onClick={() => detail(bom, "bom")}>
                  <div className="bom-card-top">
                    <Icon>
                      <Layers3 size={20} />
                    </Icon>
                    <span className="version-chip">Version {bom.version}</span>
                  </div>
                  <span className="eyebrow">{bom.code}</span>
                  <h3>{bom.productName}</h3>
                  <p>{bom.name}</p>
                  <div className="bom-materials">
                    {bom.lines.slice(0, 3).map((line: any) => (
                      <div key={line.itemId}>
                        <span>{line.itemName}</span>
                        <strong>
                          {number(line.quantity, 6)} {line.unit}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="bom-card-bottom">
                    <span>Per finished unit</span>
                    <ArrowUpRight size={17} />
                  </div>
                </button>
              ))}
            {!w.boms.length && (
              <Empty
                title="Start with a recipe"
                text="Define the raw material needed to make one finished unit."
                action={
                  <Button onClick={() => openAction({ type: "bom" })} disabled={!can("bom")}>
                    <Plus size={15} />
                    Create a bill of materials
                  </Button>
                }
              />
            )}
          </div>
        )}
      </Panel>
      <ProcessStrip steps={["Material recipe", "Plan work order", "Issue materials", "Complete output"]} current={2} />
    </>
  );
}

export function Sales({ w, openAction, detail, can }: PageProps) {
  const [tab, setTab] = useState("orders");
  const [query, setQuery] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="ORDER TO CASH"
        title="From your floor to their door"
        description="Reserve finished stock, coordinate dispatches, and turn orders into invoices."
      >
        <Button variant="secondary" onClick={() => openAction({ type: "customer" })} disabled={!can("customer")}>
          <Users size={16} />
          Add customer
        </Button>
        <Button onClick={() => openAction({ type: "sale" })} disabled={!can("sale")}>
          <Plus size={16} />
          Sales order
        </Button>
      </PageHeading>
      <div className="mini-stats">
        <div>
          <Icon>
            <ShoppingBag size={18} />
          </Icon>
          <span>
            Open sales orders<strong>{w.summary.openSales}</strong>
          </span>
        </div>
        <div>
          <Icon color="blue">
            <Truck size={18} />
          </Icon>
          <span>
            Dispatches posted<strong>{w.dispatches.length}</strong>
          </span>
        </div>
        <div>
          <Icon color="copper">
            <FileCheck2 size={18} />
          </Icon>
          <span>
            Invoiced revenue<strong>{money(w.summary.revenue)}</strong>
          </span>
        </div>
        <div>
          <Icon color="violet">
            <Users size={18} />
          </Icon>
          <span>
            Customer network<strong>{w.customers.length}</strong>
          </span>
        </div>
      </div>
      <Panel>
        <div className="table-top">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "orders", label: "Sales orders", count: w.salesOrders.length },
              { id: "dispatches", label: "Dispatches", count: w.dispatches.length },
              { id: "customers", label: "Customers", count: w.customers.length },
            ]}
          />
          <SearchField value={query} onChange={setQuery} />
        </div>
        {tab === "orders" && (
          <Table
            rows={w.salesOrders.filter((o) => contains(o, query))}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "SALES ORDER",
                render: (r) => <Code code={r.code} onClick={() => detail(r, "sale")} />,
                sort: (r) => r.code,
              },
              {
                key: "customer",
                label: "CUSTOMER",
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.customerName}</strong>
                    <small>
                      {r.lines.length} line items · {r.warehouseName}
                    </small>
                  </div>
                ),
              },
              { key: "date", label: "CREATED", render: (r) => date(r.createdAt), sort: (r) => r.createdAt },
              { key: "status", label: "STATUS", render: (r) => <Badge value={r.status} /> },
              {
                key: "total",
                label: "ORDER VALUE",
                render: (r) => <Amount value={r.total} />,
                className: "align-right",
              },
              {
                key: "action",
                label: "NEXT STEP",
                render: (r) =>
                  !isComplete(r.status) ? (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "dispatch", record: r })}
                      disabled={!can("dispatch")}
                    >
                      Dispatch
                      <Truck size={14} />
                    </Button>
                  ) : (
                    <span className="table-complete">
                      <CheckCheck size={15} />
                      Dispatched
                    </span>
                  ),
              },
            ]}
          />
        )}
        {tab === "dispatches" && (
          <Table
            rows={w.dispatches.filter((o) => contains(o, query))}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: "DISPATCH",
                render: (r) => <Code code={r.code} onClick={() => detail(r, "dispatch")} />,
              },
              { key: "so", label: "SALES ORDER", render: (r) => r.salesOrderCode },
              { key: "customer", label: "CUSTOMER", render: (r) => r.customerName },
              { key: "date", label: "DISPATCHED", render: (r) => date(r.createdAt) },
              { key: "total", label: "VALUE", render: (r) => <Amount value={r.total} />, className: "align-right" },
              {
                key: "action",
                label: "INVOICING",
                render: (r) =>
                  r.invoiceId ? (
                    <Badge value="invoiced">Invoiced</Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "invoice", record: r })}
                      disabled={!can("invoice")}
                    >
                      Create invoice
                      <ArrowRight size={13} />
                    </Button>
                  ),
              },
            ]}
          />
        )}
        {tab === "customers" && (
          <PartyTable rows={w.customers.filter((r) => contains(r, query))} detail={(r) => detail(r, "customer")} />
        )}
      </Panel>
      <ProcessStrip
        steps={["Sales order + reserve", "Dispatch goods", "Customer invoice", "Collect payment"]}
        current={1}
      />
    </>
  );
}

export function Finance({ w, openAction, detail, can }: PageProps) {
  const [tab, setTab] = useState("receivables");
  const [query, setQuery] = useState("");
  const bills = w.bills.filter(
    (b) => b.direction === (tab === "payables" ? "payable" : "receivable") && contains(b, query),
  );
  return (
    <>
      <PageHeading
        eyebrow="MONEY, MADE VISIBLE"
        title="Stay ahead of every balance"
        description="Follow your receivables, supplier dues, payments, and everyday expenses."
      >
        <Button variant="secondary" onClick={() => openAction({ type: "expense" })} disabled={!can("expense")}>
          <Receipt size={16} />
          Add expense
        </Button>
        <Button onClick={() => openAction({ type: "payment" })} disabled={!can("payment")}>
          <Plus size={16} />
          Record payment
        </Button>
      </PageHeading>
      <div className="metrics-grid">
        <Metric
          label="Receivables"
          value={money(w.summary.receivables)}
          sub="Money customers owe you"
          icon={<ArrowDownLeft size={18} />}
          action={() => setTab("receivables")}
        />
        <Metric
          label="Payables"
          value={money(w.summary.payables)}
          sub="Outstanding supplier balances"
          icon={<ArrowUpRight size={18} />}
          color="copper"
          action={() => setTab("payables")}
        />
        <Metric
          label="Customer collections"
          value={money(w.summary.collected)}
          sub="Recorded against customer invoices"
          icon={<Wallet size={18} />}
          color="blue"
          action={() => setTab("payments")}
        />
        <Metric
          label="Operating expenses"
          value={money(w.summary.expenses)}
          sub={`${w.expenses.length} expense records`}
          icon={<Receipt size={18} />}
          color="violet"
          action={() => setTab("expenses")}
        />
      </div>
      <Panel>
        <div className="table-top">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              {
                id: "receivables",
                label: "Receivables",
                count: w.bills.filter((b) => b.direction === "receivable").length,
              },
              { id: "payables", label: "Payables", count: w.bills.filter((b) => b.direction === "payable").length },
              { id: "payments", label: "Payments" },
              { id: "expenses", label: "Expenses" },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="Search transactions…" />
        </div>
        {["receivables", "payables"].includes(tab) && (
          <Table
            rows={bills}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "code",
                label: tab === "payables" ? "SUPPLIER BILL" : "CUSTOMER INVOICE",
                render: (r) => (
                  <div className="cell-stack">
                    <Code code={r.code} onClick={() => detail(r, "bill")} />
                    <small>From {r.sourceCode}</small>
                  </div>
                ),
                sort: (r) => r.code,
              },
              {
                key: "party",
                label: tab === "payables" ? "SUPPLIER" : "CUSTOMER",
                render: (r) => <strong>{r.partyName}</strong>,
              },
              { key: "due", label: "DUE DATE", render: (r) => date(r.dueDate), sort: (r) => r.dueDate },
              { key: "total", label: "TOTAL", render: (r) => money(r.total), className: "align-right" },
              {
                key: "balance",
                label: "BALANCE",
                render: (r) => <strong className={Number(r.balance) > 0 ? "" : "text-teal"}>{money(r.balance)}</strong>,
                className: "align-right",
              },
              { key: "status", label: "STATUS", render: (r) => <Badge value={r.status} /> },
              {
                key: "action",
                label: "",
                render: (r) =>
                  Number(r.balance) > 0 ? (
                    <Button
                      variant="secondary"
                      className="btn-small"
                      onClick={() => openAction({ type: "payment", record: r })}
                      disabled={!can("payment")}
                    >
                      {tab === "payables" ? "Pay bill" : "Collect"}
                      <ArrowRight size={13} />
                    </Button>
                  ) : (
                    <CheckCheck size={17} className="text-teal" />
                  ),
              },
            ]}
          />
        )}
        {tab === "payments" && (
          <Table
            rows={w.payments.filter((r) => contains(r, query))}
            rowKey={(r) => r.id}
            columns={[
              { key: "code", label: "PAYMENT", render: (r) => <span className="monospace">{r.code}</span> },
              {
                key: "party",
                label: "PARTY / DOCUMENT",
                render: (r) => (
                  <div className="cell-stack">
                    <strong>{r.partyName}</strong>
                    <small>{r.billCode}</small>
                  </div>
                ),
              },
              {
                key: "direction",
                label: "DIRECTION",
                render: (r) => (
                  <span className={`movement ${r.direction === "receivable" ? "positive" : "negative"}`}>
                    {r.direction === "receivable" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    {r.direction === "receivable" ? "Collection" : "Supplier payment"}
                  </span>
                ),
              },
              {
                key: "method",
                label: "METHOD",
                render: (r) => <span className="method-chip">{r.method === "upi" ? "UPI" : label(r.method)}</span>,
              },
              { key: "date", label: "POSTED", render: (r) => date(r.createdAt), sort: (r) => r.createdAt },
              { key: "amount", label: "AMOUNT", render: (r) => <Amount value={r.amount} />, className: "align-right" },
            ]}
          />
        )}
        {tab === "expenses" && (
          <Table
            rows={w.expenses.filter((r) => contains(r, query))}
            rowKey={(r) => r.id}
            columns={[
              { key: "code", label: "EXPENSE", render: (r) => <span className="monospace">{r.code}</span> },
              { key: "description", label: "DESCRIPTION", render: (r) => <strong>{r.description}</strong> },
              { key: "category", label: "CATEGORY", render: (r) => <span className="method-chip">{r.category}</span> },
              { key: "date", label: "DATE", render: (r) => date(r.expenseDate), sort: (r) => r.expenseDate },
              { key: "amount", label: "AMOUNT", render: (r) => <Amount value={r.amount} />, className: "align-right" },
            ]}
          />
        )}
      </Panel>
      <div className="info-inline">
        <CircleDollarSign size={16} />
        <span>
          Operational finance view. Figures exclude tax calculations, payroll, and statutory accounting. Inventory
          values are standard-cost estimates.
        </span>
      </div>
    </>
  );
}

export function WorkspacePage({ w, session, openAction, can }: PageProps) {
  const membership = session.companies.find((c) => c.id === w.company.id);
  return (
    <>
      <PageHeading
        eyebrow="THE FOUNDATION"
        title="Built around your business"
        description="Your company, your workspace, and a clear record of every operation."
      />
      <div className="workspace-layout">
        <Panel title="Company profile" subtitle="The home for your manufacturing operations">
          <div className="company-profile">
            <div className="company-avatar">
              <Building2 size={35} />
            </div>
            <h3>{w.company.name}</h3>
            <span className="role-chip">Manufacturing workspace</span>
            <div className="profile-fields">
              <div>
                <span>COMPANY NAME</span>
                <strong>{w.company.name}</strong>
              </div>
              <div>
                <span>ADDRESS</span>
                <strong>{w.company.address || "Not provided"}</strong>
              </div>
              <div>
                <span>PHONE</span>
                <strong>{w.company.phone || "Not provided"}</strong>
              </div>
              <div>
                <span>BASE CURRENCY</span>
                <strong>INR · Indian Rupee</strong>
              </div>
              <div>
                <span>COMPANY ID</span>
                <strong className="monospace tiny">{w.company.id}</strong>
              </div>
            </div>
          </div>
        </Panel>
        <div className="workspace-side">
          <Panel title="Your access" subtitle="Company-scoped and session-protected">
            <div className="access-user">
              <span className="initial-avatar">{session.user.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{session.user.name}</strong>
                <span>{session.user.email}</span>
              </div>
              <span className="role-chip">{label(membership?.role ?? "member")}</span>
            </div>
            <div className="access-note">
              <ShieldCheck size={18} />
              <p>
                Your account only accesses companies it belongs to. Every stock operation is checked and recorded on the
                server.
              </p>
            </div>
          </Panel>
          <Panel title="Workspace essentials" subtitle="Keep the building blocks organised">
            <div className="essentials">
              {[
                { name: "Warehouses", count: w.warehouses.length, type: "warehouse", icon: <Building2 size={18} /> },
                { name: "Suppliers", count: w.suppliers.length, type: "supplier", icon: <Truck size={18} /> },
                { name: "Customers", count: w.customers.length, type: "customer", icon: <Users size={18} /> },
                { name: "Items", count: w.items.length, type: "item", icon: <Package size={18} /> },
              ].map((item) => (
                <div key={item.type}>
                  <Icon>{item.icon}</Icon>
                  <span>
                    {item.name}
                    <small>{item.count} records</small>
                  </span>
                  <button
                    className="icon-button"
                    onClick={() => openAction({ type: item.type })}
                    disabled={!can(item.type)}
                    aria-label={`Add ${item.type}`}
                  >
                    <Plus size={17} />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <Team session={session} companyId={w.company.id} />
      <Panel title="Workspace audit trail" subtitle="A chronological record of changes in your company">
        <Table
          rows={w.activity}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "event",
              label: "EVENT",
              render: (r) => (
                <div className="table-identity">
                  <Icon>
                    <Activity size={16} />
                  </Icon>
                  <div>
                    <strong>{r.description || label(r.action)}</strong>
                    <small>{label(r.entityType)}</small>
                  </div>
                </div>
              ),
            },
            { key: "action", label: "ACTION", render: (r) => <span className="method-chip">{label(r.action)}</span> },
            {
              key: "date",
              label: "RECORDED",
              render: (r) => (
                <div className="cell-stack">
                  <strong>{date(r.createdAt, true)}</strong>
                  <small>
                    {new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </small>
                </div>
              ),
              sort: (r) => r.createdAt,
            },
          ]}
        />
      </Panel>
    </>
  );
}
