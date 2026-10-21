import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users, Utensils, ShoppingBag, CheckCircle2 } from 'lucide-react';
import AdminPage, { panelClass, secondaryClass, useAdminResource } from '@/components/dashboard/AdminPage';
import { type DashboardStats, orderStatuses, statusLabels } from '@/lib/admin';

export default function AdminDashboard({ analytics = false }: { analytics?: boolean; }) {
  const resource = useAdminResource<DashboardStats>('/admin/dashboard-stats');
  const stats = resource.data;
  const chart = orderStatuses.map(status => ({ name: statusLabels[status], count: stats?.orders.byStatus[status] ?? 0 }));
  const colors = ['#fbbf24', '#0f766e', '#fb923c', '#6366f1', '#60a5fa', '#22c55e', '#ef4444', '#9ca3af', '#a78bfa'];
  const cards = [
    { label: 'Khách hàng', count: stats?.users.customers, Icon: Users },
    { label: 'Món đang bán', count: stats?.products.foods, Icon: Utensils },
    { label: 'Tổng đơn hàng', count: stats?.orders.total, Icon: ShoppingBag },
    { label: 'Đơn hoàn tất', count: stats?.orders.byStatus.Completed ?? (stats ? 0 : undefined), Icon: CheckCircle2 }
  ];
  return <AdminPage title={analytics ? 'Thống kê vận hành' : 'Bảng quản trị hệ thống'} {...resource} onReload={resource.reload}>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map(({ label, count, Icon }) => <article key={label} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
        <div className="w-12 h-12 bg-[var(--role-accent-soft)] text-[var(--role-accent)] rounded-2xl flex items-center justify-center">
          <Icon size={24} />
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-black mt-1 text-gray-900">
            {count === undefined ? '—' : count.toLocaleString('vi-VN')}
          </p>
        </div>
      </article>)}
    </div>

    {stats && <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

      <section className={panelClass + ' xl:col-span-2 min-w-0'}>
        <h2 className="text-xl font-black text-gray-900">Số đơn theo trạng thái</h2>
        <p className="text-sm text-gray-500 mt-1 mb-6">Thống kê toàn hệ thống tại thời điểm tải dữ liệu.</p>
        <div className="h-[360px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="Số đơn" fill="#f97316" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={panelClass + ' min-w-0'}>
        <h2 className="text-xl font-black text-gray-900">Phân bố đơn hàng</h2>
        {stats.orders.total > 0 ? <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chart} dataKey="count" nameKey="name" innerRadius={55} outerRadius={85}>
                {chart.map((item, index) => <Cell key={item.name} fill={colors[index]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div> : <p className="text-sm text-gray-500 py-12 text-center">Chưa có đơn hàng.</p>}
        <div className="space-y-2">
          {chart.map((item, index) => <div key={item.name} className="flex justify-between text-xs">
            <span className="flex items-center gap-2 text-gray-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[index] }} />
              {item.name}
            </span>
            <strong>
              {item.count}
            </strong>
          </div>)}
        </div>
      </section>
    </div>}

    <section className={panelClass}>
      <h2 className="text-xl font-black text-gray-900 mb-4">Truy cập nhanh</h2>
      <div className="flex flex-wrap gap-3">
        <Link className={secondaryClass} to="/dashboard/admin/users">Quản lý người dùng</Link>
        <Link className={secondaryClass} to="/dashboard/admin/orders">Giám sát đơn hàng</Link>
        <Link className={secondaryClass} to="/dashboard/admin/finance/transactions">Sổ giao dịch</Link>
        <Link className={secondaryClass} to="/dashboard/admin/settings">Giờ chốt bếp</Link>
      </div>
    </section>
  </AdminPage>;
}
