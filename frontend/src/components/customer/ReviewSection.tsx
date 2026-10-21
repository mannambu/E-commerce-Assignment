import { useEffect, useMemo, useState, useRef } from 'react';
import { MessageCircle, Star, ImagePlus, X, AlertCircle, CheckCircle2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

type ReviewTargetType = 'Food';

type ReviewItem = {
  _id: string;
  reviewerId: string;
  rating: number;
  comment: string;
  images?: string[];
  createdAt?: string;
  updatedAt?: string;
};

type ReviewSectionProps = {
  targetType: ReviewTargetType;
  targetId?: string;
  title: string;
  canCreateReview?: boolean;
  createBlockedReason?: string;
  sectionId?: string;
};

const renderStars = (value: number, interactive = false, onSelect?: (star: number) => void) => {
  return [1, 2, 3, 4, 5].map((star) => (
    <button
      key={star}
      type="button"
      disabled={!interactive}
      onClick={() => onSelect?.(star)}
      className={cn(
        'transition-transform',
        interactive ? 'cursor-pointer hover:scale-125 focus:outline-hidden' : 'cursor-default'
      )}
    >
      <Star
        size={interactive ? 24 : 16}
        className={star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
      />
    </button>
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
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<number | 'ALL' | 'IMAGE'>('ALL');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Load existing review into editor if user already reviewed
  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating || 5);
      setComment(myReview.comment || '');
      setImages(Array.isArray(myReview.images) ? myReview.images : []);
    }
  }, [myReview]);

  // Check 7-day edit limitation
  const canEditMyReview = useMemo(() => {
    if (!myReview) return true;
    if (!myReview.createdAt) return true;
    const createdAtTime = new Date(myReview.createdAt).getTime();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - createdAtTime <= sevenDaysInMs;
  }, [myReview]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 3) {
      setError('Bạn chỉ có thể tải lên tối đa 3 ảnh cho mỗi đánh giá.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);

      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        const res = await api.post('/medias/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const url = res.data?.result?.[0]?.url || res.data?.result?.url || res.data?.url;
        if (url) {
          setImages((prev) => [...prev, url]);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Tải ảnh lên thất bại. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const submitReview = async () => {
    if (!targetId) return;
    if (!myReview && !canCreateReview) {
      setNotice(createBlockedReason || 'Bạn chưa đủ điều kiện để đánh giá mục này.');
      return;
    }
    if (myReview && !canEditMyReview) {
      setError('Đã quá thời hạn 7 ngày kể từ khi tạo đánh giá. Không thể chỉnh sửa thêm.');
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
          comment: comment.trim(),
          images
        });
        setNotice('Đã cập nhật đánh giá thành công.');
      } else {
        await api.post('/reviews', {
          targetType,
          targetId,
          rating,
          comment: comment.trim(),
          images
        });
        setNotice('Cảm ơn bạn đã gửi đánh giá!');
      }

      await fetchReviews();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Không thể gửi đánh giá.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((item) => {
      if (selectedFilter === 'ALL') return true;
      if (selectedFilter === 'IMAGE') return Array.isArray(item.images) && item.images.length > 0;
      return item.rating === selectedFilter;
    });
  }, [reviews, selectedFilter]);

  return (
    <section id={sectionId} className="mt-12 rounded-[32px] border border-gray-100 bg-white p-6 md:p-8 shadow-xs space-y-8">
      {/* Header and Rating Summary */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-6 border-b border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <MessageCircle size={26} className="text-orange-500" /> {title}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{reviews.length} lượt đánh giá thực tế từ khách hàng</p>
        </div>

        <div className="flex items-center gap-4 bg-orange-50/60 px-6 py-3 rounded-2xl border border-orange-100">
          <span className="text-4xl font-black text-gray-900">{averageRating || 0}</span>
          <div>
            <div className="flex items-center gap-1">{renderStars(Math.round(averageRating))}</div>
            <p className="text-xs text-gray-500 mt-1 font-medium">{reviews.length} nhận xét</p>
          </div>
        </div>
      </div>

      {/* Write / Edit Review Form */}
      {isAuthenticated ? (
        <div className="rounded-3xl border border-orange-200 bg-orange-50/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-base font-bold text-gray-900">
              {myReview ? 'Cập nhật đánh giá của bạn' : 'Viết đánh giá của bạn'}
            </p>
            {myReview && !canEditMyReview && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full font-semibold">
                Quá 7 ngày (Chỉ xem)
              </span>
            )}
          </div>

          {!myReview && !canCreateReview ? (
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle size={16} />
              {createBlockedReason || 'Bạn cần có đơn hàng hoàn thành chứa món này để đánh giá.'}
            </div>
          ) : null}

          {/* Star selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 mr-2 uppercase tracking-wide">Chất lượng:</span>
            {renderStars(rating, Boolean(!myReview || canEditMyReview), (val) => setRating(val))}
            <span className="text-xs font-bold text-orange-600 ml-2">
              {rating === 5 ? 'Tuyệt vời' : rating === 4 ? 'Hài lòng' : rating === 3 ? 'Bình thường' : rating === 2 ? 'Tạm được' : 'Chưa tốt'}
            </span>
          </div>

          {/* Comment text area */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Chia sẻ cảm nhận về hương vị, khẩu phần, độ tươi ngon của món ăn..."
            className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={Boolean(myReview && !canEditMyReview) || (!myReview && !canCreateReview)}
          />

          {/* Image Upload Row */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              {images.map((img, index) => (
                <div key={index} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-gray-200 shadow-xs group">
                  <img src={img} alt="review attachment" className="w-full h-full object-cover" />
                  {(!myReview || canEditMyReview) && (
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}

              {images.length < 3 && (!myReview || canEditMyReview) && (canCreateReview || myReview) && (
                <label className="w-20 h-20 rounded-2xl border-2 border-dashed border-orange-300 hover:border-orange-500 bg-white flex flex-col items-center justify-center cursor-pointer transition-colors text-orange-600">
                  <ImagePlus size={20} />
                  <span className="text-[10px] font-bold mt-1">Thêm ảnh</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>
            {isUploading && <p className="text-xs text-orange-600 font-semibold animate-pulse">Đang tải ảnh lên...</p>}
          </div>

          {/* Submission button */}
          <div className="flex items-center justify-between pt-2">
            <Button
              onClick={submitReview}
              disabled={isSubmitting || !targetId || Boolean(myReview && !canEditMyReview) || (!myReview && !canCreateReview)}
              className="rounded-xl px-6 h-11"
            >
              {isSubmitting ? 'Đang gửi...' : myReview ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
            </Button>
            <p className="text-[11px] text-gray-400">
              {myReview ? 'Có thể cập nhật trong vòng 7 ngày' : 'Đánh giá được kiểm duyệt công khai'}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-600 bg-gray-50/50">
          Vui lòng đăng nhập bằng tài khoản khách hàng để chia sẻ đánh giá món ăn.
        </div>
      )}

      {/* Alerts */}
      {notice && (
        <div className="p-3 bg-green-50 rounded-2xl border border-green-200 text-sm font-semibold text-green-700 flex items-center gap-2">
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 rounded-2xl border border-red-200 text-sm font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Review Filters */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs font-bold text-gray-400 flex items-center gap-1 mr-2">
          <Filter size={14} /> Lọc:
        </span>
        {[
          { key: 'ALL', label: 'Tất cả' },
          { key: 5, label: '5 sao' },
          { key: 4, label: '4 sao' },
          { key: 3, label: '3 sao' },
          { key: 2, label: '2 sao' },
          { key: 1, label: '1 sao' },
          { key: 'IMAGE', label: 'Có ảnh' }
        ].map((flt) => (
          <button
            key={String(flt.key)}
            type="button"
            onClick={() => setSelectedFilter(flt.key as any)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border',
              selectedFilter === flt.key
                ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
            )}
          >
            {flt.label}
          </button>
        ))}
      </div>

      {/* Review List */}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500 font-semibold animate-pulse">
          Đang tải danh sách đánh giá...
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 font-medium">
          Chưa có đánh giá nào phù hợp với bộ lọc.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((item) => (
            <article key={item._id} className="rounded-2xl border border-gray-100 p-5 bg-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 font-black text-sm flex items-center justify-center">
                    {String(item.reviewerId).slice(-2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Khách hàng #{String(item.reviewerId).slice(-6).toUpperCase()}
                      {user?._id && String(item.reviewerId) === String(user._id) ? (
                        <span className="ml-2 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                          Bạn
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">{renderStars(Number(item.rating || 0))}</div>
              </div>

              <p className="text-sm text-gray-700 leading-relaxed pl-12">{item.comment}</p>

              {/* Photos if any */}
              {Array.isArray(item.images) && item.images.length > 0 && (
                <div className="flex items-center gap-3 pl-12 pt-1">
                  {item.images.map((imgUrl, idx) => (
                    <a key={idx} href={imgUrl} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={imgUrl}
                        alt="review"
                        className="w-16 h-16 rounded-xl object-cover border border-gray-200 hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
