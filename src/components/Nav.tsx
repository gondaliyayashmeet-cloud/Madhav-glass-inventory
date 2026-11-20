import { type ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ChevronDown, Building2, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { Button } from './Button';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export function Nav({ items }: { items: NavItem[] }) {
  const { user, signOut } = useAuth();
  const { companies, activeCompany, switchCompany } = useCompany();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!companyMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCompanyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [companyMenuOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/signin');
  };

  const approvedCompanies = companies.filter((c) => c.approved);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-raised/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-base font-bold tracking-tight text-primary">StockHub</span>

          {/* Company Switcher */}
          {approvedCompanies.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-inset"
              >
                <Building2 className="size-3.5 text-accent" />
                <span className="max-w-[120px] truncate">{activeCompany?.name ?? 'Select'}</span>
                <ChevronDown className="size-3.5 text-secondary" />
              </button>

              {companyMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-border bg-raised shadow-lg">
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-xs font-medium text-secondary">Your Companies</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {approvedCompanies.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          switchCompany(c.id);
                          setCompanyMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-primary transition-colors hover:bg-inset"
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-secondary capitalize">{c.role}</span>
                        </div>
                        {activeCompany?.id === c.id && <Check className="size-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border px-3 py-2">
                    <button
                      onClick={() => {
                        setCompanyMenuOpen(false);
                        navigate('/get-started');
                      }}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      + Create or Join Company
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-weak text-accent'
                      : 'text-secondary hover:bg-inset hover:text-primary'
                  }`
                }
              >
                <span className="size-4">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden text-xs text-secondary sm:block">{user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden md:inline-flex">
            <LogOut className="size-4" />
            Sign Out
          </Button>
          <button
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-border bg-raised px-4 py-3 md:hidden">
          {approvedCompanies.length > 1 && (
            <div className="mb-2 border-b border-border pb-2">
              <p className="mb-1 text-xs font-medium text-secondary">Switch Company</p>
              {approvedCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    switchCompany(c.id);
                    setMobileOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    activeCompany?.id === c.id ? 'bg-accent-weak text-accent' : 'text-primary hover:bg-inset'
                  }`}
                >
                  <span>{c.name}</span>
                  {activeCompany?.id === c.id && <Check className="size-4" />}
                </button>
              ))}
            </div>
          )}
          {items.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-weak text-accent'
                    : 'text-secondary hover:bg-inset hover:text-primary'
                }`
              }
            >
              <span className="size-4">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => {
              setMobileOpen(false);
              handleSignOut();
            }}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:bg-inset hover:text-primary"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </nav>
      )}
    </header>
  );
}
