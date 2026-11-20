import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/company';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/Select';
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { ExportButton } from '../components/ExportButton';
import { exportGroupedData, exportManualBook, type ExportColumn, type ExportGroup, type ManualGroup } from '../lib/export';
import { Search, Trash2, Pencil, Plus, Tag, Package, Zap, X, FileText, FileSpreadsheet, BookOpen } from 'lucide-react';
import { sizeSortKey, inventorySort, inventorySearchRank } from '../lib/search';

export default function Inventory() {
  const { activeCompanyId, activeCompany, role } = useCompany();
  const queryClient = useQueryClient();
  const toast = useToast();

  const canAdd = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canEdit = ['owner', 'admin'].includes(role);
  const canDelete = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canManageBrands = ['owner', 'admin', 'stock_keeper'].includes(role);
  const canDeleteBrands = ['owner', 'admin', 'stock_keeper'].includes(role);

  const [searchParams] = useSearchParams();
  const statusMap: Record<string, string> = { low: 'Low Stock', out: 'Out of Stock', in: 'In Stock' };
  const rawStatus = searchParams.get('status') ?? '';
  const initialStatus = statusMap[rawStatus] ?? rawStatus;
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const [deleteItem, setDeleteItem] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  interface AddLine {
    brand_id: string;
    size: string;
    category_id: string;
    glass_type: string;
    sku: string;
    unit: string;
    thickness: string;
    color: string;
    current_stock: string;
    min_stock: string;
    supplier_id: string;
  }
  const emptyLine = (): AddLine => ({
    brand_id: '', size: '', category_id: '', glass_type: '', sku: '', unit: 'pcs',
    thickness: '', color: '', current_stock: '', min_stock: '', supplier_id: '',
  });
  const [addLines, setAddLines] = useState<AddLine[]>([emptyLine()]);

  const brandRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sizeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const categoryRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const skuRefs = useRef<(HTMLInputElement | null)[]>([]);
  const unitRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thickRefs = useRef<(HTMLInputElement | null)[]>([]);
  const colorRefs = useRef<(HTMLInputElement | null)[]>([]);
  const stockRefs = useRef<(HTMLInputElement | null)[]>([]);
  const minStockRefs = useRef<(HTMLInputElement | null)[]>([]);
  const supplierRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [editItem, setEditItem] = useState<any | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editThickness, setEditThickness] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editType, setEditType] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editUnit, setEditUnit] = useState('pcs');
  const [editCategory, setEditCategory] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editMinStock, setEditMinStock] = useState('');
  const [editSupplier, setEditSupplier] = useState('');

  const [brandOpen, setBrandOpen] = useState(false);
  const [editBrandTarget, setEditBrandTarget] = useState<any | null>(null);
  const [brandName, setBrandName] = useState('');
  const [deleteBrandTarget, setDeleteBrandTarget] = useState<any | null>(null);

  const [quickStockOpen, setQuickStockOpen] = useState(false);
  const [quickStockMap, setQuickStockMap] = useState<Record<string, string>>({});
  const [quickStockAddMore, setQuickStockAddMore] = useState<Record<string, string[]>>({});
  const [quickStockSaving, setQuickStockSaving] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['inventory', activeCompanyId, brand, category, status],
    queryFn: async () => {
      let query = supabase.from('glass_inventory_list').select('*').eq('company_id', activeCompanyId).order('brand', { ascending: true }).order('size', { ascending: true });
      if (brand) query = query.eq('brand_id', Number(brand));
      if (category) query = query.eq('category_id', Number(category));
      if (status) query = query.eq('stock_status', status);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['brands', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('id,name').eq('company_id', activeCompanyId).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id,name,unit').eq('company_id', activeCompanyId).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name').eq('company_id', activeCompanyId).order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  const data = (() => {
    const list = rawData ?? [];
    if (!search.trim()) return [...list].sort(inventorySort);
    return list
      .map((item: any) => ({ item, rank: inventorySearchRank(item, search) }))
      .filter((x) => x.rank > 0)
      .sort((a, b) => b.rank - a.rank || inventorySort(a.item, b.item))
      .map((x) => x.item);
  })();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
        searchRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
  };

  const openAdd = () => {
    setAddLines([{ ...emptyLine(), category_id: categories[0] ? String(categories[0].id) : '' }]);
    setAddOpen(true);
    setTimeout(() => brandRefs.current[0]?.focus(), 100);
  };

  const updateAddLine = (idx: number, field: keyof AddLine, val: string) => {
    setAddLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  };

  const addRow = () => {
    setAddLines((prev) => [...prev, { ...emptyLine(), category_id: categories[0] ? String(categories[0].id) : '' }]);
    setTimeout(() => brandRefs.current[addLines.length]?.focus(), 50);
  };

  const removeAddLine = (idx: number) => {
    setAddLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const brandOptions: SearchableOption[] = brands.map((b: any) => ({ value: String(b.id), label: b.name }));
  const categoryOptions: SearchableOption[] = categories.map((c: any) => ({ value: String(c.id), label: c.name }));
  const supplierOptions: SearchableOption[] = [{ value: '', label: 'None' }, ...suppliers.map((s: any) => ({ value: String(s.id), label: s.name }))];
  const unitOptions: SearchableOption[] = [
    { value: 'pcs', label: 'Pieces (pcs)' }, { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'L', label: 'Liters (L)' }, { value: 'm', label: 'Meters (m)' },
    { value: 'sq ft', label: 'Square Feet (sq ft)' }, { value: 'box', label: 'Boxes' },
    { value: 'roll', label: 'Rolls' }, { value: 'bag', label: 'Bags' },
    { value: 'pair', label: 'Pairs' }, { value: 'set', label: 'Sets' },
  ];

  const handleAdd = async () => {
    const validLines = addLines.filter((l) => l.brand_id && l.size);
    if (validLines.length === 0) {
      toast('At least one line needs brand and size', 'warning');
      return;
    }
    setSaving(true);
    const rows = validLines.map((l) => ({
      company_id: activeCompanyId,
      brand_id: Number(l.brand_id),
      size: l.size,
      thickness_mm: l.thickness ? Number(l.thickness) : null,
      color: l.color || null,
      glass_type: l.glass_type || null,
      sku: l.sku || null,
      unit: l.unit || 'pcs',
      category_id: l.category_id ? Number(l.category_id) : null,
      current_stock: Number(l.current_stock) || 0,
      min_stock: Number(l.min_stock) || 0,
      supplier_id: l.supplier_id ? Number(l.supplier_id) : null,
    }));
    const { error } = await supabase.from('glass_items').insert(rows);
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast(`${rows.length} stock item${rows.length > 1 ? 's' : ''} added`, 'success');
    setAddOpen(false);
    invalidateAll();
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setEditBrand(String(item.brand_id));
    setEditSize(item.size);
    setEditThickness(item.thickness_mm != null ? String(item.thickness_mm) : '');
    setEditColor(item.color ?? '');
    setEditType(item.glass_type ?? '');
    setEditSku(item.sku ?? '');
    setEditUnit(item.unit ?? 'pcs');
    setEditCategory(item.category_id ? String(item.category_id) : '');
    setEditStock(String(item.current_stock));
    setEditMinStock(String(item.min_stock ?? '0'));
    setEditSupplier(item.supplier_id ? String(item.supplier_id) : '');
  };

  const handleEdit = async () => {
    if (!editItem) return;
    if (!editBrand || !editSize) {
      toast('Brand and size are required', 'warning');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('glass_items')
      .update({
        brand_id: Number(editBrand),
        size: editSize,
        thickness_mm: editThickness ? Number(editThickness) : null,
        color: editColor || null,
        glass_type: editType || null,
        sku: editSku || null,
        unit: editUnit || 'pcs',
        category_id: editCategory ? Number(editCategory) : null,
        current_stock: Number(editStock) || 0,
        min_stock: Number(editMinStock) || 0,
        supplier_id: editSupplier ? Number(editSupplier) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editItem.id);
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Stock item updated', 'success');
    setEditItem(null);
    invalidateAll();
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const { error } = await supabase.from('glass_items').delete().eq('id', deleteItem.id);
    setDeleting(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Stock item deleted', 'success');
    setDeleteItem(null);
    invalidateAll();
  };

  // ── Brand management ──
  const openAddBrand = () => {
    setEditBrandTarget(null);
    setBrandName('');
    setBrandOpen(true);
  };

  const openEditBrand = (b: any) => {
    setEditBrandTarget(b);
    setBrandName(b.name);
    setBrandOpen(true);
  };

  const handleSaveBrand = async () => {
    if (!brandName.trim()) {
      toast('Brand name is required', 'warning');
      return;
    }
    setSaving(true);
    let error: { message: string } | null = null;
    if (editBrandTarget) {
      ({ error } = await supabase.from('brands').update({ name: brandName.trim() }).eq('id', editBrandTarget.id));
    } else {
      ({ error } = await supabase.from('brands').insert({ name: brandName.trim(), company_id: activeCompanyId }));
    }
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast(editBrandTarget ? 'Brand updated' : 'Brand added', 'success');
    setBrandOpen(false);
    queryClient.invalidateQueries({ queryKey: ['brands', activeCompanyId] });
  };

  const handleDeleteBrand = async () => {
    if (!deleteBrandTarget) return;
    setSaving(true);
    const { error } = await supabase.from('brands').delete().eq('id', deleteBrandTarget.id);
    setSaving(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    toast('Brand deleted', 'success');
    setDeleteBrandTarget(null);
    queryClient.invalidateQueries({ queryKey: ['brands', activeCompanyId] });
    invalidateAll();
  };

  const openQuickStock = () => {
    const map: Record<string, string> = {};
    (rawData ?? []).forEach((item: any) => {
      map[item.id] = String(item.current_stock);
    });
    setQuickStockMap(map);
    setQuickStockAddMore({});
    setQuickStockOpen(true);
  };

  const addMore = (id: string | number) => {
    setQuickStockAddMore((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ''] }));
  };
  const updateAddMore = (id: string | number, idx: number, val: string) => {
    setQuickStockAddMore((prev) => ({
      ...prev,
      [id]: (prev[id] ?? []).map((v, i) => (i === idx ? val : v)),
    }));
  };
  const removeAddMore = (id: string | number, idx: number) => {
    setQuickStockAddMore((prev) => ({
      ...prev,
      [id]: (prev[id] ?? []).filter((_, i) => i !== idx),
    }));
  };

  const computeQuickFinal = (item: any) => {
    const id = item.id;
    const mainVal = quickStockMap[id] ?? '';
    const addMoreVals = (quickStockAddMore[id] ?? []).filter((v) => v !== '');
    const base = mainVal !== '' ? Number(mainVal) : Number(item.current_stock ?? 0);
    const addMoreSum = addMoreVals.reduce((s, v) => s + (Number(v) || 0), 0);
    const finalStock = base + addMoreSum;
    const changed = (mainVal !== '' && mainVal !== String(item.current_stock)) || addMoreSum > 0;
    return { finalStock, changed, addMoreSum };
  };

  const handleQuickStockSave = async () => {
    const updates: { id: string | number; stock: number }[] = [];
    for (const item of (rawData ?? [])) {
      const { finalStock, changed } = computeQuickFinal(item);
      if (changed) updates.push({ id: item.id, stock: finalStock });
    }
    if (updates.length === 0) {
      toast('No changes to save', 'info');
      return;
    }
    setQuickStockSaving(true);
    let errors = 0;
    for (const u of updates) {
      const { error } = await supabase
        .from('glass_items')
        .update({ current_stock: u.stock, updated_at: new Date().toISOString() })
        .eq('id', u.id);
      if (error) errors++;
    }
    setQuickStockSaving(false);
    if (errors > 0) {
      toast(`${updates.length - errors} updated, ${errors} failed`, 'warning');
    } else {
      toast(`${updates.length} stock quantity${updates.length > 1 ? 's' : ''} updated`, 'success');
    }
    setQuickStockOpen(false);
    invalidateAll();
  };

  const buildQuickStockGroups = (): ExportGroup[] => {
    const allSorted = [...(rawData ?? [])].sort(inventorySort);
    const filtered = quickSearch.trim()
      ? allSorted.filter((item: any) => inventorySearchRank(item, quickSearch) > 0)
      : allSorted;

    const groups: ExportGroup[] = [];
    let currentLabel = '';
    let currentRows: Record<string, any>[] = [];
    for (const item of filtered) {
      const mm = item.thickness_mm != null ? `${item.thickness_mm}mm` : 'No Thickness';
      const colorLabel = (item.color ?? 'No Color').trim();
      const label = `${mm} · ${colorLabel}`;
      if (label !== currentLabel) {
        if (currentRows.length > 0) groups.push({ label: currentLabel, rows: currentRows });
        currentLabel = label;
        currentRows = [];
      }
      const lastDate = item.updated_at ?? item.created_at;
      const dateStr = lastDate
        ? new Date(lastDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const { finalStock } = computeQuickFinal(item);
      const displayStock = String(finalStock);
      currentRows.push({
        size: item.size,
        brand: item.brand ?? '',
        glass_type: item.glass_type ?? '',
        category: item.category_name ?? '',
        old_stock: String(item.current_stock ?? '0'),
        new_stock: displayStock,
        unit: item.unit ?? 'pcs',
        last_updated: dateStr,
      });
    }
    if (currentRows.length > 0) groups.push({ label: currentLabel, rows: currentRows });
    return groups;
  };

  const quickStockExportColumns: ExportColumn[] = [
    { header: 'Size', key: 'size' },
    { header: 'Brand', key: 'brand' },
    { header: 'Type', key: 'glass_type' },
    { header: 'Category', key: 'category' },
    { header: 'Old Stock', key: 'old_stock' },
    { header: 'New Stock', key: 'new_stock' },
    { header: 'Unit', key: 'unit' },
    { header: 'Last Updated', key: 'last_updated' },
  ];

  const handleQuickStockExport = (format: 'pdf' | 'excel') => {
    const groups = buildQuickStockGroups();
    if (groups.length === 0) {
      toast('No items to export', 'warning');
      return;
    }
    exportGroupedData(format, 'quick-stock-update', quickStockExportColumns, groups, 'Quick Stock Update');
  };

  const buildManualGroups = (): ManualGroup[] => {
    const filtered = data;

    const groups: ManualGroup[] = [];
    let currentLabel = '';
    let currentItems: ManualGroup['items'] = [];
    for (const item of filtered) {
      const mm = item.thickness_mm != null ? `${item.thickness_mm}mm` : 'No Thickness';
      const colorLabel = (item.color ?? 'No Color').trim();
      const label = `${mm} · ${colorLabel}`;
      if (label !== currentLabel) {
        if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });
        currentLabel = label;
        currentItems = [];
      }
      currentItems.push({
        size: item.size,
        brand: item.brand ?? '',
        stock: String(item.current_stock ?? 0),
        unit: item.unit ?? 'pcs',
      });
    }
    if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });
    return groups;
  };

  const handlePrintManual = (paperSize: 'a5' | 'a4') => {
    const groups = buildManualGroups();
    if (groups.length === 0) {
      toast('No items to print', 'warning');
      return;
    }
    const title = activeCompany?.name ? `${activeCompany.name} — Manual Stock Book` : 'Manual Stock Book';
    exportManualBook('manual-stock-book', groups, title, paperSize);
  };

  const showActionsCol = canEdit || canDelete;

  // Export columns
  const exportColumns = [
    { header: 'Brand', key: 'brand' },
    { header: 'Size/Spec', key: 'size' },
    { header: 'Thickness (mm)', key: 'thickness_mm' },
    { header: 'Color', key: 'color' },
    { header: 'Type', key: 'glass_type' },
    { header: 'SKU', key: 'sku' },
    { header: 'Category', key: 'category_name' },
    { header: 'Current Stock', key: 'current_stock' },
    { header: 'Min Stock', key: 'min_stock' },
    { header: 'Unit', key: 'unit' },
    { header: 'Status', key: 'stock_status' },
    { header: 'Supplier', key: 'supplier' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Inventory</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton filename="inventory" columns={exportColumns} rows={data as any[]} title="Inventory Report" />
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-inset/60 p-1">
            <span className="hidden items-center gap-1 px-1 text-xs font-medium text-secondary sm:flex">
              <BookOpen className="size-3.5" /> Print to Manual
            </span>
            <Button variant="secondary" size="sm" onClick={() => handlePrintManual('a5')} className="h-8 px-2.5 text-xs">
              A5
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handlePrintManual('a4')} className="h-8 px-2.5 text-xs">
              A4
            </Button>
          </div>
          {canManageBrands && (
            <Button variant="secondary" onClick={openAddBrand}>
              <Tag className="size-4" />
              <span className="hidden sm:inline">Manage Brands</span>
              <span className="sm:hidden">Brands</span>
            </Button>
          )}
          {canAdd && (
            <Button variant="secondary" onClick={openQuickStock}>
              <Zap className="size-4" />
              <span className="hidden sm:inline">Quick Update</span>
              <span className="sm:hidden">Update</span>
            </Button>
          )}
          {canAdd && (
            <Button onClick={openAdd}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add Stock</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
          <Input
            ref={searchRef}
            className="pl-9 pr-20"
            placeholder="Search thickness, size, color, brand, SKU…  (Ctrl+/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className="absolute right-16 top-1/2 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-inset hover:text-primary transition-colors"
              title="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden text-[10px] font-medium text-secondary sm:inline">
            Ctrl+/
          </kbd>
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Brands</SelectItem>
            {brands.map((b: any) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="In Stock">In Stock</SelectItem>
            <SelectItem value="Low Stock">Low Stock</SelectItem>
            <SelectItem value="Out of Stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-secondary">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center text-sm text-secondary">
          <Package className="mx-auto mb-2 size-8 text-secondary" />
          {search.trim() ? `No items match "${search.trim()}".` : 'No inventory items found.'}
        </div>
      ) : (
        <div className="space-y-2">
          {search.trim() && (
            <div className="text-xs text-secondary">
              Showing {data.length} of {(rawData ?? []).length} items for "{search.trim()}"
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-inset">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Brand</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Size/Spec</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Thickness</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Color</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Type/Spec</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">SKU</th>
                  <th className="px-4 py-3 text-right font-medium text-secondary">Stock</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Unit</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-secondary">Supplier</th>
                  {showActionsCol && <th className="px-4 py-3 text-right font-medium text-secondary">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((item: any) => (
                  <tr key={item.id} className="bg-raised hover:bg-inset transition-colors">
                    <td className="px-4 py-3 text-primary">{item.brand}</td>
                    <td className="px-4 py-3 text-primary">{item.size}</td>
                    <td className="px-4 py-3 text-primary">{item.thickness_mm != null ? `${item.thickness_mm}mm` : '—'}</td>
                    <td className="px-4 py-3 text-primary">{item.color ?? '—'}</td>
                    <td className="px-4 py-3 text-primary">{item.category_name ?? '—'}</td>
                    <td className="px-4 py-3 text-primary">{item.glass_type ?? '—'}</td>
                    <td className="px-4 py-3 text-secondary">{item.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-primary">{item.current_stock}</td>
                    <td className="px-4 py-3 text-secondary">{item.unit ?? 'pcs'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.stock_status === 'In Stock'
                            ? 'bg-success-weak text-success'
                            : item.stock_status === 'Low Stock'
                            ? 'bg-warning-weak text-warning'
                            : 'bg-error-weak text-error'
                        }`}
                      >
                        {item.stock_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary">{item.supplier ?? '—'}</td>
                    {showActionsCol && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(item)}
                              className="rounded-md p-1.5 text-secondary hover:bg-accent-weak hover:text-accent transition-colors"
                              title="Edit stock item"
                            >
                              <Pencil className="size-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteItem(item)}
                              className="rounded-md p-1.5 text-secondary hover:bg-error-weak hover:text-error transition-colors"
                              title="Delete stock item"
                            >
                              <Trash2 className="size-4" />
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
        </div>
      )}

      {/* Add Dialog — bulk entry with keyboard navigation */}
      <Dialog open={addOpen} onOpenChange={setAddOpen} className="max-w-[1400px]">
        <DialogHeader><DialogTitle>Add Stock Items</DialogTitle></DialogHeader>
        <DialogContent>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-secondary">Type to search, Enter to select and move to next field. Fill as many rows as you need.</p>
            <Button variant="secondary" size="sm" onClick={addRow}>
              <Plus className="size-4" /> Add Row
            </Button>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {addLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-inset/50 p-2 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.7fr_0.7fr_0.7fr_0.8fr_1fr_auto] sm:items-end">
                {/* Brand */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Brand *</label>
                  <SearchableSelect
                    ref={(el) => { brandRefs.current[idx] = el; }}
                    value={line.brand_id}
                    onValueChange={(v) => updateAddLine(idx, 'brand_id', v)}
                    options={brandOptions}
                    placeholder="Search brand…"
                    emptyText="No brands match"
                    onEnter={() => sizeRefs.current[idx]?.focus()}
                    onArrowNext={() => sizeRefs.current[idx]?.focus()}
                  />
                </div>
                {/* Size */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Size *</label>
                  <Input
                    ref={(el) => { sizeRefs.current[idx] = el; }}
                    value={line.size}
                    onChange={(e) => updateAddLine(idx, 'size', e.target.value)}
                    onEnter={() => categoryRefs.current[idx]?.focus()}
                    onArrowNext={() => categoryRefs.current[idx]?.focus()}
                    onArrowPrev={() => brandRefs.current[idx]?.focus()}
                    placeholder="6x4 ft"
                  />
                </div>
                {/* Category */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Category</label>
                  <SearchableSelect
                    ref={(el) => { categoryRefs.current[idx] = el; }}
                    value={line.category_id}
                    onValueChange={(v) => updateAddLine(idx, 'category_id', v)}
                    options={categoryOptions}
                    placeholder="None"
                    emptyText="No categories"
                    onEnter={() => typeRefs.current[idx]?.focus()}
                  />
                </div>
                {/* Type */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Type</label>
                  <Input
                    ref={(el) => { typeRefs.current[idx] = el; }}
                    value={line.glass_type}
                    onChange={(e) => updateAddLine(idx, 'glass_type', e.target.value)}
                    onEnter={() => thickRefs.current[idx]?.focus()}
                    onArrowNext={() => thickRefs.current[idx]?.focus()}
                    onArrowPrev={() => categoryRefs.current[idx]?.focus()}
                    placeholder="Clear"
                  />
                </div>
                {/* Thickness */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Thick (mm)</label>
                  <Input
                    ref={(el) => { thickRefs.current[idx] = el; }}
                    type="number"
                    value={line.thickness}
                    onChange={(e) => updateAddLine(idx, 'thickness', e.target.value)}
                    onEnter={() => colorRefs.current[idx]?.focus()}
                    onArrowNext={() => colorRefs.current[idx]?.focus()}
                    onArrowPrev={() => typeRefs.current[idx]?.focus()}
                    placeholder="0"
                  />
                </div>
                {/* Color */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Color</label>
                  <Input
                    ref={(el) => { colorRefs.current[idx] = el; }}
                    value={line.color}
                    onChange={(e) => updateAddLine(idx, 'color', e.target.value)}
                    onEnter={() => stockRefs.current[idx]?.focus()}
                    onArrowNext={() => stockRefs.current[idx]?.focus()}
                    onArrowPrev={() => thickRefs.current[idx]?.focus()}
                    placeholder="Bronze"
                  />
                </div>
                {/* Stock */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Stock</label>
                  <Input
                    ref={(el) => { stockRefs.current[idx] = el; }}
                    type="number"
                    value={line.current_stock}
                    onChange={(e) => updateAddLine(idx, 'current_stock', e.target.value)}
                    onEnter={() => minStockRefs.current[idx]?.focus()}
                    onArrowNext={() => minStockRefs.current[idx]?.focus()}
                    onArrowPrev={() => colorRefs.current[idx]?.focus()}
                    placeholder="0"
                  />
                </div>
                {/* Min Stock */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Min</label>
                  <Input
                    ref={(el) => { minStockRefs.current[idx] = el; }}
                    type="number"
                    value={line.min_stock}
                    onChange={(e) => updateAddLine(idx, 'min_stock', e.target.value)}
                    onEnter={() => supplierRefs.current[idx]?.focus()}
                    onArrowNext={() => supplierRefs.current[idx]?.focus()}
                    onArrowPrev={() => stockRefs.current[idx]?.focus()}
                    placeholder="0"
                  />
                </div>
                {/* Supplier */}
                <div className="min-w-0">
                  <label className="mb-0.5 block text-[10px] font-medium text-secondary">Supplier</label>
                  <SearchableSelect
                    ref={(el) => { supplierRefs.current[idx] = el; }}
                    value={line.supplier_id}
                    onValueChange={(v) => updateAddLine(idx, 'supplier_id', v)}
                    options={supplierOptions}
                    placeholder="None"
                    emptyText="No suppliers"
                    onEnter={() => {
                      if (idx < addLines.length - 1) {
                        brandRefs.current[idx + 1]?.focus();
                      } else {
                        addRow();
                        setTimeout(() => brandRefs.current[idx + 1]?.focus(), 60);
                      }
                    }}
                    onArrowNext={() => {
                      if (idx < addLines.length - 1) {
                        brandRefs.current[idx + 1]?.focus();
                      } else {
                        addRow();
                        setTimeout(() => brandRefs.current[idx + 1]?.focus(), 60);
                      }
                    }}
                    onArrowPrev={() => minStockRefs.current[idx]?.focus()}
                  />
                </div>
                {/* Remove */}
                <div className="flex items-end">
                  {addLines.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeAddLine(idx)} className="h-10 px-2">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : `Add ${addLines.length} Item${addLines.length > 1 ? 's' : ''}`}</Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogHeader><DialogTitle>Edit Stock Item</DialogTitle></DialogHeader>
        <DialogContent>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Brand *</label>
            <Select value={editBrand} onValueChange={setEditBrand}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b: any) => (<SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">Size / Spec *</label>
            <Input value={editSize} onChange={(e) => setEditSize(e.target.value)} placeholder="e.g. 6x4 ft, 5L, 2kg" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Category</label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map((c: any) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Type / Spec</label>
              <Input value={editType} onChange={(e) => setEditType(e.target.value)} placeholder="Clear, Grade A…" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">SKU (optional)</label>
              <Input value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="Product code" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Unit</label>
              <Select value={editUnit} onValueChange={setEditUnit}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  <SelectItem value="L">Liters (L)</SelectItem>
                  <SelectItem value="m">Meters (m)</SelectItem>
                  <SelectItem value="sq ft">Square Feet (sq ft)</SelectItem>
                  <SelectItem value="box">Boxes</SelectItem>
                  <SelectItem value="roll">Rolls</SelectItem>
                  <SelectItem value="bag">Bags</SelectItem>
                  <SelectItem value="pair">Pairs</SelectItem>
                  <SelectItem value="set">Sets</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Thickness (optional)</label>
              <Input type="number" value={editThickness} onChange={(e) => setEditThickness(e.target.value)} placeholder="mm" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Color (optional)</label>
              <Input value={editColor} onChange={(e) => setEditColor(e.target.value)} placeholder="Clear, Bronze, Green…" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Current Stock</label>
              <Input type="number" value={editStock} onChange={(e) => setEditStock(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Min Stock</label>
              <Input type="number" value={editMinStock} onChange={(e) => setEditMinStock(e.target.value)} placeholder="0" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-secondary">Supplier</label>
              <Select value={editSupplier} onValueChange={setEditSupplier}>
                <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {suppliers.map((s: any) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
          <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogHeader><DialogTitle>Delete Stock Item</DialogTitle></DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to delete this stock item? All of its transaction history will also be removed. This cannot be undone.
          </p>
          {deleteItem && (
            <div className="rounded-lg border border-border bg-inset p-3 text-sm">
              <div className="text-primary font-medium">
                {deleteItem.brand} · {deleteItem.size}
                {deleteItem.thickness_mm != null ? ` · ${deleteItem.thickness_mm}mm` : ''}
              </div>
              <div className="text-secondary">
                {deleteItem.category_name ?? 'Uncategorized'} · Stock: {deleteItem.current_stock}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteItem(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Brand Management Dialog */}
      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogHeader>
          <DialogTitle>{editBrandTarget ? 'Edit Brand' : 'Manage Brands'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Brand Name *</label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Brand name" />
          </div>
          {!editBrandTarget && (
            <div className="rounded-lg border border-border bg-inset p-3">
              <p className="text-xs text-secondary">Existing brands in this company:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {brands.map((b: any) => (
                  <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-xs text-primary">
                    {b.name}
                    {canManageBrands && (
                      <button onClick={() => openEditBrand(b)} className="text-secondary hover:text-accent">
                        <Pencil className="size-3" />
                      </button>
                    )}
                    {canDeleteBrands && (
                      <button onClick={() => setDeleteBrandTarget(b)} className="text-secondary hover:text-error">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
                {brands.length === 0 && <span className="text-xs text-secondary">No brands yet.</span>}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          {editBrandTarget && (
            <Button variant="secondary" onClick={() => { setEditBrandTarget(null); setBrandName(''); }}>
              New Brand Instead
            </Button>
          )}
          <Button variant="secondary" onClick={() => setBrandOpen(false)}>Close</Button>
          <Button onClick={handleSaveBrand} disabled={saving}>{saving ? 'Saving…' : editBrandTarget ? 'Update' : 'Add Brand'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Brand Confirmation */}
      <Dialog open={!!deleteBrandTarget} onOpenChange={(o) => !o && setDeleteBrandTarget(null)}>
        <DialogHeader><DialogTitle>Delete Brand</DialogTitle></DialogHeader>
        <DialogContent>
          <p className="text-sm text-secondary">
            Are you sure you want to delete <span className="font-medium text-primary">{deleteBrandTarget?.name}</span>?
            Items using this brand will also be deleted. This cannot be undone.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDeleteBrandTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteBrand} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</Button>
        </DialogFooter>
      </Dialog>

      {/* Quick Stock Update Dialog */}
      <Dialog open={quickStockOpen} onOpenChange={setQuickStockOpen} className="max-w-[1100px]">
        <DialogHeader><DialogTitle>Quick Stock Update</DialogTitle></DialogHeader>
        <DialogContent>
          <p className="mb-3 text-xs text-secondary">
            Update quantities for all items at once. Headlines show thickness and color — sizes are listed below each. Type a new quantity, or click "More" next to a size to add extra sheets from another box — the total updates automatically. Only changed values are saved.
          </p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
            <Input
              className="pl-9 pr-8"
              placeholder="Search thickness, size, color, brand…"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
            />
            {quickSearch && (
              <button
                onClick={() => setQuickSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-secondary hover:text-primary transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {(() => {
              const allSorted = [...(rawData ?? [])].sort(inventorySort);
              const filtered = quickSearch.trim()
                ? allSorted.filter((item: any) => inventorySearchRank(item, quickSearch) > 0)
                : allSorted;

              if (filtered.length === 0) {
                return <div className="py-8 text-center text-sm text-secondary">No items match "{quickSearch.trim()}"</div>;
              }

              interface Group { label: string; items: any[]; }
              const groups: Group[] = [];
              let currentLabel = '';
              let currentGroup: any[] = [];
              for (const item of filtered) {
                const mm = item.thickness_mm != null ? `${item.thickness_mm}mm` : 'No Thickness';
                const colorLabel = (item.color ?? 'No Color').trim();
                const label = `${mm} · ${colorLabel}`;
                if (label !== currentLabel) {
                  if (currentGroup.length > 0) groups.push({ label: currentLabel, items: currentGroup });
                  currentLabel = label;
                  currentGroup = [item];
                } else {
                  currentGroup.push(item);
                }
              }
              if (currentGroup.length > 0) groups.push({ label: currentLabel, items: currentGroup });

              const handleArrow = (idx: number, dir: 1 | -1) => {
                const next = idx + dir;
                if (next >= 0 && next < filtered.length) {
                  const el = document.querySelector<HTMLInputElement>(`[data-quick-idx="${next}"]`);
                  el?.focus();
                  el?.select();
                }
              };

              const fmtDate = (d: string | null | undefined) => {
                if (!d) return '';
                const date = new Date(d);
                if (isNaN(date.getTime())) return '';
                return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
              };

              let flatIdx = 0;

              return groups.map((group, gi) => {
                const groupStart = flatIdx;
                flatIdx += group.items.length;
                return (
                  <div key={gi} className="rounded-lg border border-border bg-inset/40 overflow-hidden">
                    <div className="sticky top-0 z-10 bg-inset px-3 py-1.5 text-xs font-semibold text-primary border-b border-border">
                      {group.label}
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((item, j) => {
                        const myIdx = groupStart + j;
                        const lastDate = fmtDate(item.updated_at ?? item.created_at);
                        const oldStock = String(item.current_stock ?? '0');
                        const newVal = quickStockMap[item.id] ?? '';
                        const addMoreVals = quickStockAddMore[item.id] ?? [];
                        const { finalStock, changed, addMoreSum } = computeQuickFinal(item);
                        return (
                          <div key={item.id} className="flex items-center gap-2 bg-raised px-3 py-1.5 hover:bg-inset transition-colors">
                            <div className="min-w-0 flex-[1]">
                              <div className="truncate text-xs font-medium text-primary">
                                {item.size}
                                {item.brand ? <span className="text-secondary font-normal"> · {item.brand}</span> : null}
                              </div>
                              <div className="truncate text-[10px] text-secondary">
                                {item.glass_type ?? '—'} · {item.category_name ?? '—'}
                                {lastDate && <span className="ml-1.5">· updated {lastDate}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-secondary leading-none mb-0.5">Old</span>
                                <div className="w-14 rounded-md border border-border bg-inset px-2 py-1 text-center text-xs text-secondary select-none">
                                  {oldStock}
                                </div>
                              </div>
                              <span className="text-secondary text-xs">→</span>
                              <div className="flex flex-col items-center">
                                <span className="text-[9px] text-secondary leading-none mb-0.5">New</span>
                                <input
                                  type="number"
                                  data-quick-idx={myIdx}
                                  value={newVal}
                                  onChange={(e) => setQuickStockMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); handleArrow(myIdx, 1); }
                                    else if (e.key === 'ArrowUp') { e.preventDefault(); handleArrow(myIdx, -1); }
                                    else if (e.key === 'Enter') { e.preventDefault(); handleArrow(myIdx, 1); }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  className={`w-14 rounded-md border px-2 py-1 text-center text-xs focus:outline-none transition-colors ${
                                    changed
                                      ? 'border-accent bg-accent-weak text-primary font-semibold'
                                      : 'border-border bg-inset text-primary'
                                  }`}
                                  placeholder={oldStock}
                                />
                              </div>
                              {addMoreVals.map((amVal, amIdx) => (
                                <div key={amIdx} className="flex flex-col items-center">
                                  <button
                                    onClick={() => removeAddMore(item.id, amIdx)}
                                    className="mb-0.5 text-secondary hover:text-error transition-colors"
                                    title="Remove"
                                  >
                                    <X className="size-2.5" />
                                  </button>
                                  <div className="relative">
                                    <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-medium text-success">+</span>
                                    <input
                                      type="number"
                                      value={amVal}
                                      onChange={(e) => updateAddMore(item.id, amIdx, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); addMore(item.id); }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      placeholder="0"
                                      className="w-12 rounded-md border border-success/50 bg-success-weak pl-4 pr-1 py-1 text-center text-xs text-primary focus:outline-none transition-colors"
                                    />
                                  </div>
                                </div>
                              ))}
                              <button
                                onClick={() => addMore(item.id)}
                                className="flex flex-col items-center justify-center self-stretch rounded-md border border-dashed border-border px-1.5 text-secondary hover:border-success hover:text-success transition-colors"
                                title="Add more sheets of this size"
                              >
                                <Plus className="size-3.5" />
                                <span className="mt-0.5 text-[8px] leading-none">More</span>
                              </button>
                              <span className="text-[10px] text-secondary w-8">{item.unit ?? 'pcs'}</span>
                              {addMoreSum > 0 && (
                                <span className="whitespace-nowrap text-[10px] font-semibold text-success">
                                  = {finalStock}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="flex items-center gap-2 mr-auto">
            <Button variant="secondary" onClick={() => handleQuickStockExport('pdf')}>
              <FileText className="size-4 mr-1" /> Export PDF
            </Button>
            <Button variant="secondary" onClick={() => handleQuickStockExport('excel')}>
              <FileSpreadsheet className="size-4 mr-1" /> Export Excel
            </Button>
          </div>
          <Button variant="secondary" onClick={() => { setQuickStockOpen(false); setQuickSearch(''); }}>Cancel</Button>
          <Button onClick={handleQuickStockSave} disabled={quickStockSaving}>
            {quickStockSaving ? 'Saving…' : 'Save Updated Quantities'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
