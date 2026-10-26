import { useState, useEffect } from 'react';
import { Scale, RefreshCw, XCircle, DollarSign, X, Loader2 } from 'lucide-react';
import api from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CodReconciliationModal({ isOpen, onClose, onSuccess }: Props) {
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

  const [failureReason, setFailureReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reconAmount, setReconAmount] = useState('');
  const [reconRef, setReconRef] = useState('');

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/cod-issues?kind=All&page=1&limit=20');
      setIssues(res.data?.result?.items || res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách sự cố COD:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchIssues();
  }, [isOpen]);

  const handleResolveFailure = async (action: 'Retry' | 'Cancel') => {
    if (!selectedIssue) return;
    try {
      setIsSubmitting(true);
      await api.patch(
        `/orders/${selectedIssue.orderId}/deliveries/${selectedIssue.deliveryId}/failure-resolution`,
        {
          action,
          version: selectedIssue.version || 0,
          reason: failureReason.trim() || (action === 'Retry' ? 'Manager cho phép giao lại' : 'Manager quyết định hủy suất ăn')
        }
      );
      setSelectedIssue(null);
      setFailureReason('');
      fetchIssues();
      onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Xử lý sự cố thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodReconcile = async (action: 'Collect' | 'Refund') => {
    if (!selectedIssue) return;
    const amount = Number(reconAmount);
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post(
        `/orders/${selectedIssue.orderId}/deliveries/${selectedIssue.deliveryId}/cod-reconciliation`,
        {
          action,
          version: selectedIssue.version || 0,
          amount,
          reference: reconRef.trim(),
          reason: action === 'Collect' ? 'Thu bù chênh lệch COD' : 'Trả lại tiền thừa COD'
        }
      );
      setSelectedIssue(null);
      setReconAmount('');
      setReconRef('');
      fetchIssues();
      onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Đối soát COD thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 max-w-3xl w-full border border-white/80 shadow-2xl space-y-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Sự cố & Đối soát COD (WF-24A)</h3>
              <p className="text-xs text-slate-500">Xử lý các đơn giao thất bại và chênh lệch thu tiền COD</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 size={24} className="animate-spin text-teal-600" />
              <span>Đang tải dữ liệu sự cố COD...</span>
            </div>
          ) : issues.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm font-semibold">Hiện tại không có sự cố hoặc chênh lệch COD nào cần xử lý.</p>
            </div>
          ) : (
            issues.map((item) => (
              <div key={item.deliveryId} className="p-4 rounded-2xl border border-slate-200 bg-white/80 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-black text-slate-500">Mã đơn: #{item.orderId?.slice(-8)}</span>
                    <p className="text-xs text-slate-700 font-semibold mt-0.5">Địa chỉ: {item.deliveryAddress}</p>
                    <p className="text-xs text-amber-700 mt-1">Lý do thất bại: {item.failureReason || 'Khách vắng nhà'}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={selectedIssue?.deliveryId === item.deliveryId ? 'default' : 'outline'}
                    onClick={() => setSelectedIssue(selectedIssue?.deliveryId === item.deliveryId ? null : item)}
                    className="rounded-xl text-xs"
                  >
                    {selectedIssue?.deliveryId === item.deliveryId ? 'Đang chọn' : 'Xử lý ngay'}
                  </Button>
                </div>

                {selectedIssue?.deliveryId === item.deliveryId && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 text-xs">
                    <div className="space-y-2">
                      <p className="font-bold text-slate-900">1. Xử lý giao thất bại (Retry / Cancel):</p>
                      <Input
                        placeholder="Lý do xử lý (tùy chọn)..."
                        value={failureReason}
                        onChange={(e) => setFailureReason(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => handleResolveFailure('Cancel')}
                          className="rounded-xl text-xs text-red-600 border-red-200"
                        >
                          <XCircle size={14} className="mr-1" /> Hủy suất ăn này
                        </Button>
                        <Button
                          size="sm"
                          disabled={isSubmitting}
                          onClick={() => handleResolveFailure('Retry')}
                          className="rounded-xl text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          <RefreshCw size={14} className="mr-1" /> Cho phép giao lại (Về Ready)
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 space-y-2">
                      <p className="font-bold text-slate-900">2. Ghi nhận Đối soát tiền COD thực tế:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder="Số tiền (VNĐ)..."
                          value={reconAmount}
                          onChange={(e) => setReconAmount(e.target.value)}
                        />
                        <Input
                          placeholder="Mã tham chiếu / Mã giao dịch..."
                          value={reconRef}
                          onChange={(e) => setReconRef(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => handleCodReconcile('Refund')}
                          className="rounded-xl text-xs"
                        >
                          <DollarSign size={14} className="mr-1" /> Hoàn trả tiền thừa
                        </Button>
                        <Button
                          size="sm"
                          disabled={isSubmitting}
                          onClick={() => handleCodReconcile('Collect')}
                          className="rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white"
                        >
                          <DollarSign size={14} className="mr-1" /> Thu bổ sung COD
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}