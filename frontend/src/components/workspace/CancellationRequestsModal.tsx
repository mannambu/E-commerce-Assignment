import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import api from '@/services/api';
import { Button } from '@/components/ui/Button';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CancellationRequestsModal({ isOpen, onClose, onSuccess }: Props) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/cancellation-requests');
      setRequests(res.data?.result?.items || res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải yêu cầu hủy COD:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchRequests();
  }, [isOpen]);

  const handleDecision = async (req: any, action: 'Approve' | 'Reject') => {
    try {
      setProcessingId(req._id || req.requestId);
      await api.patch(`/orders/${req.orderId}/cancellation-requests/${req._id || req.requestId}`, {
        action,
        version: req.orderVersion || 0,
        reason: action === 'Approve' ? 'Manager đồng ý cho hủy đơn COD' : 'Manager từ chối yêu cầu hủy đơn COD'
      });
      fetchRequests();
      onSuccess();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Không thể xử lý yêu cầu hủy.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 max-w-2xl w-full border border-white/80 shadow-2xl space-y-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Duyệt yêu cầu hủy đơn (COD)</h3>
              <p className="text-xs text-slate-500">Xem và xử lý các yêu cầu hủy đơn COD của khách hàng</p>
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
              <span>Đang tải danh sách yêu cầu...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2 opacity-60" />
              <p className="text-sm font-semibold">Không có yêu cầu hủy đơn COD nào đang chờ xử lý.</p>
            </div>
          ) : (
            requests.map((req) => (
              <div key={req._id || req.requestId} className="p-4 rounded-2xl border border-slate-200 bg-white/80 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-black text-slate-500">Mã đơn: #{req.orderId?.slice(-8)}</span>
                    <p className="text-xs text-slate-700 font-semibold mt-0.5">Lý do hủy: "{req.reason || 'Khách thay đổi kế hoạch'}"</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                    {req.status || 'Pending'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-100 pt-3">
                  <span>Hoàn tiền dự kiến: <strong className="text-slate-700">{Number(req.refundAmount || 0).toLocaleString('vi-VN')} đ</strong></span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={processingId === (req._id || req.requestId)}
                      onClick={() => handleDecision(req, 'Reject')}
                      className="rounded-xl text-xs text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <XCircle size={14} className="mr-1" /> Từ chối
                    </Button>
                    <Button
                      size="sm"
                      disabled={processingId === (req._id || req.requestId)}
                      onClick={() => handleDecision(req, 'Approve')}
                      className="rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <CheckCircle2 size={14} className="mr-1" /> Duyệt hủy
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}