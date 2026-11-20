import { Outlet } from 'react-router-dom';
import { Nav } from '../components/Nav';
import { useCompany } from '../lib/company';
import { LayoutDashboard, Package, ArrowRightLeft, Truck, Users, UserCircle, BarChart3 } from 'lucide-react';

export default function Layout() {
  const { role } = useCompany();
  const items = [
    { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
    { href: '/inventory', label: 'Inventory', icon: <Package className="size-4" /> },
    { href: '/transactions', label: 'Transactions', icon: <ArrowRightLeft className="size-4" /> },
    { href: '/customers', label: 'Customers', icon: <UserCircle className="size-4" /> },
    { href: '/suppliers', label: 'Suppliers', icon: <Truck className="size-4" /> },
    { href: '/reports', label: 'Reports', icon: <BarChart3 className="size-4" /> },
  ];
  if (role === 'owner' || role === 'admin') {
    items.push({ href: '/members', label: 'Members', icon: <Users className="size-4" /> });
  }
  return (
    <div className="min-h-dvh bg-background">
      <Nav items={items} />
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
