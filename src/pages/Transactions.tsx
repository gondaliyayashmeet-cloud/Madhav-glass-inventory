import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Button } from '../components/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/Dialog';
import { Input } from '../components/Input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/Select';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';
import { useToast } from '../components/Toast';
import { Plus, ArrowDown, ArrowUp, Search, Pencil, Trash2, User } from 'lucide-react';
import { fuzzyMatch, sizeSortKey, searchRank } from '../lib/search';

interface TxLine {
  glass_item_id: string;
  type: 'in' | 'out';
  quantity: string;
  unit_price: string;
}

type Tx = {
  id: number;
  type: 'in' | 'out';
  quantity: number;
  unit_price: number;
  reference: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  glass_item_id: number;
  customer_id: number | null;
  glass_items: { size: string; thickness_mm: number | null; color: string | null; unit: string | null; brands: { name: string } } | null;
  customers: { id: number; name: string } | null;
};

export default function Transactions() {
  const { activeCompanyId, role } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<TxLine[]>([{ glass_item_id: '', type: 'out', quantity: '', unit_price: '' }]);
  const [search, setSearch] = useState('');

  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editItemId, setEditItemId] = useState('');
  const [editType, setEditType] = useState<'in' | 'out'>('out');
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBy, setEditBy] = useState('');

  const [deleteTx, setDeleteTx] = useState<Tx | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const priceRefs = useRef<(HTMLInputElement | null)[]>([]);
  const customerRef = useRef<HTMLButtonElement | null>(null);
  const referenceRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLInputElement | null>(null);

  const canRecord = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canManageTx = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canStockOut = ['owner', 'admin', 'stock_keeper'].includes(role);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('id,type,quantity,unit_price,reference,notes,performed_by,created_at,glass_item_id,customer_id,glass_items(size,thickness_mm,color,unit,brands(name)),customers(id,name)')
        .eq('company_id', activeCompanyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Tx[];
    },
    enabled: !!activeCompanyId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['inventory-list', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('glass_inventory_list')
        .select('id,brand,size,thickness_mm,color,glass_type,unit,category_name,current_stock')
        .eq('company_id', activeCompanyId)
        .order('brand', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeCompanyId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', activeCompanyId)
        .order('name');
      if (error) throw error;
      return data as { id: number; name: string }[];
    },
    enabled: !!activeCompanyId,
  });

  const customerOptions: SearchableOption[] = [
    { value: '', label: 'Walk-in customer', sublabel: 'No specific customer' },
    ...customers.map((c) => ({
      value: String(c.id),
      label: c.name,
      keywords: c.name,
    })),
  ];

  const itemOptions: SearchableOption[] = [...items]
    .sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size))
    .map((it) => ({
      value: String(it.id),
      label: [
        it.thickness_mm != null ? `${it.thickness_mm}mm` : '',
        it.glass_type,
        it.brand,
        it.size,
        it.color,
      ].filter(Boolean).join(' · '),
      sublabel: `${it.category_name ?? 'Uncategorized'} · Stock: ${it.current_stock}${it.unit ? ` ${it.unit}` : ''}`,
      keywords: `${it.brand} ${it.size} ${it.thickness_mm ?? ''}mm ${it.color ?? ''} ${it.glass_type ?? ''} ${it.category_name ?? ''}`,
    }));

  const addLine = () => {
    setLines((prev) => [...prev, { glass_item_id: '', type: 'out', quantity: '', unit_price: '' }]);
    setTimeout(() => itemRefs.current[lines.length]?.focus(), 60);
  };
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof TxLine, value: string) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const handleSubmit = async () => {
    const validLines = lines.filter((l) => l.glass_item_id && l.quantity);
    if (!validLines.length) {
      toast('Add at least one transaction line', 'warning');
      return;
    }

    for (const l of validLines) {
      const qty = Number(l.quantity);
      if (!qty || qty <= 0) {
        toast('Quantities must be positive', 'warning');
        return;
      }
      const item = items.find((it: any) => it.id === Number(l.glass_item_id));
      if (l.type === 'out' && item && qty > item.current_stock) {
        toast(`Not enough stock for ${item.brand} ${item.size} (have ${item.current_stock})`, 'error');
        return;
      }
    }

    const { data: userData } = await supabase.auth.getUser();
    const performedBy = userData.user?.user_metadata?.name ?? userData.user?.email ?? 'Unknown';

    for (const l of validLines) {
      const { error } = await supabase.rpc('record_stock_transaction', {
        p_glass_item_id: Number(l.glass_item_id),
        p_type: l.type,
        p_quantity: Number(l.quantity),
        p_reference: reference || null,
        p_notes: notes || null,
        p_performed_by: performedBy,
        p_company_id: activeCompanyId,
        p_customer_id: l.type === 'out' && customerId ? Number(customerId) : null,
        p_unit_price: l.unit_price ? Number(l.unit_price) : 0,
      });
      if (error) {
        toast(error.message, 'error');
        return;
      }
    }

    toast(`${validLines.length} transaction(s) recorded`, 'success');
    setOpen(false);
    setReference('');
    setNotes('');
    setCustomerId('');
    setLines([{ glass_item_id: '', type: 'out', quantity: '', unit_price: '' }]);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
  };

  const openEdit = (tx: Tx) => {
    setEditTx(tx);
    setEditItemId(String(tx.glass_item_id));
    setEditType(tx.type);
    setEditQty(String(tx.quantity));
    setEditPrice(String(tx.unit_price ?? '0'));
    setEditCustomerId(tx.customer_id ? String(tx.customer_id) : '');
    setEditReference(tx.reference ?? '');
    setEditNotes(tx.notes ?? '');
    setEditBy(tx.performed_by ?? '');
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editTx) return;
    const qty = Number(editQty);
    if (!qty || qty <= 0) {
      toast('Quantity must be positive', 'warning');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_stock_transaction', {
      p_id: editTx.id,
      p_glass_item_id: Number(editItemId),
      p_type: editType,
      p_quantity: qty,
      p_reference: editReference || null,
      p_notes: editNotes || null,
      p_performed_by: editBy || null,
      p_customer_id: editType === 'out' && editCustomerId ? Number(editCustomerId) : null,
      p_unit_price: editPrice ? Number(editPrice) : 0,
    });
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Transaction updated', 'success');
    setEditOpen(false);
    setEditTx(null);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
  };

  const handleDelete = async () => {
    if (!deleteTx) return;
    setSaving(true);
    const { error } = await supabase.rpc('delete_stock_transaction', { p_id: deleteTx.id });
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Transaction deleted', 'success');
    setDeleteOpen(false);
    setDeleteTx(null);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
  };

  const filtered = (() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    return list
      .map((tx) => {
        const all = `${tx.glass_items?.brands?.name ?? ''} ${tx.glass_items?.size ?? ''} ${tx.glass_items?.thickness_mm ?? ''}mm ${tx.glass_items?.color ?? ''} ${tx.reference ?? ''} ${tx.notes ?? ''} ${tx.performed_by ?? ''} ${tx.customers?.name ?? ''}`;
        return { tx, rank: searchRank(all, search) };
      })
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((x) => x.tx);
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Transactions</h1>
        {canRecord && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Record Transaction
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by brand, size, customer, reference, notes, or person…"
          className="pl-10"
        />
      </div>

      {!canRecord && (
        <div className="rounded-lg border border-warning-weak bg-warning-weak px-4 py-3 text-sm text-warning">
          You need owner, admin, or stock keeper permission to record transactions.
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">
          {search ? 'No transactions match your search.' : 'No transactions recorded yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-inset">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-secondary">Type</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Brand</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Size</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">mm</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Color</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Customer</th>
                <th className="px-4 py-3 text-right font-medium text-secondary">Qty</th>
                <th className="px-4 py-3 text-right font-medium text-secondary">Price</th>
                <th className="px-4 py-3 text-right font-medium text-secondary">Total</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Reference</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">By</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Date</th>
                {canManageTx && <th className="px-4 py-3 text-right font-medium text-secondary">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((tx) => (
                <tr key={tx.id} className="bg-raised hover:bg-inset transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tx.type === 'in' ? 'bg-success-weak text-success' : 'bg-error-weak text-error'}`}>
                      {tx.type === 'in' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                      {tx.type === 'in' ? 'In' : 'Out'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-primary">{tx.glass_items?.brands?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-primary">{tx.glass_items?.size ?? '—'}</td>
                  <td className="px-4 py-3 text-primary">{tx.glass_items?.thickness_mm != null ? `${tx.glass_items.thickness_mm}mm` : '—'}</td>
                  <td className="px-4 py-3 text-primary">{tx.glass_items?.color ?? '—'}</td>
                  <td className="px-4 py-3 text-primary">
                    {tx.customers?.name ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3 text-accent" />
                        {tx.customers.name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-primary">{tx.quantity}</td>
                  <td className="px-4 py-3 text-right text-secondary">{tx.unit_price ? `₹${Number(tx.unit_price).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-primary">{tx.unit_price ? `₹${(Number(tx.quantity) * Number(tx.unit_price)).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-secondary">{tx.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-secondary">{tx.performed_by ?? '—'}</td>
                  <td className="px-4 py-3 text-secondary">
                    {new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  {canManageTx && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(tx)} className="rounded-md p-1.5 text-secondary hover:bg-inset hover:text-accent transition-colors" title="Edit transaction">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => { setDeleteTx(tx); setDeleteOpen(true); }} className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors" title="Delete transaction">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Transaction Dialog */}
      <Dialog open={open} onOpenChange={setOpen} className="max-w-[1100px]">
        <DialogHeader><DialogTitle>Record Stock Transaction</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(360px,1fr)_120px_88px_150px] sm:items-end">
                <div className="min-w-[360px]">
                  <label className="mb-1 block text-xs font-medium text-secondary">Item</label>
                  <SearchableSelect
                    ref={(el) => { itemRefs.current[idx] = el; }}
                    value={line.glass_item_id}
                    onValueChange={(v) => updateLine(idx, 'glass_item_id', v)}
                    options={itemOptions}
                    placeholder="Search item (e.g. 5mm)…"
                    emptyText="No items match your search"
                    onEnter={() => qtyRefs.current[idx]?.focus()}
                    onArrowNext={() => qtyRefs.current[idx]?.focus()}
                  />
                </div>
                <div className="w-full sm:w-[110px]">
                  <label className="mb-1 block text-xs font-medium text-secondary">Type</label>
                  <Select value={line.type} onValueChange={(v) => updateLine(idx, 'type', v)} onEnter={() => qtyRefs.current[idx]?.focus()}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Stock In</SelectItem>
                      <SelectItem value="out">Stock Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-[80px]">
                  <label className="mb-1 block text-xs font-medium text-secondary">Qty</label>
                  <Input
                    ref={(el) => { qtyRefs.current[idx] = el; }}
                    type="number"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    onEnter={() => priceRefs.current[idx]?.focus()}
                    onArrowNext={() => priceRefs.current[idx]?.focus()}
                    onArrowPrev={() => itemRefs.current[idx]?.focus()}
                    placeholder="0"
                  />
                </div>
                <div className="flex w-full items-end gap-2 sm:w-[120px]">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-secondary">₹/Unit</label>
                    <Input
                      ref={(el) => { priceRefs.current[idx] = el; }}
                      type="number"
                      value={line.unit_price}
                      onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                      onEnter={() => {
                        if (idx < lines.length - 1) {
                          itemRefs.current[idx + 1]?.focus();
                        } else {
                          setLines((prev) => [...prev, { glass_item_id: '', type: 'out', quantity: '', unit_price: '' }]);
                          setTimeout(() => itemRefs.current[idx + 1]?.focus(), 60);
                        }
                      }}
                      onArrowNext={() => {
                        if (idx < lines.length - 1) {
                          itemRefs.current[idx + 1]?.focus();
                        } else {
                          setLines((prev) => [...prev, { glass_item_id: '', type: 'out', quantity: '', unit_price: '' }]);
                          setTimeout(() => itemRefs.current[idx + 1]?.focus(), 60);
                        }
                      }}
                      onArrowPrev={() => qtyRefs.current[idx]?.focus()}
                      placeholder="0"
                    />
                  </div>
                  {lines.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="mb-0">✕</Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addLine}>
              <Plus className="size-4" />
              Add Line
            </Button>
          </div>

          {/* Customer field (shown when any line is stock out) */}
          {lines.some((l) => l.type === 'out') && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">Customer (for stock out)</label>
              <SearchableSelect
                ref={customerRef}
                value={customerId}
                onValueChange={setCustomerId}
                options={customerOptions}
                placeholder="Walk-in customer (optional)"
                emptyText="No customers match"
                onEnter={() => referenceRef.current?.focus()}
                onArrowNext={() => referenceRef.current?.focus()}
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Reference (optional)</label>
            <Input ref={referenceRef} value={reference} onChange={(e) => setReference(e.target.value)} onEnter={() => notesRef.current?.focus()} onArrowNext={() => notesRef.current?.focus()} onArrowPrev={() => customerRef.current?.focus()} placeholder="PO number, invoice, etc." />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Notes (optional)</label>
            <Input ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} onEnter={() => handleSubmit()} onArrowPrev={() => referenceRef.current?.focus()} placeholder="Additional notes" />
          </div>

        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Record</Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
        <DialogContent>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Item</label>
            <SearchableSelect value={editItemId} onValueChange={setEditItemId} options={itemOptions} placeholder="Search item…" emptyText="No items match" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Type</label>
              <Select value={editType} onValueChange={(v) => setEditType(v as 'in' | 'out')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In</SelectItem>
                  <SelectItem value="out">Stock Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[100px]">
              <label className="mb-1 block text-xs font-medium text-secondary">Qty</label>
              <Input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} placeholder="0" />
            </div>
            <div className="w-[100px]">
              <label className="mb-1 block text-xs font-medium text-secondary">₹/Unit</label>
              <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          {editType === 'out' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">Customer</label>
              <SearchableSelect
                value={editCustomerId}
                onValueChange={setEditCustomerId}
                options={customerOptions}
                placeholder="Walk-in customer"
                emptyText="No customers match"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Reference</label>
            <Input value={editReference} onChange={(e) => setEditReference(e.target.value)} placeholder="PO number, invoice, etc." />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Notes</label>
            <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Additional notes" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Performed By</label>
            <Input value={editBy} onChange={(e) => setEditBy(e.target.value)} placeholder="Person name" />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleEditSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Transaction Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogHeader><DialogTitle>Delete Transaction</DialogTitle></DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to delete this transaction? The stock change will be reversed and this cannot be undone.
          </p>
          {deleteTx && (
            <div className="rounded-lg border border-border bg-inset p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${deleteTx.type === 'in' ? 'bg-success-weak text-success' : 'bg-error-weak text-error'}`}>
                  {deleteTx.type === 'in' ? 'In' : 'Out'} {deleteTx.quantity}
                </span>
                <span className="text-primary">
                  {deleteTx.glass_items?.brands?.name} · {deleteTx.glass_items?.size}
                  {deleteTx.glass_items?.thickness_mm != null ? ` · ${deleteTx.glass_items.thickness_mm}mm` : ''}
                  {deleteTx.glass_items?.color ? ` · ${deleteTx.glass_items.color}` : ''}
                </span>
              </div>
              {deleteTx.customers?.name && (
                <p className="mt-1 text-xs text-secondary">Customer: {deleteTx.customers.name}</p>
              )}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
