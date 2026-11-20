import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';
import { Building2, Plus, LogIn, Package, Check, ArrowRight, Trash2 } from 'lucide-react';

export default function GetStarted() {
  const { user, signOut } = useAuth();
  const { companies, refresh } = useCompany();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setInviteCode(code.toUpperCase());
      setMode('join');
    }
  }, [searchParams]);

  const approvedCompanies = companies.filter((c) => c.approved);
  const pendingCompanies = companies.filter((c) => !c.approved);

  const handleCreate = async () => {
    if (!companyName.trim()) {
      toast('Company name is required', 'warning');
      return;
    }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast('Session error — please sign in again', 'error');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: companyName.trim(),
        description: description.trim() || null,
        owner_id: userId,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      toast(error?.message ?? 'Failed to create company', 'error');
      setLoading(false);
      return;
    }

    await supabase.from('company_members').upsert(
      {
        company_id: data.id,
        user_id: userId,
        role: 'owner',
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,user_id' },
    );

    toast('Company created!', 'success');
    await refresh();
    navigate('/');
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      toast('Invite code is required', 'warning');
      return;
    }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast('Session error — please sign in again', 'error');
      setLoading(false);
      return;
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (companyError || !company) {
      toast('Invalid invite code', 'error');
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from('company_members')
      .select('id, role')
      .eq('company_id', company.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (existing.role === 'pending') {
        toast('Your join request is already pending approval', 'warning');
      } else {
        toast('You are already a member of this company', 'warning');
        await refresh();
        navigate('/');
      }
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from('company_members').insert({
      company_id: company.id,
      user_id: userId,
      role: 'pending',
    });

    if (memberError) {
      toast(memberError.message, 'error');
      setLoading(false);
      return;
    }

    toast(`Join request sent to ${company.name}. Waiting for approval.`, 'success');
    await refresh();
    navigate('/');
  };

  const handleDeleteCompany = async () => {
    if (!deleteCompanyId) return;
    setDeleting(true);
    const { error } = await supabase.from('companies').delete().eq('id', deleteCompanyId);
    setDeleting(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Company deleted', 'success');
    setDeleteCompanyId(null);
    await refresh();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin');
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-white">
            <Package className="size-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-primary">StockHub</h1>
            <p className="text-sm text-secondary">Inventory for everyone</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-raised p-6">
          {/* Show existing companies first */}
          {approvedCompanies.length > 0 && mode === 'choose' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-primary">Your Companies</h2>
              <p className="text-sm text-secondary">Select a company to open, or create a new one below.</p>
              <div className="space-y-2">
                {approvedCompanies.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:border-accent hover:bg-inset">
                    <button
                      onClick={() => {
                        refresh().then(() => navigate('/'));
                      }}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg bg-accent-weak">
                        <Building2 className="size-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-primary">{c.name}</p>
                        <p className="text-xs text-secondary capitalize">{c.role} · Code: {c.invite_code}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate('/')}
                        className="rounded-md p-1.5 text-secondary hover:bg-inset hover:text-accent transition-colors"
                        title="Open"
                      >
                        <ArrowRight className="size-4" />
                      </button>
                      {c.role === 'owner' && (
                        <button
                          onClick={() => setDeleteCompanyId(c.id)}
                          className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors"
                          title="Delete company"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {pendingCompanies.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-secondary">Pending Approval</p>
                  {pendingCompanies.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-inset p-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-warning-weak">
                        <Check className="size-4 text-warning" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-primary">{c.name}</p>
                        <p className="text-xs text-secondary">Waiting for approval</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <button
                  onClick={() => setMode('create')}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors hover:border-accent hover:bg-inset"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent-weak">
                    <Plus className="size-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Create Another Company</p>
                    <p className="text-xs text-secondary">Start a new workspace</p>
                  </div>
                </button>
                <button
                  onClick={() => setMode('join')}
                  className="mt-2 flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors hover:border-accent hover:bg-inset"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent-weak">
                    <LogIn className="size-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Join Another Company</p>
                    <p className="text-xs text-secondary">Use an invite code</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* No companies — show create/join */}
          {approvedCompanies.length === 0 && mode === 'choose' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-primary">Get Started</h2>
              <p className="text-sm text-secondary">
                Create a new company to manage your inventory, or join an existing one with an invite code.
              </p>
              {pendingCompanies.length > 0 && (
                <div className="rounded-lg border border-warning-weak bg-warning-weak p-3">
                  <p className="text-xs font-medium text-warning">Pending Join Requests</p>
                  {pendingCompanies.map((c) => (
                    <p key={c.id} className="mt-1 text-xs text-secondary">{c.name} — waiting for approval</p>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <button
                  onClick={() => setMode('create')}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-accent hover:bg-inset"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-accent-weak">
                    <Plus className="size-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Create a Company</p>
                    <p className="text-xs text-secondary">Start managing your own inventory</p>
                  </div>
                </button>
                <button
                  onClick={() => setMode('join')}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-accent hover:bg-inset"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-accent-weak">
                    <LogIn className="size-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Join a Company</p>
                    <p className="text-xs text-secondary">Use an invite code to join</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-5 text-accent" />
                <h2 className="text-base font-semibold text-primary">Create a Company</h2>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-secondary">Company Name *</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Acme Supplies" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-secondary">Description (optional)</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this company store?" />
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setMode('choose')} className="flex-1">Back</Button>
                <Button onClick={handleCreate} disabled={loading} className="flex-1">
                  {loading ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <LogIn className="size-5 text-accent" />
                <h2 className="text-base font-semibold text-primary">Join a Company</h2>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-secondary">Invite Code *</label>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  className="uppercase"
                  maxLength={6}
                />
                <p className="mt-1.5 text-xs text-secondary">
                  Ask the company owner for the 6-character invite code.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setMode('choose')} className="flex-1">Back</Button>
                <Button onClick={handleJoin} disabled={loading} className="flex-1">
                  {loading ? 'Joining…' : 'Request to Join'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-secondary">{user?.email}</span>
          <button onClick={handleSignOut} className="text-xs text-secondary hover:text-accent transition-colors">
            Sign Out
          </button>
        </div>
      </div>

      {/* Delete Company Confirmation */}
      {deleteCompanyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setDeleteCompanyId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-raised p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-primary">Delete Company</h3>
            <p className="mt-2 text-sm text-secondary">
              This will permanently delete the company and all its inventory, transactions, brands, suppliers, customers, and members. This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setDeleteCompanyId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={handleDeleteCompany} disabled={deleting} className="flex-1">
                {deleting ? 'Deleting…' : 'Delete Forever'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
