import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  FileText,
  MapPin,
  Package,
  Plus,
  Printer,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { Badge, Button, Empty } from "./components";
import { date, number, quantitySubtract, today } from "./format";
import { downloadPurchaseCsv, inr, lineValue, orderValue } from "./purchase-export";
import type { Document, Workspace } from "./types";
import "./purchase-order.css";

type DraftLine = { key: string; itemId: string; quantity: string; unitPrice: string };
type Props = {
  w: Workspace;
  order?: Document;
  isNew: boolean;
  canCreate: boolean;
  canReceive: boolean;
  onBack: () => void;
  onNew: () => void;
  onReceive: (order: Document) => void;
  onSave: (body: unknown, key: string) => Promise<void>;
};
export function PurchaseOrderPage(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [props.isNew, props.order?.id]);
  return (
    <section className="po-page">
      <nav className="po-breadcrumb" aria-label="Purchase order breadcrumb">
        <button onClick={props.onBack}>
          <ArrowLeft size={15} />
          Procurement
        </button>
        <span>/</span>
        <span>{props.isNew ? "New purchase order" : props.order?.code || "Purchase order"}</span>
      </nav>
      {props.isNew ? (
        <>
          <div className="po-heading">
            <div>
              <span className="eyebrow">PROCURE TO PAY / CREATE</span>
              <h1 ref={heading} tabIndex={-1}>
                New purchase order
              </h1>
              <p>A considered purchase. Every detail in one place.</p>
            </div>
            <span className="po-draft-tag">
              <FileText size={15} />
              Unsaved order
            </span>
          </div>
          {props.canCreate ? (
            <PurchaseEditor {...props} />
          ) : (
            <Empty
              title="Purchasing access required"
              text="Your role can view orders but cannot create them."
              action={<Button onClick={props.onBack}>Back to procurement</Button>}
            />
          )}
        </>
      ) : props.order ? (
        <PurchaseDetail {...props} order={props.order} heading={heading} />
      ) : (
        <Empty
          title="Purchase order unavailable"
          text="This order does not exist in the selected company workspace."
          action={<Button onClick={props.onBack}>Back to procurement</Button>}
        />
      )}
    </section>
  );
}
function PurchaseEditor({ w, onBack, onSave }: Props) {
  const first = w.items.find((i) => i.kind === "raw");
  const [fields, setFields] = useState({
    supplierId: w.suppliers[0]?.id || "",
    warehouseId: w.warehouses[0]?.id || "",
    orderDate: today(),
    expectedDate: "",
    supplierReference: "",
    paymentTerms: "",
    deliveryAddress: "",
    notes: "",
  });
  const [lines, setLines] = useState<DraftLine[]>([
    { key: crypto.randomUUID(), itemId: first?.id || "", quantity: "1", unitPrice: first?.unitCost || "0" },
  ]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef({ fingerprint: "", key: "" });
  const supplier = w.suppliers.find((s) => s.id === fields.supplierId),
    warehouse = w.warehouses.find((s) => s.id === fields.warehouseId);
  const total = orderValue(lines);
  const missing = !w.suppliers.length || !w.warehouses.length || !w.items.length;
  const set = (name: keyof typeof fields, value: string) => setFields((f) => ({ ...f, [name]: value }));
  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (new Set(lines.map((l) => l.itemId)).size !== lines.length) {
      setError("Each item can appear once. Combine duplicate quantities on a single line.");
      return;
    }
    if (
      lines.some(
        (l) =>
          !/^\d{1,11}(\.\d{1,6})?$/.test(l.quantity) ||
          Number(l.quantity) <= 0 ||
          !/^\d{1,11}(\.\d{1,4})?$/.test(l.unitPrice),
      )
    ) {
      setError(
        "Enter positive quantities (up to 6 decimal places) and non-negative unit prices (up to 4 decimal places).",
      );
      return;
    }
    if (fields.expectedDate && fields.expectedDate < fields.orderDate) {
      setError("Expected delivery cannot be before the order date.");
      return;
    }
    const body = {
      ...fields,
      lines: lines.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })),
    };
    const fingerprint = JSON.stringify(body);
    if (attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      await onSave(body, attempt.current.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this order. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="po-layout" onSubmit={submit} aria-label="Create purchase order">
      <fieldset className="po-editor" disabled={busy}>
        {missing && (
          <div className="form-error" role="alert">
            Add a supplier, warehouse and item in the workspace before creating a purchase order.
          </div>
        )}
        <section className="po-card">
          <CardHeading
            icon={<Users size={19} />}
            title="Supplier & destination"
            subtitle="Who you are buying from, and where the order will arrive."
          />
          <div className="po-fields">
            <label>
              Supplier <span>*</span>
              <select required value={fields.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="" disabled>
                  Select supplier
                </option>
                {w.suppliers.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Receiving warehouse <span>*</span>
              <select required value={fields.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}>
                <option value="" disabled>
                  Select warehouse
                </option>
                {w.warehouses.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="po-party-preview">
            <div>
              <b>{supplier?.name || "Select a supplier"}</b>
              <span>{supplier?.email || "No email recorded"}</span>
              <span>{supplier?.phone || "No phone recorded"}</span>
              {supplier?.address && <span>{supplier.address}</span>}
            </div>
            <div>
              <MapPin size={16} />
              <span>
                <b>{warehouse?.name || "Select a warehouse"}</b>
                {warehouse?.code && <small>{warehouse.code}</small>}
              </span>
            </div>
          </div>
        </section>
        <section className="po-card">
          <CardHeading
            icon={<CalendarDays size={19} />}
            title="Order details"
            subtitle="Dates and references for a clearer handover."
          />
          <div className="po-fields">
            <label>
              Order date <span>*</span>
              <input required type="date" value={fields.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
            </label>
            <label>
              Expected delivery
              <input
                type="date"
                min={fields.orderDate}
                value={fields.expectedDate}
                onChange={(e) => set("expectedDate", e.target.value)}
              />
            </label>
            <label>
              Supplier reference
              <input
                maxLength={100}
                placeholder="e.g. Supplier quotation QT-204"
                value={fields.supplierReference}
                onChange={(e) => set("supplierReference", e.target.value)}
              />
            </label>
            <label>
              Payment terms
              <input
                maxLength={200}
                placeholder="e.g. Within 30 days of supplier invoice"
                value={fields.paymentTerms}
                onChange={(e) => set("paymentTerms", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="po-card po-items-card">
          <CardHeading
            icon={<Package size={19} />}
            title="Order items"
            subtitle="Prices are in INR. Quantities follow each item's base unit."
          />
          <div className="po-items-head" aria-hidden="true">
            <span>ITEM / DESCRIPTION</span>
            <span>QUANTITY</span>
            <span>UNIT PRICE (₹)</span>
            <span>LINE VALUE</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const item = w.items.find((i) => i.id === line.itemId);
            return (
              <div className="po-line" key={line.key}>
                <label>
                  <span className="po-mobile-label">Item {index + 1}</span>
                  <select
                    aria-label={`Item ${index + 1}`}
                    required
                    value={line.itemId}
                    onChange={(e) => {
                      const item = w.items.find((i) => i.id === e.target.value);
                      update(line.key, { itemId: e.target.value, unitPrice: item?.unitCost || "0" });
                    }}
                  >
                    <option value="" disabled>
                      Select item
                    </option>
                    {w.items.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={lines.some((l) => l.key !== line.key && l.itemId === item.id)}
                      >
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                  <small>
                    {item?.sku || "Item code"}
                    {item && ` · ${item.kind === "raw" ? "Raw material" : "Finished goods"}`}
                  </small>
                </label>
                <label>
                  <span className="po-mobile-label">Quantity ({item?.unit || "units"})</span>
                  <input
                    aria-label={`Quantity for item ${index + 1}`}
                    required
                    type="number"
                    min="0.000001"
                    max="99999999999.999999"
                    step="0.000001"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                  />
                  <small>{item?.unit || "base units"}</small>
                </label>
                <label>
                  <span className="po-mobile-label">Unit price (₹)</span>
                  <input
                    aria-label={`Unit price for item ${index + 1}`}
                    required
                    type="number"
                    min="0"
                    max="99999999999.9999"
                    step="0.0001"
                    value={line.unitPrice}
                    onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                  />
                </label>
                <strong className="po-line-value">{inr(lineValue(line.quantity, line.unitPrice))}</strong>
                <button
                  type="button"
                  className="icon-button"
                  disabled={lines.length === 1}
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            disabled={lines.length >= Math.min(100, w.items.length)}
            onClick={() =>
              setLines((ls) => [...ls, { key: crypto.randomUUID(), itemId: "", quantity: "1", unitPrice: "0" }])
            }
          >
            <Plus size={16} />
            Add line item
          </Button>
        </section>
        <section className="po-card">
          <CardHeading
            icon={<Truck size={19} />}
            title="Delivery & notes"
            subtitle="Instructions that should travel with this purchase order."
          />
          <div className="po-fields">
            <label className="po-full">
              Delivery address / instructions
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Receiving address, contact person or delivery instructions"
                value={fields.deliveryAddress}
                onChange={(e) => set("deliveryAddress", e.target.value)}
              />
            </label>
            <label className="po-full">
              Order notes
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Specifications, packaging or other supplier instructions"
                value={fields.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
              <small>Included on the printed purchase order and CSV export.</small>
            </label>
          </div>
        </section>
      </fieldset>
      <aside className="po-summary">
        <span className="eyebrow">ORDER SUMMARY</span>
        <h2>Ready for a clear start.</h2>
        <dl>
          <div>
            <dt>Supplier</dt>
            <dd>{supplier?.name || "Not selected"}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{warehouse?.name || "Not selected"}</dd>
          </div>
          <div>
            <dt>Item lines</dt>
            <dd>{lines.length}</dd>
          </div>
          <div>
            <dt>Expected delivery</dt>
            <dd>{fields.expectedDate ? date(fields.expectedDate, true) : "Not specified"}</dd>
          </div>
        </dl>
        <div className="po-total">
          <span>
            Order total <small>INR</small>
          </span>
          <strong>{inr(total)}</strong>
        </div>
        <p className="po-fine">Purchase value only. Tax, freight and discounts are not calculated in this version.</p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Button type="submit" busy={busy} disabled={missing}>
          Create purchase order
          <ArrowRight size={16} />
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>
          Cancel
        </Button>
        <p className="po-assurance">
          <ShieldCheck size={15} />
          Saved to your company workspace
        </p>
        <div className="po-summary-tip">
          <Download size={17} />
          <p>
            After saving, download CSV or print a clean purchase order and choose <b>Save as PDF</b>.
          </p>
        </div>
        <p className="po-fine">
          Creating this order does not change stock. Receive goods to post the quantities delivered.
        </p>
      </aside>
    </form>
  );
}
function CardHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="po-card-heading">
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function PurchaseDetail({
  w,
  order: o,
  onBack,
  onNew,
  onReceive,
  canCreate,
  canReceive,
  heading,
}: Props & { order: Document; heading: React.RefObject<HTMLHeadingElement | null> }) {
  const supplier = w.suppliers.find((s) => s.id === o.supplierId),
    receipts = w.receipts.filter((r) => r.purchaseOrderId === o.id);
  return (
    <>
      <div className="po-heading">
        <div>
          <span className="eyebrow">PROCURE TO PAY / PURCHASE ORDER</span>
          <h1 ref={heading} tabIndex={-1}>
            {o.code}
          </h1>
          <p>
            {o.supplierName} <span>·</span> {date(o.orderDate || o.createdAt, true)}
          </p>
        </div>
        <div className="po-actions">
          <Badge value={o.status} />
          <Button variant="secondary" onClick={() => downloadPurchaseCsv(o, w)}>
            <Download size={16} />
            Download CSV
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print / Save PDF
          </Button>
          {o.status !== "received" && (
            <Button disabled={!canReceive} onClick={() => onReceive(o)}>
              <Truck size={16} />
              Receive goods
            </Button>
          )}
        </div>
      </div>
      <div className="po-detail-layout">
        <article className="po-document">
          <header className="po-document-head">
            <div>
              <span className="po-forge-wordmark">
                forge<span> / BY MADTECH</span>
              </span>
              <h2>{w.company.name}</h2>
              <p>{w.company.address || "Company address not recorded"}</p>
              {w.company.phone && <p>{w.company.phone}</p>}
            </div>
            <div>
              <span className="eyebrow">PURCHASE ORDER</span>
              <strong>{o.code}</strong>
              <p>Order date: {date(o.orderDate || o.createdAt, true)}</p>
              <p>Expected: {o.expectedDate ? date(o.expectedDate, true) : "Not specified"}</p>
            </div>
          </header>
          <div className="po-document-parties">
            <div>
              <span className="eyebrow">SUPPLIER / ORDER TO</span>
              <h3>{o.supplierName}</h3>
              <p>{supplier?.address || "Address not recorded"}</p>
              {supplier?.email && <p>{supplier.email}</p>}
              {supplier?.phone && <p>{supplier.phone}</p>}
            </div>
            <div>
              <span className="eyebrow">DELIVER TO</span>
              <h3>{o.warehouseName}</h3>
              <p>{o.deliveryAddress || "Delivery address not specified"}</p>
            </div>
          </div>
          <dl className="po-document-meta">
            <div>
              <dt>Supplier reference</dt>
              <dd>{o.supplierReference || "Not specified"}</dd>
            </div>
            <div>
              <dt>Payment terms</dt>
              <dd>{o.paymentTerms || "Not specified"}</dd>
            </div>
          </dl>
          <div className="po-document-table-wrap">
            <table className="po-document-table">
              <thead>
                <tr>
                  <th>ITEM / DESCRIPTION</th>
                  <th>QTY</th>
                  <th>UNIT</th>
                  <th>UNIT PRICE</th>
                  <th>VALUE (INR)</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.itemName}</strong>
                      <small>{w.items.find((i) => i.id === l.itemId)?.sku}</small>
                    </td>
                    <td>{number(l.quantity)}</td>
                    <td>{l.unit}</td>
                    <td>{inr(l.unitPrice)}</td>
                    <td>{inr(lineValue(l.quantity, l.unitPrice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="po-document-total">
            <span>Total purchase value</span>
            <strong>{inr(o.total)}</strong>
          </div>
          <p className="po-fine">
            Currency: INR. This purchase order is not a tax invoice. Tax, freight and discounts are not calculated.
          </p>
          {o.notes && (
            <section className="po-document-notes">
              <span className="eyebrow">NOTES & INSTRUCTIONS</span>
              <p>{o.notes}</p>
            </section>
          )}
          <footer className="po-document-foot">
            <span>Prepared through Madtech Forge</span>
            <span>
              {o.code} / {date(o.createdAt, true)}
            </span>
          </footer>
        </article>
        <aside className="po-status-card">
          <CardHeading icon={<ShoppingCart size={18} />} title="Order progress" subtitle="Live receiving status." />
          <div className="po-received-lines">
            {o.lines.map((l) => (
              <div key={l.id}>
                <strong>{l.itemName}</strong>
                <span>
                  {number(l.receivedQuantity || "0")} of {number(l.quantity)} {l.unit} received
                </span>
                <progress
                  max={Number(l.quantity)}
                  value={Number(l.receivedQuantity || 0)}
                  aria-label={`Received ${l.itemName}`}
                />
                <small>
                  {quantitySubtract(l.quantity, l.receivedQuantity || "0")} {l.unit} remaining
                </small>
              </div>
            ))}
          </div>
          <h3>
            Goods receipts <span>{receipts.length}</span>
          </h3>
          {receipts.length ? (
            receipts.map((r) => (
              <div className="po-receipt" key={r.id}>
                <b>{r.code}</b>
                <span>{date(r.createdAt, true)}</span>
                <strong>{inr(r.total)}</strong>
              </div>
            ))
          ) : (
            <p className="po-fine">No deliveries recorded yet. Stock is updated when goods are received.</p>
          )}
          <div className="po-summary-tip">
            <Check size={17} />
            <p>
              Downloads reflect the current saved order. Supplier and company contact information use their current
              workspace records.
            </p>
          </div>
        </aside>
      </div>
      <div className="po-bottom-actions">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to procurement
        </Button>
        {canCreate && (
          <Button onClick={onNew}>
            <Plus size={16} />
            New purchase order
          </Button>
        )}
      </div>
    </>
  );
}
