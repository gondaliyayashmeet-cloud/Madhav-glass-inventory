import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Button } from '../components/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/Dialog';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';
import { ExportButton } from '../components/ExportButton';
import { Plus, Phone, Mail, MapPin, Pencil, Trash2, User, Search } from 'lucide-react';
import { fuzzyMatch } from '../lib/search';

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', notes: '' };

export default function Customers() {
  const { activeCompanyId, role } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const canManage = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canDelete = ['owner', 'admin'].includes(role);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name,phone,email,address,notes')
        .eq('company_id', activeCompanyId)
        .order('name');
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!activeCompanyId,
  });

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast('Customer name is required', 'warning');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      company_id: activeCompanyId,
    };

    let error: { message: string } | null = null;
    if (editTarget) {
      ({ error } = await supabase.from('customers').update(payload).eq('id', editTarget.id));
    } else {
      ({ error } = await supabase.from('customers').insert(payload));
    }

    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast(editTarget ? 'Customer updated' : 'Customer added', 'success');
    setOpen(false);
    setForm(EMPTY_FORM);
    setEditTarget(null);
    queryClient.invalidateQueries({ queryKey: ['customers', activeCompanyId] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id);
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Customer deleted', 'success');
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ['customers', activeCompanyId] });
  };

  const filtered = (data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const all = `${c.name} ${c.phone ?? ''} ${c.email ?? ''} ${c.address ?? ''} ${c.notes ?? ''}`;
    return fuzzyMatch(all, search);
  });

  const exportColumns = [
    { header: 'Name', key: 'name' },
    { header: 'Phone', key: 'phone' },
    { header: 'Email', key: 'email' },
    { header: 'Address', key: 'address' },
    { header: 'Notes', key: 'notes' },
  ];
  const exportRows = filtered.map((c) => ({
    name: c.name,
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Customers</h1>
          <p className="text-sm text-secondary">Track who buys from you and view their purchase history</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton filename="customers" columns={exportColumns} rows={exportRows} title="Customer List" />
          {canManage && (
            <Button onClick={openAdd}>
              <Plus className="size-4" />
              Add Customer
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, email, address, or notes…"
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">No customers yet. Add your first customer to start tracking sales.</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">No customers match your search.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-raised p-4 hover:shadow-md transition-shadow">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-primary">{c.name}</h3>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="rounded-md p-1.5 text-secondary hover:bg-inset hover:text-accent transition-colors" title="Edit customer">
                      <Pencil className="size-4" />
                    </button>
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(c)} className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors" title="Delete customer">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {c.phone && (
                  <div className="flex items-center gap-2 text-secondary">
                    <Phone className="size-4 text-accent" />
                    {c.phone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-secondary">
                    <Mail className="size-4 text-accent" />
                    {c.email}
                  </div>
                )}
                {c.address && (
                  <div className="flex items-start gap-2 text-secondary">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                    {c.address}
                  </div>
                )}
                {c.notes && (
                  <div className="flex items-start gap-2 text-secondary">
                    <User className="mt-0.5 size-4 shrink-0 text-accent" />
                    {c.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Address</label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Notes</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogHeader>
          <DialogTitle>Delete Customer</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to delete <span className="font-medium text-primary">{deleteTarget?.name}</span>?
            Their past transactions will remain but won't be linked to this customer. This cannot be undone.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={saving}>
            {saving ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
