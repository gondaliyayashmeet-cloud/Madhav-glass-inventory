import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/Select';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';
import { Input } from '../components/Input';
import { ExportButton } from '../components/ExportButton';
import { TrendingUp, AlertTriangle, Package, Users, IndianRupee, FileText } from 'lucide-react';

type Tab = 'sales' | 'low-stock' | 'inventory' | 'ledger';

export default function Reports() {
  const { activeCompanyId } = useCompany();
  const [tab, setTab] = useState<Tab>('sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');

  const [ledgerCustomerId, setLedgerCustomerId] = useState('');

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

  const customerOptions: SearchableOption[] = customers.map((c) => ({
    value: String(c.id),
    label: c.name,
    keywords: c.name,
  }));

  // Sales report
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-report', activeCompanyId, dateFrom, dateTo, customerId],
    queryFn: async () => {
      let query = supabase
        .from('stock_transactions')
        .select(`
          id,type,quantity,unit_price,reference,notes,performed_by,created_at,
          glass_items(size,thickness_mm,glass_type,unit,brands(name)),
          customers(id,name,phone)
        `)
        .eq('company_id', activeCompanyId)
        .eq('type', 'out')
        .order('created_at', { ascending: false })
        .limit(500);

      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
      if (customerId) query = query.eq('customer_id', Number(customerId));

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeCompanyId && tab === 'sales',
  });

  // Low stock report
  const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
    queryKey: ['low-stock-report', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('glass_inventory_list')
        .select('id,brand,size,thickness_mm,glass_type,sku,unit,category_name,current_stock,min_stock,stock_status,supplier')
        .eq('company_id', activeCompanyId)
        .in('stock_status', ['Low Stock', 'Out of Stock'])
        .order('current_stock', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeCompanyId && tab === 'low-stock',
  });

  // Customer ledger (all transactions for one customer)
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['customer-ledger', activeCompanyId, ledgerCustomerId],
    queryFn: async () => {
      if (!ledgerCustomerId) return [];
      const { data, error } = await supabase
        .from('stock_transactions')
        .select(`
          id,type,quantity,unit_price,reference,notes,performed_by,created_at,
          glass_items(size,thickness_mm,color,glass_type,unit,brands(name)),
          customers(id,name,phone)
        `)
        .eq('company_id', activeCompanyId)
        .eq('customer_id', Number(ledgerCustomerId))
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeCompanyId && tab === 'ledger' && !!ledgerCustomerId,
  });

  // Full inventory report
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-report', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('glass_inventory_list')
        .select('id,brand,size,thickness_mm,glass_type,sku,unit,category_name,current_stock,min_stock,stock_status,supplier')
        .eq('company_id', activeCompanyId)
        .order('brand', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeCompanyId && tab === 'inventory',
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sales', label: 'Sales Report', icon: <TrendingUp className="size-4" /> },
    { id: 'ledger', label: 'Customer Ledger', icon: <FileText className="size-4" /> },
    { id: 'low-stock', label: 'Low Stock', icon: <AlertTriangle className="size-4" /> },
    { id: 'inventory', label: 'Full Inventory', icon: <Package className="size-4" /> },
  ];

  // ── Sales report columns and rows ──
  const salesColumns = [
    { header: 'Date', key: 'date' },
    { header: 'Customer', key: 'customer' },
    { header: 'Phone', key: 'phone' },
    { header: 'Brand', key: 'brand' },
    { header: 'Size/Spec', key: 'size' },
    { header: 'Thickness (mm)', key: 'thickness' },
    { header: 'Color', key: 'color' },
    { header: 'Type', key: 'type' },
    { header: 'Qty', key: 'qty' },
    { header: 'Unit', key: 'unit' },
    { header: 'Unit Price', key: 'unit_price' },
    { header: 'Total', key: 'total' },
    { header: 'Reference', key: 'reference' },
    { header: 'Performed By', key: 'by' },
  ];

  const salesRows = (salesData ?? []).map((tx) => ({
    date: new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    customer: tx.customers?.name ?? 'Walk-in',
    phone: tx.customers?.phone ?? '',
    brand: tx.glass_items?.brands?.name ?? '',
    size: tx.glass_items?.size ?? '',
    thickness: tx.glass_items?.thickness_mm ?? '',
    color: tx.glass_items?.color ?? '',
    type: tx.glass_items?.glass_type ?? '',
    qty: tx.quantity,
    unit: tx.glass_items?.unit ?? 'pcs',
    unit_price: Number(tx.unit_price ?? 0).toFixed(2),
    total: (Number(tx.quantity) * Number(tx.unit_price ?? 0)).toFixed(2),
    reference: tx.reference ?? '',
    by: tx.performed_by ?? '',
  }));

  const totalRevenue = salesRows.reduce((sum, r) => sum + Number(r.total), 0);
  const totalQty = salesRows.reduce((sum, r) => sum + Number(r.qty), 0);

  // ── Low stock columns and rows ──
  const lowStockColumns = [
    { header: 'Brand', key: 'brand' },
    { header: 'Size/Spec', key: 'size' },
    { header: 'Thickness (mm)', key: 'thickness' },
    { header: 'Color', key: 'color' },
    { header: 'Type', key: 'type' },
    { header: 'SKU', key: 'sku' },
    { header: 'Category', key: 'category' },
    { header: 'Current Stock', key: 'current_stock' },
    { header: 'Min Stock', key: 'min_stock' },
    { header: 'Unit', key: 'unit' },
    { header: 'Status', key: 'status' },
    { header: 'Supplier', key: 'supplier' },
  ];

  const lowStockRows = (lowStockData ?? []).map((item) => ({
    brand: item.brand ?? '',
    size: item.size ?? '',
    thickness: item.thickness_mm ?? '',
    color: item.color ?? '',
    type: item.glass_type ?? '',
    sku: item.sku ?? '',
    category: item.category_name ?? '',
    current_stock: item.current_stock,
    min_stock: item.min_stock,
    unit: item.unit ?? 'pcs',
    status: item.stock_status,
    supplier: item.supplier ?? '',
  }));

  // ── Full inventory columns and rows ──
  const inventoryColumns = [
    { header: 'Brand', key: 'brand' },
    { header: 'Size/Spec', key: 'size' },
    { header: 'Thickness (mm)', key: 'thickness' },
    { header: 'Color', key: 'color' },
    { header: 'Type', key: 'type' },
    { header: 'SKU', key: 'sku' },
    { header: 'Category', key: 'category' },
    { header: 'Current Stock', key: 'current_stock' },
    { header: 'Min Stock', key: 'min_stock' },
    { header: 'Unit', key: 'unit' },
    { header: 'Status', key: 'status' },
    { header: 'Supplier', key: 'supplier' },
  ];

  const inventoryRows = (inventoryData ?? []).map((item) => ({
    brand: item.brand ?? '',
    size: item.size ?? '',
    thickness: item.thickness_mm ?? '',
    color: item.color ?? '',
    type: item.glass_type ?? '',
    sku: item.sku ?? '',
    category: item.category_name ?? '',
    current_stock: item.current_stock,
    min_stock: item.min_stock,
    unit: item.unit ?? 'pcs',
    status: item.stock_status,
    supplier: item.supplier ?? '',
  }));

  // ── Customer Ledger columns and rows ──
  const ledgerColumns = [
    { header: 'Date', key: 'date' },
    { header: 'Type', key: 'type' },
    { header: 'Brand', key: 'brand' },
    { header: 'Size/Spec', key: 'size' },
    { header: 'Thickness (mm)', key: 'thickness' },
    { header: 'Color', key: 'color' },
    { header: 'Glass Type', key: 'glass_type' },
    { header: 'Qty', key: 'qty' },
    { header: 'Unit', key: 'unit' },
    { header: 'Unit Price', key: 'unit_price' },
    { header: 'Total', key: 'total' },
    { header: 'Balance', key: 'balance' },
    { header: 'Reference', key: 'reference' },
    { header: 'Notes', key: 'notes' },
  ];

  let runningBalance = 0;
  const ledgerRows = (ledgerData ?? []).map((tx) => {
    const total = tx.type === 'out' ? Number(tx.quantity) * Number(tx.unit_price ?? 0) : 0;
    runningBalance += total;
    return {
      date: new Date(tx.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      type: tx.type === 'in' ? 'Stock In' : 'Sale',
      brand: tx.glass_items?.brands?.name ?? '',
      size: tx.glass_items?.size ?? '',
      thickness: tx.glass_items?.thickness_mm ?? '',
      color: tx.glass_items?.color ?? '',
      glass_type: tx.glass_items?.glass_type ?? '',
      qty: tx.quantity,
      unit: tx.glass_items?.unit ?? 'pcs',
      unit_price: Number(tx.unit_price ?? 0).toFixed(2),
      total: total.toFixed(2),
      balance: runningBalance.toFixed(2),
      reference: tx.reference ?? '',
      notes: tx.notes ?? '',
    };
  });

  const ledgerTotalQty = (ledgerData ?? []).filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.quantity), 0);
  const ledgerTotalAmount = ledgerRows.reduce((s, r) => s + Number(r.total), 0);
  const ledgerCustomer = customers.find((c) => String(c.id) === ledgerCustomerId);

  const isLoading = tab === 'sales' ? salesLoading : tab === 'ledger' ? ledgerLoading : tab === 'low-stock' ? lowStockLoading : inventoryLoading;
  const currentRows: Record<string, any>[] = tab === 'sales' ? salesRows : tab === 'ledger' ? ledgerRows : tab === 'low-stock' ? lowStockRows : inventoryRows;
  const currentColumns = tab === 'sales' ? salesColumns : tab === 'ledger' ? ledgerColumns : tab === 'low-stock' ? lowStockColumns : inventoryColumns;
  const filename = tab === 'sales' ? 'sales-report' : tab === 'ledger' ? `ledger-${ledgerCustomer?.name ?? 'customer'}` : tab === 'low-stock' ? 'low-stock-report' : 'inventory-report';
  const reportTitle = tab === 'sales' ? 'Sales Report' : tab === 'ledger' ? `Customer Ledger - ${ledgerCustomer?.name ?? ''}` : tab === 'low-stock' ? 'Low Stock Report' : 'Full Inventory Report';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Reports</h1>
        <p className="text-sm text-secondary">Export sales, inventory, and low-stock reports as PDF, Excel, or CSV</p>
      </div>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-accent text-white'
                : 'border border-border text-secondary hover:bg-inset hover:text-primary'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (sales only) */}
      {tab === 'sales' && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-raised p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">From Date</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">To Date</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
          </div>
          <div className="w-[200px]">
            <label className="mb-1 block text-xs font-medium text-secondary">Customer</label>
            <SearchableSelect
              value={customerId}
              onValueChange={setCustomerId}
              options={[
                { value: '', label: 'All Customers' },
                ...customers.map((c) => ({ value: String(c.id), label: c.name, keywords: c.name })),
              ]}
              placeholder="All Customers"
              emptyText="No customers match"
            />
          </div>
        </div>
      )}

      {/* Summary cards (sales) */}
      {tab === 'sales' && !isLoading && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-raised p-4">
            <div className="flex items-center gap-2 text-secondary">
              <TrendingUp className="size-5 text-success" />
              <span className="text-sm">Total Sales</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-primary">{salesRows.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-raised p-4">
            <div className="flex items-center gap-2 text-secondary">
              <Package className="size-5 text-accent" />
              <span className="text-sm">Total Qty Sold</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-primary">{totalQty}</p>
          </div>
          <div className="rounded-lg border border-border bg-raised p-4">
            <div className="flex items-center gap-2 text-secondary">
              <IndianRupee className="size-5 text-success" />
              <span className="text-sm">Total Revenue</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-primary">₹{totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-raised p-4">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-secondary">Select Customer *</label>
              <SearchableSelect
                value={ledgerCustomerId}
                onValueChange={setLedgerCustomerId}
                options={customerOptions}
                placeholder="Choose a customer…"
                emptyText="No customers found"
              />
            </div>
          </div>
          {ledgerCustomerId && !ledgerLoading && ledgerRows.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-raised p-4">
                  <div className="flex items-center gap-2 text-secondary">
                    <Package className="size-4 text-accent" />
                    <span className="text-sm">Total Qty Sold</span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-primary">{ledgerTotalQty}</p>
                </div>
                <div className="rounded-lg border border-border bg-raised p-4">
                  <div className="flex items-center gap-2 text-secondary">
                    <IndianRupee className="size-4 text-accent" />
                    <span className="text-sm">Total Amount</span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-primary">₹{ledgerTotalAmount.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-border bg-raised p-4">
                  <div className="flex items-center gap-2 text-secondary">
                    <FileText className="size-4 text-accent" />
                    <span className="text-sm">Transactions</span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold text-primary">{ledgerRows.length}</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-end">
        <ExportButton
          filename={filename}
          columns={currentColumns}
          rows={currentRows}
          title={reportTitle}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : currentRows.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">
          {tab === 'sales' ? 'No sales found for the selected filters.' : tab === 'ledger' ? (ledgerCustomerId ? 'No transactions found for this customer.' : 'Please select a customer to view their ledger.') : tab === 'low-stock' ? 'All items are well stocked.' : 'No inventory items found.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-inset">
              <tr>
                {currentColumns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 font-medium text-secondary ${c.key === 'qty' || c.key === 'current_stock' || c.key === 'min_stock' || c.key === 'unit_price' || c.key === 'total' || c.key === 'balance' ? 'text-right' : 'text-left'}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {currentRows.map((row, i) => (
                <tr key={i} className="bg-raised hover:bg-inset transition-colors">
                  {currentColumns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 text-primary ${c.key === 'qty' || c.key === 'current_stock' || c.key === 'min_stock' || c.key === 'unit_price' || c.key === 'total' || c.key === 'balance' ? 'text-right font-medium' : ''}`}>
                      {c.key === 'status' ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row[c.key] === 'In Stock' ? 'bg-success-weak text-success'
                          : row[c.key] === 'Low Stock' ? 'bg-warning-weak text-warning'
                          : 'bg-error-weak text-error'
                        }`}>
                          {row[c.key]}
                        </span>
                      ) : (
                        row[c.key] ?? '—'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
