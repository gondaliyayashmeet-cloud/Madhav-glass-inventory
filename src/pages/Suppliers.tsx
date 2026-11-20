import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Button } from '../components/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/Dialog';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';
import { Plus, Phone, Mail, MapPin, User, Pencil, Trash2 } from 'lucide-react';

type Supplier = {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

const EMPTY_FORM = { name: '', contact: '', phone: '', email: '', address: '' };

export default function Suppliers() {
  const { activeCompanyId, role } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const canManage = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canDelete = ['owner', 'admin'].includes(role);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id,name,contact,phone,email,address')
        .eq('company_id', activeCompanyId)
        .order('name');
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!activeCompanyId,
  });

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditTarget(s);
    setForm({ name: s.name, contact: s.contact ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '' });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast('Supplier name is required', 'warning');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      contact: form.contact || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      company_id: activeCompanyId,
    };

    let error: { message: string } | null = null;
    if (editTarget) {
      ({ error } = await supabase.from('suppliers').update(payload).eq('id', editTarget.id));
    } else {
      ({ error } = await supabase.from('suppliers').insert(payload));
    }

    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast(editTarget ? 'Supplier updated' : 'Supplier added', 'success');
    setOpen(false);
    setForm(EMPTY_FORM);
    setEditTarget(null);
    queryClient.invalidateQueries({ queryKey: ['suppliers', activeCompanyId] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Supplier deleted', 'success');
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ['suppliers', activeCompanyId] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Suppliers</h1>
        {canManage && (
          <Button onClick={openAdd}>
            <Plus className="size-4" />
            Add Supplier
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">No suppliers found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-raised p-4 hover:shadow-md transition-shadow">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-primary">{s.name}</h3>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-secondary hover:bg-inset hover:text-accent transition-colors" title="Edit supplier">
                      <Pencil className="size-4" />
                    </button>
                    {canDelete && (
                      <button onClick={() => setDeleteTarget(s)} className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors" title="Delete supplier">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {s.contact && (
                  <div className="flex items-center gap-2 text-secondary">
                    <User className="size-4 text-accent" />
                    {s.contact}
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2 text-secondary">
                    <Phone className="size-4 text-accent" />
                    {s.phone}
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-secondary">
                    <Mail className="size-4 text-accent" />
                    {s.email}
                  </div>
                )}
                {s.address && (
                  <div className="flex items-start gap-2 text-secondary">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                    {s.address}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Contact Person</label>
            <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Contact person" />
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
          <DialogTitle>Delete Supplier</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to delete <span className="font-medium text-primary">{deleteTarget?.name}</span>?
            This cannot be undone.
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
