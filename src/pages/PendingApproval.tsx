import { Clock, LogOut, Building2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';

export default function PendingApproval() {
  const { user, signOut } = useAuth();
  const { companies } = useCompany();
  const navigate = useNavigate();

  const pendingCompanies = companies.filter((c) => !c.approved);

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin');
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-warning-weak">
          <Clock className="size-8 text-warning" />
        </div>
        <h1 className="mb-2 text-xl font-bold tracking-tight text-primary">Approval Pending</h1>
        <p className="mb-6 text-sm text-secondary">
          Your request to join {pendingCompanies.length > 0 ? pendingCompanies.map((c) => c.name).join(', ') : 'a company'} is waiting for approval from the company owner.
        </p>
        <div className="rounded-lg border border-border bg-raised p-4 text-left">
          <p className="text-xs text-secondary">Signed in as</p>
          <p className="text-sm font-medium text-primary">{user?.email}</p>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-inset p-4 text-left">
          <p className="mb-2 text-xs font-medium text-secondary">Pending Companies</p>
          {pendingCompanies.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-1">
              <Building2 className="size-4 text-warning" />
              <span className="text-sm text-primary">{c.name}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => navigate('/get-started')}>
            Create Your Own
          </Button>
          <Button variant="secondary" className="flex-1" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
