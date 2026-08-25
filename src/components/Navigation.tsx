'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Upload, LayoutDashboard, CheckSquare, FileSpreadsheet, Truck } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Navigation() {
  const pathname = usePathname();
  const [customer, setCustomer] = useState<any>({
    name: 'Apex Freight Logistics',
    code: 'APEX',
    primaryColor: '#0284c7',
  });

  useEffect(() => {
    fetch('/api/customer')
      .then((res) => res.json())
      .then((data) => {
        if (data.customer) setCustomer(data.customer);
      })
      .catch(() => {});
  }, []);

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Documents', href: '/documents', icon: FileText },
    { name: 'Upload', href: '/documents/upload', icon: Upload },
    { name: 'Review Queue', href: '/review-queue', icon: CheckSquare },
    { name: 'Invoices', href: '/invoices', icon: FileSpreadsheet },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & White-Label Brand Title */}
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-lg transition-transform hover:scale-105"
              style={{ backgroundColor: customer.primaryColor || '#0284c7' }}
            >
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-white font-semibold text-lg tracking-tight">
                  {customer.name}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium text-white shadow-sm"
                  style={{ backgroundColor: customer.primaryColor || '#0284c7' }}
                >
                  {customer.code} White-Label
                </span>
              </div>
              <p className="text-xs text-slate-400">Document Automation Engine</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-inner border border-slate-700'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
