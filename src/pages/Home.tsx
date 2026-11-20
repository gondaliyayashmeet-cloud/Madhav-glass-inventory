import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Package, AlertTriangle, Ban, TrendingUp, Shield, ArrowRightLeft, IndianRupee, UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { activeCompany, role, name } = useCompany();
  const companyId = activeCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('glass_dashboard')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: recentTx } = useQuery({
    queryKey: ['recent-transactions', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('id,type,quantity,unit_price,reference,notes,performed_by,created_at,glass_items(size,thickness_mm,unit,brands(name)),customers(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: salesData } = useQuery({
    queryKey: ['dashboard-sales', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('quantity,unit_price')
        .eq('company_id', companyId)
        .eq('type', 'out')
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const totalRevenue = (salesData ?? []).reduce((sum, tx) => sum + Number(tx.quantity) * Number(tx.unit_price ?? 0), 0);
  const totalSold = (salesData ?? []).reduce((sum, tx) => sum + Number(tx.quantity), 0);

  const cards = [
    { label: 'Total Items', value: data?.total_items, icon: <Package className="size-5 text-accent" />, to: '/inventory' },
    { label: 'Total Stock', value: data?.total_stock, icon: <TrendingUp className="size-5 text-success" />, to: '/inventory' },
    { label: 'Low Stock', value: data?.low_stock_count, icon: <AlertTriangle className="size-5 text-warning" />, to: '/reports' },
    { label: 'Out of Stock', value: data?.out_of_stock_count, icon: <Ban className="size-5 text-error" />, to: '/reports' },
    { label: 'Units Sold', value: totalSold, icon: <Package className="size-5 text-accent" />, to: '/reports' },
    { label: 'Revenue', value: `₹${totalRevenue.toFixed(0)}`, icon: <IndianRupee className="size-5 text-success" />, to: '/reports' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          {activeCompany?.name ?? 'StockHub'}
        </h1>
        <p className="text-sm text-secondary">
          Dashboard
          {name && (
            <span className="ml-2 inline-flex items-center gap-1">
              · Signed in as {name}
              {role === 'admin' || role === 'owner' ? <Shield className="size-3 text-accent" /> : null}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="flex flex-col gap-1 rounded-lg border border-border bg-raised p-4 transition-colors hover:border-accent hover:bg-inset"
          >
            <div className="flex items-center gap-2 text-secondary">
              {c.icon}
              <span className="text-sm">{c.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold text-primary">
                {isLoading ? '—' : (c.value ?? '-')}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-raised">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ArrowRightLeft className="size-4 text-accent" />
            Recent Transactions
          </h2>
          <Link to="/transactions" className="text-xs text-accent hover:underline">
            View all
          </Link>
        </div>
        {!recentTx || recentTx.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-secondary">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {recentTx.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.type === 'in'
                        ? 'bg-success-weak text-success'
                        : 'bg-error-weak text-error'
                    }`}
                  >
                    {tx.type === 'in' ? 'Stock In' : 'Stock Out'}
                  </span>
                  <div>
                    <p className="text-sm text-primary">
                      {tx.glass_items?.brands?.name} · {tx.glass_items?.size}
                      {tx.glass_items?.thickness_mm ? ` · ${tx.glass_items.thickness_mm}mm` : ''}
                    </p>
                    <p className="text-xs text-secondary">
                      {tx.customers?.name && <span className="inline-flex items-center gap-1"><UserCircle className="size-3" />{tx.customers.name} · </span>}
                      {tx.reference || tx.notes || '—'} · by {tx.performed_by || 'Unknown'}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-primary">
                  {tx.type === 'in' ? '+' : '−'}{tx.quantity}
                  {tx.unit_price ? <span className="ml-1 text-xs text-secondary">₹{(Number(tx.quantity) * Number(tx.unit_price)).toFixed(0)}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
