# Báo cáo COD — cách kiểm tra

Backend triển khai FR-FIN-001/002/004 cho COD. Manager và Admin Active được đọc; Customer, Kitchen và Delivery bị từ chối. Chưa triển khai Excel (FR-FIN-003), cổng thanh toán hoặc giao diện.

## Quy tắc đã chốt

- Gói tuần tính riêng từng ngày giao Completed, không đợi trạng thái cả gói.
- Chỉ ghi nhận doanh thu khi đã thu đủ tiền món **và phí ship** của ngày đó. Nếu thiếu tiền, khoản đã thu chỉ xuất hiện trong dòng tiền.
- Thu bù/trả lại ghi theo ngày thực tế trong Transaction thành công, múi giờ Việt Nam (UTC+7).
- Doanh thu món, phí ship và dòng tiền được tách riêng. Thu thừa không tăng doanh thu; trả lại phần thừa chỉ giảm dòng tiền. Ngày hủy/chưa Completed không sinh doanh thu món.
- Giá vốn và lãi gộp được ghi cùng kỳ doanh thu món. `grossProfit = foodRevenue - cost`, chưa gồm chi phí vận hành/vận chuyển thực tế.
- `recognizedDeliveryCount` đếm ngày giao đủ điều kiện; `recognizedOrderCount` đếm mã đơn duy nhất có ngày đủ điều kiện trong kỳ. Một gói có thể góp vào nhiều kỳ, không cộng số đơn duy nhất giữa các kỳ để suy ra số đơn toàn kỳ.

Ví dụ: ngày 01/10 giao Completed, món 100.000đ, ship 20.000đ, giá vốn 40.000đ; thu 70.000đ ngày 01/10 và thu bù 50.000đ ngày 02/10. Báo cáo 01/10 có dòng tiền 70.000đ, doanh thu món 0. Báo cáo 02/10 có dòng tiền 50.000đ, doanh thu món 100.000đ, phí ship 20.000đ, giá vốn 40.000đ, lãi gộp 60.000đ.

## Giá vốn

Admin nhập `cost_price` qua API quản lý món: số nguyên không âm; `0` là giá vốn thực bằng 0; `null` hoặc chưa nhập nghĩa là chưa biết. Checkout chụp `costPrice` và `costEstimated` cho từng dòng món. Giá vốn thiếu được ước tính bằng 60% giá bán tại checkout, làm tròn đến đồng cho mỗi suất rồi nhân số lượng.

Sửa giá vốn danh mục không thay đổi đơn đã đặt. Đơn cũ chưa có snapshot được tính 60% giá bán trong đơn, có `legacyCostEstimate: true`; không lấy giá danh mục hiện tại và không tự ghi lại dữ liệu cũ. `estimatedCost` cho biết ngày giao có ít nhất một dòng ước tính. API danh mục công khai và API đơn hàng thông thường không lộ giá vốn; chỉ Admin đọc giá vốn danh mục, Manager/Admin đọc báo cáo.

## API chỉ đọc

Gửi Bearer access token, `from`/`to` dạng `YYYY-MM-DD`, bao gồm cả hai ngày.

| API | Kết quả trong `result` |
| --- | --- |
| `GET /workspace/finance/summary?from=2026-10-01&to=2026-10-02` | `period`, `summary`, `daily`, `byFood`, `deliveryRows`, `warnings` |
| `GET /workspace/finance/deliveries?from=2026-10-01&to=2026-10-02&page=1&limit=20` | `period`, `items`, `page`, `limit`, `total`, `warnings` |

Danh sách lấy ngày giao có lịch giao, hoàn tất hoặc giao dịch thành công trong kỳ; không phải danh sách toàn bộ công nợ tồn từ mọi kỳ trước. Mỗi dòng có mã đơn, khách, ngày giao, `currentStatus`, ngày hoàn tất/ghi nhận, số phải thu, đã thu/hoàn đến cuối kỳ và chênh lệch. `balanceAsOfEnd > 0` là còn thiếu, `< 0` là thu thừa. `currentStatus` là trạng thái hiện tại; các trường `AsOfEnd` chỉ tính tiền trước cuối kỳ đã chọn.

`recognitionStatus`: `Recognized`, `NotCompleted`, `MissingCompletionTime`, `CompletedAfterPeriod`, `AwaitingFullPayment`. `recognizedAt` có thể ở kỳ trước; chỉ `recognizedInRange: true` mới đóng góp doanh thu/giá vốn kỳ này. Khoảng trống trả các tổng bằng 0 và các ngày bằng 0.

Giới hạn: tối đa 366 ngày, 1.000 đơn liên quan và 10.000 giao dịch thành công trong kỳ; vượt dung lượng trả 422 để thu hẹp khoảng, không cắt số liệu âm thầm. Phân trang mặc định 20, tối đa 100 dòng. Ngày sai định dạng trả 422; ngày không tồn tại/khoảng đảo ngược trả 400; thiếu đăng nhập 401, sai quyền 403.

Đọc dữ liệu trong một transaction snapshot. Ledger lệch tổng thu/hoàn, giao dịch không có đơn phù hợp, snapshot sai hoặc hoàn vượt khoản thừa của ngày Completed trả 409 để đối soát. Thiếu thời điểm Completed trả cảnh báo `MISSING_COMPLETION_TIME`, không đoán bằng lịch giao và không ghi nhận doanh thu ngày đó. Không thay đổi tiền, trạng thái đơn hay dữ liệu cũ khi xem báo cáo.

## Kiểm thử

Chạy trong `backend`: `npm test`, `npm run test:finance:integration`, `npm run test:checkout:integration`, `npm run test:foods:integration`, `npm run build`. Integration dùng MongoDB tạm, không dữ liệu vận hành.
