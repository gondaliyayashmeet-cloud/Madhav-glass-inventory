import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { useAuth } from '../lib/auth';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/Dialog';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { Shield, CheckCircle, Clock, Eye, Package, QrCode, Copy, Trash2, UserMinus } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  stock_keeper: 'Stock Keeper',
  viewer: 'Viewer',
  pending: 'Pending',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Shield className="size-4 text-accent" />,
  admin: <Shield className="size-4 text-accent" />,
  stock_keeper: <Package className="size-4 text-success" />,
  viewer: <Eye className="size-4 text-secondary" />,
  pending: <Clock className="size-4 text-warning" />,
};

export default function Members() {
  const { session } = useAuth();
  const { activeCompany, activeCompanyId, role: myRole } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [updating, setUpdating] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);

  const jwt = session?.access_token ?? '';
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/members`;

  const canManage = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const { data, isLoading } = useQuery({
    queryKey: ['members', activeCompanyId],
    queryFn: async () => {
      const resp = await fetch(`${apiUrl}?company_id=${activeCompanyId}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `Request failed (${resp.status})`);
      }
      const result = await resp.json();
      return result as any[];
    },
    enabled: !!jwt && !!activeCompanyId,
  });

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdating(userId);
    try {
      const resp = await fetch(`${apiUrl}?company_id=${activeCompanyId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, role }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        toast(err.error || 'Failed to update role', 'error');
      } else {
        toast('Role updated', 'success');
        queryClient.invalidateQueries({ queryKey: ['members', activeCompanyId] });
      }
    } catch {
      toast('Network error', 'error');
    }
    setUpdating(null);
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const resp = await fetch(`${apiUrl}?company_id=${activeCompanyId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: removeTarget.user_id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        toast(err.error || 'Failed to remove member', 'error');
      } else {
        toast('Member removed', 'success');
        setRemoveTarget(null);
        queryClient.invalidateQueries({ queryKey: ['members', activeCompanyId] });
      }
    } catch {
      toast('Network error', 'error');
    }
    setRemoving(false);
  };

  const copyInviteCode = () => {
    if (activeCompany?.invite_code) {
      navigator.clipboard.writeText(activeCompany.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Members</h1>
          <p className="text-sm text-secondary">Manage who can access {activeCompany?.name ?? 'this company'}</p>
        </div>
        <Button variant="secondary" onClick={() => setInviteOpen(true)}>
          <QrCode className="size-4" />
          Invite
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">No members found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-inset">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-secondary">Name</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Email</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Current Role</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Status</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Set Role</th>
                <th className="px-4 py-3 text-left font-medium text-secondary">Joined</th>
                {canManage && <th className="px-4 py-3 text-right font-medium text-secondary">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((m: any) => (
                <tr key={m.id} className={`bg-raised hover:bg-inset transition-colors ${updating === m.user_id ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-primary">{m.name ?? '—'}</td>
                  <td className="px-4 py-3 text-secondary">{m.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-primary">
                      {ROLE_ICONS[m.role]}
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.role === 'pending' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-weak px-2 py-0.5 text-xs font-medium text-warning">
                        <Clock className="size-3" />
                        Awaiting approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-weak px-2 py-0.5 text-xs font-medium text-success">
                        <CheckCircle className="size-3" />
                        Approved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.role === 'owner' ? (
                      <span className="text-xs text-secondary">—</span>
                    ) : canManage ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => handleRoleChange(m.user_id, v)}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="stock_keeper">Stock Keeper</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-secondary">{ROLE_LABELS[m.role] ?? m.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {m.role !== 'owner' && (
                          <button
                            onClick={() => setRemoveTarget(m)}
                            className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors"
                            title="Remove member"
                          >
                            <UserMinus className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogHeader>
          <DialogTitle>Invite People to {activeCompany?.name}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Share this invite code with people you want to join your company. They can use it on the "Join a Company" screen.
          </p>
          <div className="rounded-lg border border-border bg-inset p-4">
            <p className="mb-2 text-xs font-medium text-secondary">Invite Code</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl font-bold tracking-widest text-primary">{activeCompany?.invite_code}</span>
              <Button variant="secondary" size="sm" onClick={copyInviteCode}>
                {copied ? <CheckCircle className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-inset p-4">
            <p className="mb-1 text-xs font-medium text-secondary">Direct Join Link</p>
            <p className="break-all text-xs text-primary">
              {window.location.origin}/get-started?code={activeCompany?.invite_code}
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setInviteOpen(false)}>Close</Button>
        </DialogFooter>
      </Dialog>

      {/* Remove Member Confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogHeader>
          <DialogTitle>Remove Member</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to remove <span className="font-medium text-primary">{removeTarget?.name ?? removeTarget?.email}</span> from this company?
            They will lose access immediately. They can request to join again using the invite code.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleRemoveMember} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
