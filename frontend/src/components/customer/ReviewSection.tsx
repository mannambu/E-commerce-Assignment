import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

type ReviewTargetType = 'Food' | 'PT';

type ReviewItem = {
  _id: string;
  reviewerId: string;
  rating: number;
  comment: string;
  images?: string[];
  createdAt?: string;
};

type ReviewSectionProps = {
  targetType: ReviewTargetType;
  targetId?: string;
  title: string;
  canCreateReview?: boolean;
  createBlockedReason?: string;
  sectionId?: string;
};

const renderStars = (value: number) => {
  return [1, 2, 3, 4, 5].map((star) => (
    <Star
      key={star}
      size={16}
      className={star <= value ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}
    />
  ));
};

export default function ReviewSection({
  targetType,
  targetId,
  title,
  canCreateReview = true,
  createBlockedReason,
  sectionId
}: ReviewSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = async () => {
    if (!targetId) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get(`/reviews/${targetType}/${targetId}`);
      const list = res.data?.result;
      setReviews(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể tải danh sách đánh giá.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [targetId, targetType]);

  const myReview = useMemo(() => {
    if (!user?._id) return null;
    return reviews.find((item) => String(item.reviewerId) === String(user._id)) || null;
  }, [reviews, user?._id]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  const submitReview = async () => {
    if (!targetId) return;
    if (!myReview && !canCreateReview) {
      setNotice(createBlockedReason || 'Bạn chưa đủ điều kiện để đánh giá mục này.');
      return;
    }
    if (!comment.trim()) {
      setNotice('Vui lòng nhập nội dung đánh giá.');
      return;
    }

    try {
      setIsSubmitting(true);
      setNotice(null);
      setError(null);

      if (myReview?._id) {
        await api.patch(`/reviews/${myReview._id}`, {
          rating,
          comment: comment.trim()
        });
        setNotice('Đã cập nhật đánh giá của bạn.');
      } else {
        await api.post('/reviews', {
          targetType,
          targetId,
          rating,
          comment: comment.trim()
        });
        setNotice('Đã gửi đánh giá thành công.');
      }

      setComment('');
      setRating(5);
      await fetchReviews();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể gửi đánh giá.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id={sectionId} className="mt-12 rounded-[32px] border border-gray-100 bg-white p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MessageCircle size={24} className="text-orange-500" /> {title}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{reviews.length} đánh giá</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-black text-gray-900">{averageRating || 0}</span>
          <div className="flex items-center gap-1">{renderStars(Math.round(averageRating))}</div>
        </div>
      </div>

      {isAuthenticated ? (
        <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{myReview ? 'Cập nhật đánh giá của bạn' : 'Viết đánh giá của bạn'}</p>
          {!myReview && !canCreateReview ? (
            <p className="text-xs font-medium text-amber-700">{createBlockedReason || 'Bạn chưa đủ điều kiện để đánh giá mục này.'}</p>
          ) : null}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 disabled:opacity-50"
                disabled={!myReview && !canCreateReview}
              >
                <Star
                  size={20}
                  className={star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Chia sẻ trải nghiệm thực tế của bạn..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={!myReview && !canCreateReview}
          />
          <Button onClick={submitReview} disabled={isSubmitting || !targetId || (!myReview && !canCreateReview)}>
            {isSubmitting ? 'Đang gửi...' : myReview ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-600">
          Bạn cần đăng nhập để gửi đánh giá.
        </div>
      )}

      {notice ? <p className="text-sm font-medium text-green-600">{notice}</p> : null}
      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Đang tải đánh giá...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có đánh giá nào cho mục này.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((item) => (
            <article key={item._id} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-800">Người dùng {String(item.reviewerId).slice(-6)}</p>
                <div className="flex items-center gap-1">{renderStars(Number(item.rating || 0))}</div>
              </div>
              <p className="mt-2 text-sm text-gray-600">{item.comment}</p>
              <p className="mt-2 text-xs text-gray-400">
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : ''}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}