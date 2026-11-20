import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type Role = 'owner' | 'admin' | 'stock_keeper' | 'viewer' | 'pending';

export interface CompanyInfo {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  role: Role;
  approved: boolean;
}

interface CompanyContextValue {
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  activeCompanyId: string | null;
  role: Role;
  name: string | null;
  loading: boolean;
  switchCompany: (companyId: string) => void;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

const STORAGE_KEY = 'stockhub_active_company';

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    if (!user || !session) {
      setCompanies([]);
      setActiveCompanyId(null);
      setName(null);
      setLoading(false);
      return;
    }

    const userName = (user.user_metadata?.name as string) ?? null;
    setName(userName);

    try {
      const { data, error } = await supabase.functions.invoke('member-role', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error || !data) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      const list: CompanyInfo[] = data.companies ?? [];
      setCompanies(list);

      const stored = localStorage.getItem(STORAGE_KEY);
      const storedValid = stored && list.find((c) => c.id === stored && c.approved);
      if (storedValid) {
        setActiveCompanyId(storedValid.id);
      } else {
        const firstApproved = list.find((c) => c.approved);
        if (firstApproved) {
          setActiveCompanyId(firstApproved.id);
          localStorage.setItem(STORAGE_KEY, firstApproved.id);
        } else {
          setActiveCompanyId(null);
        }
      }
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const switchCompany = useCallback((companyId: string) => {
    setActiveCompanyId(companyId);
    localStorage.setItem(STORAGE_KEY, companyId);
  }, []);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;
  const role: Role = activeCompany?.role ?? 'pending';

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        activeCompanyId,
        role,
        name,
        loading,
        switchCompany,
        refresh: fetchCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
