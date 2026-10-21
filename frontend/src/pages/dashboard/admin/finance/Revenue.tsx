import { Link } from 'react-router-dom';
import AdminPage, { panelClass, secondaryClass } from '@/components/dashboard/AdminPage';
export default function Revenue() {
  return <AdminPage title="Báo cáo tài chính">
    <section className={panelClass + ' space-y-4'}>
      <h2 className="text-xl font-black">Báo cáo tổng hợp chưa khả dụng</h2>
      <p className="text-sm text-gray-500">Hiện có thể xem các khoản thu, hoàn và chi đã được ghi nhận trong sổ giao dịch. Báo cáo doanh thu, lợi nhuận và xuất Excel sẽ được bổ sung khi hệ thống hỗ trợ.</p>
      <Link className={secondaryClass} to="/dashboard/admin/finance/transactions">Mở sổ giao dịch</Link>
    </section>
  </AdminPage>;
}
