## Cơ sở cập nhật và cách đọc

Cập nhật ngày 17/10/2026 theo [phan-hoi-2.md](e:/261/QLDAPM/phan-hoi-2.md) và các xác nhận trực tiếp của chủ yêu cầu. Giữ tên tệp func_request_ver2.0.md; tên SRS v2.2/v2.3 trong phản hồi là thông tin tài liệu nguồn, không phải tuyên bố phát hành một bản SRS đầy đủ mới.

- Câu có mã FR là điều khoản chức năng để triển khai/kiểm thử theo mức ưu tiên ghi kèm. Diễn giải phải thống nhất với FR, không tự tạo quyền hoặc ngoại lệ.
- Chủ yêu cầu đã xác nhận thay quyết định trước: chỉ hủy cả ngày của gói tuần, không hủy từng món; sau cutoff không tiếp nhận hủy thông thường nhưng được đổi món một lần theo FR-ORD-013.
- Đánh giá theo từng món trong ngày giao Completed. Giữ reset bằng mã email theo FR-AUTH-014/015.
- Lựa chọn triển khai, tham chiếu ngoài và điểm chưa chốt được tách ở cuối tài liệu. Đặc tả không chứng minh code/API đã hoàn thành.
- Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh. Cutoff mặc định 20:00 ngày trước ngày giao, Admin được cấu hình; “trước/sau chốt” dùng cutoff áp dụng cho ngày giao, không phải hằng số bất biến.

## **3.2 Yêu cầu chức năng**

### **3.2.1 Xác thực và phân quyền (US-01, 03, 04, 05)**

**Câu chuyện báo cáo — người dùng đi qua các màn hình thế nào.**

_Mục tiêu của cụm này là cho người mới tạo được tài khoản Customer trong 1 phút, người cũ vào đúng khu vực làm việc theo vai trò, kẻ gian không đoán được email tồn tại và không cày được mật khẩu. Ba màn hình chính là WF-01 (đăng ký), WF-03 (đăng nhập) và WF-04 (quên mật khẩu + ma trận quyền)._

**_Màn hình WF-01 đăng ký._** _Khách mở trang công khai, thấy logo, tiêu đề Đăng ký tài khoản, 4 ô nhập họ tên, email, mật khẩu, xác nhận mật khẩu, icon mắt bật tắt, checkbox điều khoản bắt buộc và nút Đăng ký full-width. Sự kiện step-by-step: (1) khách nhập họ tên, email hợp lệ, mật khẩu từ 8 ký tự, xác nhận khớp, tick điều khoản rồi bấm Đăng ký; (2) client validate trước rồi server validate lại, kiểm tra email trùng không phân biệt hoa thường; (3) ổn thì mã hóa Bcrypt, tạo tài khoản role Customer duy nhất, chuyển sang WF-03 kèm banner thành công. Dữ liệu nhập: name, email, password, confirm, acceptTos. Ràng buộc chi tiết: mật khẩu tối thiểu 8 ký tự và phải khớp ô xác nhận, lỗi báo inline từng ô ở cả client và server; email trùng thì báo đúng câu Email đã tồn tại và không tạo gì; chặn double-submit bằng disable nút + spinner; không bao giờ cho tự chọn role nội bộ ở form này, Manager/Kitchen/Delivery chỉ do Admin tạo ở WF-05. Trường hợp biên: bấm Back sau đăng ký xong không tạo trùng; mất mạng giữa chừng thì giữ nguyên dữ liệu đã nhập._

**_Màn hình WF-03 đăng nhập._** _Người dùng nhập email, mật khẩu, rememberMe. Server xác thực Bcrypt, kiểm tra khóa, cấp access 60 phút rồi điều hướng theo FR-AUTH-007. Không ghi nhớ thì hết 60 phút đăng nhập lại; ghi nhớ thì làm mới access âm thầm trong phiên có hạn không hoạt động 7 ngày. Giỏ giữ server. Sai thông tin báo chung Email hoặc mật khẩu chưa đúng; sai 5 lần khóa 15 phút, tái phạm trong 1 giờ nhân đôi tối đa 2 giờ, hiển thị đếm ngược. Đăng xuất/khóa/đổi quyền/đổi mật khẩu thu hồi phiên ngay; refresh không vượt qua thu hồi. Mọi API bảo vệ đều xác minh token và quyền tại server._

**_Màn hình WF-04 quên mật khẩu + đăng xuất + ma trận quyền._** _Người quên mật khẩu nhập email rồi bấm Gửi mã xác nhận; hệ thống gửi mã 6 chữ số qua dịch vụ email SMTP đã cấu hình, hiệu lực 15 phút và dùng 1 lần. Giao diện hiển thị thông báo chung dù email có tồn tại hay không, sau đó cho nhập mã, mật khẩu mới và xác nhận mật khẩu. Mỗi mã được kiểm tra tối đa 5 lần; gửi lại sau ít nhất 60 giây sẽ thay mã cũ và đặt lại số lần thử. Mã hợp lệ và mật khẩu đạt chuẩn thì hệ thống cập nhật Bcrypt, thu hồi mọi phiên cũ và hiển thị thành công kèm nút về WF-03 để đăng nhập lại. Mã sai, hết hạn, đã dùng hoặc hết lượt thì báo lỗi tại form và cho yêu cầu mã mới; lỗi này không kích hoạt refresh token. Reset không tự mở khóa tài khoản. Đăng xuất thì thu hồi JWT phía server rồi về WF-03, bấm Back không vào lại được trang bảo vệ. Ma trận quyền hiển thị ở WF-04 cho người xem, nhưng quyết định chặn thật nằm ở backend trả 403: Customer chỉ chạm thực đơn/đặt/theo dõi/đánh giá; Manager chỉ điều phối đơn; Kitchen chỉ quanh Cooking; Delivery chỉ quanh Delivering; Admin chỉ quản trị. Token giả mạo role thì chữ ký sai và bị từ chối ngay._

**FR-AUTH-001** — Hệ thống phải cho phép khách vãng lai đăng ký tài khoản Khách hàng bằng email và mật khẩu.

Cho phép khách vãng lai tự đăng ký tài khoản Customer bằng email và mật khẩu trên màn hình công khai WF-01 để tạo tài khoản trong 1 phút với vai trò Customer mặc định.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01; Xác minh: kiểm thử.

**FR-AUTH-002** — Hệ thống phải từ chối đăng ký khi mật khẩu ngắn hơn 8 ký tự hoặc ô nhập lại không khớp, và phải hiển thị lỗi tại từng ô ở cả client và server.

Từ chối đăng ký khi mật khẩu dưới 8 ký tự hoặc ô nhập lại không khớp và hiển thị lỗi inline từng ô ở cả client và server trên WF-01 để ngăn mật khẩu yếu và lỗi nhập liệu.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01; Xác minh: kiểm thử.

**FR-AUTH-003** — Hệ thống phải lưu mật khẩu dưới dạng băm Bcrypt và không được lưu mật khẩu dạng rõ.

Lưu mật khẩu duy nhất dưới dạng băm Bcrypt và không lưu dạng rõ để chống lộ mật khẩu khi rò rỉ dữ liệu; áp dụng khi đăng ký trên WF-01 và khi đặt lại trên WF-04.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01, 04; Xác minh: kiểm tra, rà soát.

**FR-AUTH-004** — Hệ thống phải bảo đảm email là duy nhất, không phân biệt hoa/thường; khi email đã tồn tại phải hiển thị "Email đã tồn tại" và không tạo tài khoản.

Bảo đảm email là duy nhất không phân biệt hoa thường và hiển thị đúng câu Email đã tồn tại mà không tạo tài khoản để ngăn trùng lặp trên WF-01.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01; Xác minh: kiểm thử.

**FR-AUTH-005** — Hệ thống không được cho phép gán vai trò Manager, Kitchen Staff, Delivery Staff hoặc Admin qua biểu mẫu đăng ký Khách hàng; bốn vai trò nội bộ này chỉ do Admin tạo ở màn hình WF-05 (US-06).

Cấm gán các vai trò Manager, Kitchen Staff, Delivery Staff và Admin qua biểu mẫu đăng ký Customer trên WF-01 để chống leo thang đặc quyền; bốn vai trò nội bộ chỉ do Admin tạo trên WF-05.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01; Xác minh: kiểm thử.

**FR-AUTH-006** — Hệ thống phải chặn gửi biểu mẫu đăng ký hai lần khi người dùng bấm đúp.

Chặn gửi trùng biểu mẫu đăng ký khi người dùng bấm đúp bằng cách vô hiệu nút và hiện spinner để tránh tạo trùng tài khoản trên WF-01.

- Ưu tiên: Must (bắt buộc); Nguồn: US-01; Xác minh: kiểm thử.

**FR-AUTH-007** — Hệ thống phải xác thực email và mật khẩu, mở phiên JWT và chuyển người dùng tới trang đích theo vai trò: Customer về trang chủ và thực đơn; Manager về bảng đơn WF-24 ở góc nhìn vận hành; Kitchen Staff về WF-24 ở góc nhìn bếp; Delivery Staff về WF-24 ở góc nhìn giao hàng; Admin về quản trị người dùng WF-05.

Xác thực email và mật khẩu, mở phiên JWT rồi điều hướng theo vai trò để người dùng vào đúng khu vực làm việc: Customer về trang chủ và thực đơn, Manager về WF-24 góc vận hành, Kitchen về WF-24 góc bếp, Delivery về WF-24 góc giao, Admin về WF-05.

- Ưu tiên: Must (bắt buộc); Nguồn: US-03; Xác minh: kiểm thử.

**FR-AUTH-008** — Khi đăng nhập thất bại, Hệ thống phải hiển thị thông báo chung "Email hoặc mật khẩu chưa đúng" và không được tiết lộ tài khoản có tồn tại hay không.

Hiển thị thông báo chung Email hoặc mật khẩu chưa đúng khi đăng nhập thất bại và không tiết lộ tài khoản có tồn tại để chống dò email trên WF-03.

- Ưu tiên: Must (bắt buộc); Nguồn: US-03; Xác minh: kiểm thử.

**FR-AUTH-009** — Hệ thống phải khóa tạm tài khoản 15 phút sau 5 lần đăng nhập sai liên tiếp (tái phạm trong 1 giờ nhân đôi, tối đa 2 giờ) và hiển thị đếm ngược đến lúc mở khóa.

Khóa tạm tài khoản 15 phút sau 5 lần sai liên tiếp để chống dò mật khẩu, tái phạm trong 1 giờ nhân đôi tối đa 2 giờ; hiển thị đếm ngược mở khóa trên WF-03.

- Ưu tiên: Must (bắt buộc); Nguồn: US-03; Xác minh: kiểm thử.

**FR-AUTH-010** — Hệ thống phải cấp JWT access có thời hạn 60 phút. Không chọn rememberMe thì phiên kết thúc sau 60 phút và phải đăng nhập lại, không dùng refresh để kéo dài phiên. Có chọn rememberMe thì cho làm mới access âm thầm và duy trì phiên với hạn không hoạt động 7 ngày; sử dụng hợp lệ gia hạn hạn không hoạt động, quá 7 ngày không sử dụng phải đăng nhập lại. Giỏ hàng phải được giữ trên server.

WF-03 gửi lựa chọn ghi nhớ đăng nhập. Refresh không được phục hồi phiên bị thu hồi do đăng xuất, khóa, đổi quyền hoặc đổi/đặt lại mật khẩu. Sự kiện được tính là hoạt động hợp lệ cần chốt tại CĐ-05.

- Ưu tiên: Must (bắt buộc); Nguồn: US-03; Xác minh: kiểm thử.

**FR-AUTH-011** — Hệ thống phải từ chối đăng nhập của tài khoản bị khóa (Locked) và hiển thị lý do cụ thể.

Từ chối đăng nhập của tài khoản ở trạng thái Locked và hiển thị lý do cụ thể để người bị khóa biết nguyên nhân và liên hệ Admin trên WF-03.

- Ưu tiên: Must (bắt buộc); Nguồn: US-03; Xác minh: kiểm thử.

**FR-AUTH-012** — Hệ thống phải thu hồi JWT ở phía server khi người dùng đăng xuất, đổi hoặc đặt lại mật khẩu, hoặc bị khóa.

Thu hồi JWT phía server khi người dùng đăng xuất, đổi hoặc đặt lại mật khẩu, hoặc bị khóa để phiên cũ mất hiệu lực ngay và chống dùng lại token.

- Ưu tiên: Must (bắt buộc); Nguồn: US-04, 06; Xác minh: kiểm thử.

**FR-AUTH-013** — Sau khi đăng xuất, Hệ thống phải chặn việc quay lại trang được bảo vệ bằng nút Back.

Chặn quay lại trang được bảo vệ bằng nút Back sau khi đăng xuất để bảo vệ phiên làm việc trên thiết bị dùng chung; buộc đăng nhập lại trên WF-03.

- Ưu tiên: Must (bắt buộc); Nguồn: US-04; Xác minh: kiểm thử.

**FR-AUTH-014** — Hệ thống phải gửi mã đặt lại mật khẩu gồm 6 chữ số qua email; mã hiệu lực 15 phút, dùng 1 lần và được kiểm tra tối đa 5 lần. Gửi lại sau ít nhất 60 giây phải thay mã cũ và đặt lại số lần thử.

WF-04 sử dụng email và mã xác nhận, không dùng liên kết reset. Mã được gửi qua dịch vụ SMTP đã cấu hình, chỉ lưu dạng băm ở server và không trả qua API. Với email hợp lệ về định dạng, phản hồi gửi mã phải giống nhau dù tài khoản có tồn tại hay không; phản hồi thành công không bảo đảm thư đã đến hộp thư. Giao diện chặn gửi trùng khi đang xử lý, cho sửa email và đếm ngược 60 giây trước khi gửi lại; server quyết định thời hạn và số lần thử. Mã sai, hết hạn, đã dùng hoặc vượt lượt phải báo lỗi tại form mà không tự refresh phiên hay chuyển về đăng nhập. Lỗi kết nối hoặc dịch vụ gửi mã chưa sẵn sàng phải được hiển thị để người dùng thử lại.

- Ưu tiên: Must (bắt buộc); Nguồn: US-04; Xác minh: kiểm thử.

**FR-AUTH-015** — Khi email và mã reset hợp lệ, mật khẩu mới từ 8–50 ký tự, tối đa 72 byte UTF-8 và ô xác nhận khớp, Hệ thống phải cập nhật băm Bcrypt, vô hiệu mã đã dùng và thu hồi mọi phiên cũ.

Kiểm tra mật khẩu và xác nhận ở cả client và server trên WF-04. Sau khi đặt lại thành công, hiển thị thông báo cùng nút về WF-03 để đăng nhập bằng mật khẩu mới; không tự đăng nhập hoặc cấp token mới. Việc đặt lại mật khẩu không tự mở khóa tài khoản bị Admin khóa hoặc đang khóa tạm.

- Ưu tiên: Must (bắt buộc); Nguồn: US-04; Xác minh: kiểm thử.

**FR-AUTH-016** — Hệ thống phải giới hạn quyền theo 5 vai trò: Customer đặt món, xem đơn của mình, tự hủy khi chưa trả tiền hoặc gửi yêu cầu hủy khi đã trả tiền theo FR-ORD-015/017/018, theo dõi sức khỏe và đánh giá món đã giao; Manager xác nhận/từ chối Pending, duyệt hủy hợp lệ, gán/đổi shipper, xử lý Failed và đối soát; Kitchen Staff bắt đầu nấu và báo sẵn sàng trong ca; Delivery Staff chỉ nhận/giao phần được gán, ghi kết quả và COD thực thu; Admin quản trị tài khoản, danh mục, cấu hình, xem tài chính và chỉ can thiệp vận hành như ngoại lệ có lý do/audit.

Hủy phụ thuộc đồng thời thanh toán, trạng thái chế biến và cutoff. Manager xác nhận Pending → Confirmed; chỉ Kitchen Staff chuyển Confirmed → Cooking.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-017** — Hệ thống phải trả mã 403 khi request truy cập trang hoặc API trái vai trò, đồng thời ẩn hẳn menu và nút không thuộc quyền của vai trò đó trên WF-04 và WF-24 (ví dụ Customer không thấy nút confirm đơn, bếp không thấy nút duyệt hủy hay trường tiền).

Trả mã 403 khi truy cập trang hoặc API trái vai trò và ẩn hẳn menu cùng nút ngoài quyền trên WF-04 và WF-24 để chống thao tác trái phép từ giao diện lẫn API.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-018** — Hệ thống phải xác minh chữ ký JWT ở mọi API được bảo vệ và từ chối token có chữ ký sai hoặc claim vai trò bị sửa; server là nơi duy nhất quyết định quyền, không tin vai trò do client gửi lên.

Xác minh chữ ký JWT ở mọi API được bảo vệ và từ chối token có chữ ký sai hoặc claim vai trò bị sửa để server là nơi duy nhất quyết định quyền mà không tin client.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-019** — Thay đổi quyền của người dùng giữa phiên phải có hiệu lực từ API call kế tiếp; khi Admin khóa tài khoản, đổi vai trò hoặc thu hồi quyền thì phiên cũ của người đó phải mất hiệu lực ngay và người đó bị chuyển về trang đăng nhập.

Áp dụng thay đổi quyền từ API call kế tiếp và vô hiệu phiên cũ ngay khi Admin khóa, đổi vai trò hoặc thu hồi quyền rồi chuyển người đó về trang đăng nhập để chặn quyền cũ còn sót.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-020** — Hệ thống phải chặn Kitchen Staff ở phía server khỏi mọi thao tác ngoài khâu bếp: bếp chỉ được chuyển Confirmed thành Cooking (bắt đầu nấu) và báo món sẵn sàng để giao, không được sửa giá hay tiền, không được tự hủy đơn, không được gán shipper và không được xem báo cáo tài chính.

Chặn Kitchen Staff ở phía server khỏi mọi thao tác ngoài khâu bếp để giữ đúng phận sự nấu nướng trên WF-24; bếp chỉ được chuyển Confirmed thành Cooking và báo món sẵn sàng, không được sửa giá tiền, tự hủy đơn, gán shipper hay xem báo cáo tài chính.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-021** — Hệ thống phải chặn Delivery Staff ở phía server khỏi mọi thao tác ngoài khâu giao: shipper chỉ được thao tác trên đơn đã gán cho mình gồm nhận hàng, xuất phát, giao thành công (với COD phải nhập số tiền thực thu) hoặc giao thất bại kèm lý do và minh chứng, không được sửa món hay giá và không được tự tạo đơn.

Chặn Delivery Staff ở phía server khỏi mọi thao tác ngoài khâu giao để giữ đúng phận sự vận chuyển trên WF-24; shipper chỉ thao tác đơn gán cho mình gồm nhận hàng, xuất phát, giao thành công với COD nhập tiền thực thu hoặc giao thất bại kèm lý do và minh chứng, không được sửa món giá hay tự tạo đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

**FR-AUTH-022** — Hệ thống phải cho phép Admin xem báo cáo tài chính để giám sát nhưng phải chặn Admin đổi trạng thái đơn trong luồng thường ngày; khi Admin buộc phải can thiệp vào đơn (ví dụ chỉnh tiền sau khiếu nại), màn hình phải bắt nhập lý do và hệ thống phải ghi audit log gồm ai làm, đơn nào, thay đổi gì và lúc nào.

Cho phép Admin xem báo cáo tài chính để giám sát nhưng chặn đổi trạng thái đơn trong luồng thường ngày để giữ tách bạch vận hành và quản trị; khi buộc can thiệp ngoại lệ thì màn hình bắt nhập lý do và ghi audit log gồm người làm, đơn nào, thay đổi gì và lúc nào.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05; Xác minh: kiểm thử.

_Customer tự đăng ký; Admin tạo Active với đúng một trong bốn vai trò nội bộ. Manager xem Pending, chỉ xác nhận online đã có IPN thành công hoặc COD; từ chối kèm lý do/hoàn theo FR-ORD-019. Hủy đã trả tiền phải còn đủ điều kiện trước cutoff và chưa nấu tại FR-ORD-018. Bếp xử lý Confirmed → Cooking → Ready trong ca, không thấy tiền; shipper chỉ nhận/giao phần được gán và ghi COD thực thu. Failed giao lại về Ready; quá 24 giờ chưa xử lý job hủy/hoàn. Admin chỉ can thiệp vận hành như ngoại lệ có lý do/audit._

### **3.2.2 Quản trị người dùng (US-06)**

**Câu chuyện báo cáo — Admin quản trị người dùng trên màn hình WF-05 thế nào.**

_Mục tiêu của cụm này là để Admin kiểm soát truy cập của cả 5 vai trò trên một màn hình WF-05 duy nhất mà vẫn giữ tách bạch vận hành và quản trị. Màn hình gồm tiêu đề Quản lý người dùng, bộ lọc theo vai trò và trạng thái, ô tìm kiếm theo email và tên, bảng người dùng có phân trang và các nút tạo tài khoản nội bộ, khóa và mở khóa (FR-PTL-001, FR-PTL-002)._

_Sự kiện step-by-step: (1) Admin mở WF-05 xem danh sách rồi lọc theo vai trò, trạng thái hoặc tìm theo email, tên; (2) bấm tạo, nhập email và chọn đúng một vai trò nội bộ rồi bấm lưu, hệ thống kiểm tra định dạng và trùng email rồi tạo tài khoản và ghi audit log, Customer không do Admin tạo mà tự đăng ký ở WF-01; (3) mở hồ sơ, chọn khóa hoặc mở, nhập lý do bắt buộc rồi xác nhận, khi khóa hệ thống kết thúc mọi phiên đang mở và lần đăng nhập sau người bị khóa thấy đúng lý do (FR-PTL-001, FR-PTL-003, FR-PTL-005). Dữ liệu nhập gồm email, vai trò, từ khóa và lý do. Ràng buộc là Admin cuối cùng không được tự khóa hay tự hạ cấp, Admin chỉ xem báo cáo để giám sát mà không đổi trạng thái đơn trong luồng thường ngày, mọi can thiệp vào đơn đều là ngoại lệ phải nhập lý do và ghi audit log (FR-PTL-004, FR-PTL-006)._

_Trường hợp biên: Admin cuối cùng cố tự khóa thì nút xác nhận bị chặn để hệ thống không mất người quản trị; tài khoản đang mở phiên ở thiết bị khác thì phiên cũ mất hiệu lực ngay từ API call kế tiếp và người đó bị chuyển về trang đăng nhập._

**FR-PTL-001** — Hệ thống phải cho Admin tạo tài khoản nội bộ bằng email, gán đúng một trong bốn vai trò Manager, Kitchen Staff, Delivery Staff hoặc Admin; tài khoản Active và có thể đăng nhập ngay. Customer tự đăng ký ở WF-01, không do Admin tạo.

Không có bước chờ kích hoạt hoặc email kích hoạt trong phạm vi đã chốt. Chỉ Admin được gọi chức năng tạo; danh sách vai trò có thể gán không phải danh sách vai trò được quyền gọi API.

- Ưu tiên: Must (bắt buộc); Nguồn: US-06; Xác minh: kiểm thử.

**FR-PTL-002** — Hệ thống phải cho phép Admin liệt kê và tìm người dùng thuộc cả 5 vai trò theo vai trò, trạng thái và từ khóa (email, tên), có phân trang trên màn hình WF-05.

Cho phép Admin liệt kê và tìm người dùng cả 5 vai trò theo vai trò, trạng thái và từ khóa email hoặc tên có phân trang trên WF-05 để quản trị tập trung trên một màn hình duy nhất.

- Ưu tiên: Must (bắt buộc); Nguồn: US-06; Xác minh: kiểm thử.

**FR-PTL-003** — Hệ thống phải cho phép Admin khóa và mở khóa tài khoản kèm lý do bắt buộc; khi khóa, Hệ thống phải kết thúc mọi phiên đang mở của tài khoản đó và thông báo lý do cho người bị khóa ở lần đăng nhập kế tiếp.

Cho phép Admin khóa và mở khóa tài khoản kèm lý do bắt buộc để kiểm soát truy cập vi phạm; khi khóa thì kết thúc mọi phiên đang mở và hiển thị lý do ở lần đăng nhập kế tiếp trên WF-03.

- Ưu tiên: Must (bắt buộc); Nguồn: US-06; Xác minh: kiểm thử.

**FR-PTL-004** — Hệ thống không được cho phép Admin cuối cùng tự khóa hoặc tự hạ cấp.

Cấm Admin cuối cùng tự khóa hoặc tự hạ cấp để hệ thống không rơi vào trạng thái mất người quản trị trên WF-05.

- Ưu tiên: Must (bắt buộc); Nguồn: US-06; Xác minh: kiểm thử.

**FR-PTL-005** — Mọi thao tác tạo tài khoản nội bộ, khóa, mở khóa và gán vai trò, cùng mọi can thiệp ngoại lệ của Admin vào đơn, đều phải được ghi audit log gồm người thực hiện, đối tượng, nội dung thay đổi, lý do và thời điểm.

Ghi audit log cho mọi thao tác tạo tài khoản nội bộ, khóa, mở khóa, gán vai trò cùng mọi can thiệp ngoại lệ của Admin vào đơn để hậu kiểm; mỗi bản ghi gồm người thực hiện, đối tượng, nội dung thay đổi, lý do và thời điểm.

- Ưu tiên: Must (bắt buộc); Nguồn: US-06; Xác minh: kiểm thử.

**FR-PTL-006** — Hệ thống phải cho phép Admin xem báo cáo tài chính và file Excel đã xuất để giám sát, nhưng không được cho phép Admin đổi trạng thái đơn trong luồng thường ngày; mọi can thiệp của Admin vào đơn đang vận hành đều là ngoại lệ, bắt buộc nhập lý do và ghi audit log để hậu kiểm (SoD: Manager vận hành đơn ≠ Admin quản trị).

Cho phép Admin xem báo cáo tài chính và file Excel đã xuất để giám sát nhưng cấm đổi trạng thái đơn trong luồng thường ngày để giữ nguyên tắc SoD là Manager vận hành đơn còn Admin quản trị; mọi can thiệp vào đơn đang vận hành đều là ngoại lệ bắt nhập lý do và ghi audit log.

- Ưu tiên: Must (bắt buộc); Nguồn: US-05, 06; Xác minh: kiểm thử.

_Chi tiết luồng quản trị của FR-PTL-001 đến FR-PTL-006 diễn ra như sau. Màn hình WF-05 là bàn làm việc của Admin, gồm bộ lọc theo vai trò và ô tìm kiếm, bảng người dùng có phân trang và các nút tạo, khóa, mở khóa. Luồng tạo người chạy từng bước như sau: Admin bấm tạo, nhập email và chọn vai trò là Manager, Kitchen Staff, Delivery Staff hoặc Admin, rồi bấm lưu; hệ thống kiểm tra email đúng định dạng và chưa tồn tại, vai trò thuộc danh sách cho phép, sau đó tạo tài khoản ở trạng thái Active, có thể đăng nhập ngay và ghi audit log ai đã tạo ai. Manager không có nút này nên không thể tự tạo đàn em cho mình, đúng tinh thần SoD. Luồng khóa và mở khóa cũng tương tự: Admin mở hồ sơ người dùng, chọn khóa, nhập lý do cụ thể (ví dụ nghỉ việc, vi phạm đối soát), rồi bấm xác nhận; hệ thống đá hết phiên đang mở của người đó ra, lần đăng nhập sau người đó thấy đúng lý do bị khóa. Ràng buộc an toàn là Admin cuối cùng không được tự khóa hay tự hạ cấp chính mình để hệ thống không rơi vào cảnh không còn ai quản trị. Riêng FR-PTL-006 cần đọc kỹ vì đây là chỗ sửa sai của mô hình cũ: trước đây Admin bị chặn hẳn khỏi báo cáo tài chính, còn Manager bị chặn hẳn khỏi đơn hàng, khiến người cần số thì không có đơn để đối chiếu còn người cần xử lý đơn thì không có quyền. Mô hình mới cho Admin được xem báo cáo để giám sát, nhưng khóa quyền đổi trạng thái đơn trong ngày thường; ngược lại Manager được toàn quyền điều phối đơn nhưng không được tạo tài khoản hay sửa cấu hình. Khi Admin buộc phải đụng vào đơn thì màn hình bắt nhập lý do và hệ thống ghi đủ audit log, nên vừa linh hoạt xử lý ngoại lệ vừa giữ được kiểm soát._

### **3.2.3 Hồ sơ sức khỏe và chỉ số BMR/TDEE/Target (US-07, 08, 09)**

**Câu chuyện báo cáo — khách khai hồ sơ và nhận chỉ số BMR/TDEE/Target trên WF-06 và WF-07 thế nào.**

_Mục tiêu của cụm này là biến số đo cơ thể thành Target calo đáng tin để mọi gợi ý sau đó có chuẩn để bám. Màn hình WF-06 là khảo sát ba bước gồm bước một nhập chiều cao, cân nặng, tuổi và giới tính, bước hai chọn mức vận động trong năm mức và mục tiêu giảm, tăng hoặc giữ, bước ba tick dị ứng và ghi chú kiêng kỵ, cuối trang là nút Quay lại và nút Lưu và tính chỉ số (FR-HLT-001, FR-HLT-003). Khách chưa có hồ sơ mà mở thực đơn thì hệ thống chuyển về trang khảo sát này (FR-HLT-004)._

_Sự kiện step-by-step: (1) khách nhập đủ trường rồi bấm Lưu và tính chỉ số, hệ thống kiểm tra miền giá trị rồi lưu hồ sơ và gắn dị ứng để lọc mọi gợi ý sau đó; (2) hệ thống tính BMR theo Mifflin-St Jeor, nhân với hệ số vận động 1,2–1,9 ra TDEE, rồi điều chỉnh theo mục tiêu ra Target với mặc định giảm −15%, tăng +10% và giữ nguyên 0%; (3) mở WF-07 thấy ba thẻ BMR, TDEE và Target kèm giải thích dễ hiểu, số hiển thị làm tròn kcal nguyên, rồi bấm Xem thực đơn gợi ý để sang WF-08 (FR-HLT-005, FR-HLT-006, FR-HLT-007, FR-HLT-009). Khi Target tính ra thấp hơn BMR thì hệ thống nâng Target bằng đúng BMR và hiện cảnh báo an toàn, khi thiếu trường thì báo chưa đủ dữ liệu chứ không tự suy số (FR-HLT-008, FR-HLT-010)._

_Sửa cân nặng/vận động/mục tiêu thì tính lại ngay và lưu lịch sử; đổi mục tiêu giữa tuần áp dụng thực đơn từ tuần lịch thứ Hai–Chủ nhật kế tiếp. Miền bắt buộc: 100–250 cm, 25–300 kg, 10–100 tuổi; nhóm 10–15 tuổi chỉ Duy trì. Biến động >5%/7 ngày hoặc >3 kg/tuần cần cảnh báo và xác nhận. Xác nhận phụ huynh và >10 kg/tháng thuộc diễn giải/TBD của tài liệu nguồn, chưa phải FR bắt buộc trong phạm vi này; xem cuối tài liệu._

**FR-HLT-001** — Hệ thống phải cho phép Khách hàng khai hồ sơ sức khỏe gồm chiều cao, cân nặng, tuổi, giới tính, mức vận động (5 mức), mục tiêu (giảm/tăng/giữ), dị ứng và ghi chú.

Cho phép Customer khai hồ sơ sức khỏe gồm chiều cao, cân nặng, tuổi, giới tính, mức vận động trong 5 mức, mục tiêu giảm tăng giữ, dị ứng và ghi chú trên khảo sát 3 bước WF-06 để làm đầu vào cho mọi gợi ý.

- Ưu tiên: Must (bắt buộc); Nguồn: US-07; Xác minh: kiểm thử.

**FR-HLT-002** — Hệ thống phải kiểm tra miền giá trị: chiều cao 100–250 cm, cân nặng 25–300 kg, tuổi 10–100; mục tiêu giảm cân từ 16 tuổi, 10–15 tuổi chỉ Duy trì.

Kiểm tra miền giá trị chiều cao 100–250 cm, cân nặng 25–300 kg, tuổi 10–100 và quy tắc tuổi mục tiêu để bảo đảm an toàn; giảm cân từ 16 tuổi, 10–15 tuổi chỉ Duy trì kèm xác nhận phụ huynh trên WF-06.

- Ưu tiên: Must (bắt buộc); Nguồn: US-07; Xác minh: kiểm thử.

**FR-HLT-003** — Hệ thống phải lưu dị ứng vào hồ sơ và dùng làm dữ liệu lọc cho mọi gợi ý sau đó.

Lưu dị ứng vào hồ sơ và dùng làm dữ liệu lọc cho mọi gợi ý món và thực đơn sau đó để tránh đề xuất món gây dị ứng trên WF-08.

- Ưu tiên: Must (bắt buộc); Nguồn: US-07; Xác minh: kiểm thử.

**FR-HLT-004** — Khi Khách hàng chưa có hồ sơ mà vào thực đơn, Hệ thống phải chuyển về trang khảo sát.

Chuyển Customer chưa có hồ sơ về trang khảo sát WF-06 khi mở thực đơn để buộc có đủ dữ liệu tính Target trước khi gợi ý.

- Ưu tiên: Must (bắt buộc); Nguồn: US-07; Xác minh: kiểm thử.

**FR-HLT-005** — Hệ thống phải tính BMR theo Mifflin-St Jeor (công thức tại §1.4).

Tính BMR theo công thức Mifflin-St Jeor tại §1.4 để có mức năng lượng nghỉ chuẩn xác làm nền cho TDEE và Target.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-006** — Hệ thống phải tính TDEE = BMR × hệ số vận động trong khoảng 1,2–1,9 ứng với 5 mức vận động (bảng hệ số nằm trong dữ liệu seed).

Tính TDEE bằng BMR nhân hệ số vận động trong khoảng 1,2–1,9 tương ứng 5 mức vận động theo bảng hệ số trong dữ liệu seed để phản ánh chi tiêu năng lượng thực tế.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-007** — Hệ thống phải tính Target = TDEE ± điều chỉnh theo mục tiêu: giảm −15% mặc định (cấu hình −15 đến −20%), tăng +10%, duy trì ±0%.

Tính Target từ TDEE điều chỉnh theo mục tiêu để định lượng calo ăn vào: giảm trừ 15% mặc định trong khung cấu hình trừ 15 đến 20%, tăng cộng 10%, duy trì cộng trừ 0%.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-008** — Khi Target tính ra thấp hơn BMR, Hệ thống phải nâng Target bằng đúng BMR và hiển thị cảnh báo "Target đã nâng lên = BMR để đảm bảo an toàn".

Nâng Target bằng đúng BMR và hiển thị cảnh báo Target đã nâng lên bằng BMR để đảm bảo an toàn khi Target tính ra thấp hơn BMR trên WF-07.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-009** — Hệ thống phải hiển thị BMR, TDEE và Target kèm giải thích dễ hiểu, làm tròn kcal thành số nguyên khi hiển thị và lưu 1 chữ số thập phân.

Hiển thị BMR, TDEE và Target kèm giải thích dễ hiểu trên thẻ WF-07 để khách hiểu ý nghĩa chỉ số; số hiển thị làm tròn kcal nguyên và lưu một chữ số thập phân.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-010** — Khi thiếu dữ liệu đầu vào, Hệ thống phải hiển thị "chưa đủ dữ liệu" và không được tự suy ra số liệu.

Hiển thị chưa đủ dữ liệu và không tự suy ra số liệu khi thiếu trường đầu vào để tránh chỉ số sai lệch trên WF-07.

- Ưu tiên: Must (bắt buộc); Nguồn: US-08; Xác minh: kiểm thử.

**FR-HLT-011** — Khi Khách hàng sửa cân nặng, mức vận động hoặc mục tiêu, Hệ thống phải tính lại chỉ số ngay và lưu dòng lịch sử.

Tính lại chỉ số ngay và lưu dòng lịch sử khi Customer sửa cân nặng, mức vận động hoặc mục tiêu trên WF-07 để theo dõi biến động sức khỏe liên tục.

- Ưu tiên: Must (bắt buộc); Nguồn: US-09; Xác minh: kiểm thử.

**FR-HLT-012** — Khi cân nặng đổi >5% trong 7 ngày hoặc >3 kg/tuần, Hệ thống phải cảnh báo và yêu cầu xác nhận trước khi lưu.

Cảnh báo và yêu cầu tick xác nhận trước khi lưu khi cân nặng đổi trên 5% trong 7 ngày hoặc trên 3 kg mỗi tuần để chặn nhập nhầm và phát hiện biến động bất thường trên WF-07.

- Ưu tiên: Must (bắt buộc); Nguồn: US-09; Xác minh: kiểm thử.

**FR-HLT-013** — Khi Khách hàng đổi mục tiêu giữa tuần, Hệ thống phải tính lại chỉ số và lưu lịch sử ngay theo FR-HLT-011, nhưng áp dụng mục tiêu mới cho chu kỳ thực đơn từ tuần lịch kế tiếp, thứ Hai đến Chủ nhật theo múi giờ nghiệp vụ.

Chu kỳ kế tiếp bắt đầu 00:00 thứ Hai tiếp theo; không tự sửa thực đơn/đơn đã chốt của tuần hiện tại. Target trên thanh theo dõi trong thời gian chờ cần chốt tại CĐ-06.

- Ưu tiên: Must (bắt buộc); Nguồn: US-09; Xác minh: kiểm thử.

### **3.2.4 Gợi ý thực đơn (US-10, 11)**

**Câu chuyện báo cáo — engine gợi ý chạy thế nào trên màn hình WF-08.**

_Mục tiêu là khách mở Thực đơn hôm nay là ăn được ngay đúng mục tiêu mà không phải tự tính calo hay tự nhớ dị ứng. Màn hình WF-08 gồm header Target và phần trăm bám sát, tab Hôm nay/Cả tuần, nhãn Đã lọc dị ứng, 3 thanh macro ngày, 4 bữa sáng/trưa/tối/phụ kèm calo và nút Đổi món, nút Thêm cả ngày vào giỏ và Đặt cả tuần._

_Khách mở WF-08 ngày/tuần. Engine lọc tuyệt đối dị ứng, ghép bốn bữa hướng tới ±10% Target và macro 30/40/30 ±5 điểm %, mỗi món lặp tối đa hai lần/tuần. Đổi món hiển thị 3–5 lựa chọn trong ±15% calo món gốc, lọc dị ứng và xếp theo calo/macro; tổng ngày ngoài ngưỡng mềm ±10% cần cảnh báo và xác nhận giữ. Thiếu món hiển thị gần đúng/quá ít món hợp, không nới dị ứng. Checkout khóa sửa thực đơn gốc; gói tuần có đổi riêng theo FR-ORD-013, gồm một lần sau cutoff._

**FR-MNU-001** — Hệ thống phải gợi ý thực đơn ngày gồm sáng, trưa, tối, phụ, hướng tới tổng năng lượng ±10% Target; đây là ngưỡng mềm. Ngoài ngưỡng phải hiển thị chênh lệch/cảnh báo và cho Khách hàng xác nhận giữ lựa chọn.

Phân biệt thực đơn đạt ngưỡng với thực đơn gần đúng/được chấp nhận ngoài ngưỡng. Không nới quy tắc loại trừ dị ứng theo FR-MNU-003.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: kiểm thử.

**FR-MNU-002** — Hệ thống phải cân đối macro của thực đơn ngày xấp xỉ 30% đạm / 40% tinh bột / 30% béo (dung sai ±5 điểm %).

Cân đối macro ngày quanh mốc 30% đạm, 40% tinh bột, 30% béo với dung sai ±5 điểm phần trăm và hiển thị trên 3 thanh macro của WF-08.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: kiểm thử.

**FR-MNU-003** — Hệ thống phải loại tuyệt đối mọi món chứa nguyên liệu gây dị ứng của Khách hàng và hiển thị nhãn "Đã lọc dị ứng: …".

Loại tuyệt đối mọi món chứa nguyên liệu gây dị ứng của Khách hàng trước khi ghép bữa và hiển thị nhãn Đã lọc dị ứng trên WF-08 nhằm đảm bảo an toàn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: kiểm thử.

**FR-MNU-004** — Hệ thống phải gợi ý thực đơn tuần 7 ngày, trong đó mỗi món lặp tối đa 2 lần.

Gợi ý thực đơn tuần 7 ngày trên tab Cả tuần của WF-08, trong đó mỗi món lặp tối đa 2 lần để tránh đơn điệu.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: kiểm thử.

**FR-MNU-005** — Khi danh mục món không đủ để đạt các ràng buộc, Hệ thống phải gắn cờ "thực đơn gần đúng" thay vì hiển thị trang trống.

Khi danh mục món quá mỏng không ráp đủ ràng buộc thì gắn cờ thực đơn gần đúng có ghi rõ nội dung đã nới thay vì trả trang trống trên WF-08.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: kiểm thử.

**FR-MNU-006** — Khi số món hợp lệ quá ít do nhiều dị ứng, Hệ thống phải hiển thị trạng thái "Quá ít món hợp" kèm nút liên hệ cố vấn.

Khi dị ứng quá nhiều khiến số món hợp lệ quá ít thì hiển thị trạng thái Quá ít món phù hợp kèm nút liên hệ cố vấn trên WF-08.

- Ưu tiên: Must (bắt buộc); Nguồn: US-10; Xác minh: trình diễn (demo cuối sprint).

**FR-MNU-007** — Hệ thống phải cung cấp 3–5 món thay thế có năng lượng trong ±15% so với món gốc, đã lọc dị ứng, xếp theo độ giống calo và macro.

Cung cấp 3–5 món thay thế trong popover Đổi món của WF-08, có năng lượng trong ±15% so với món gốc, đã lọc dị ứng và xếp theo độ tương đồng calo và macro.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

**FR-MNU-008** — Sau đổi món, Hệ thống phải tính lại tổng ngày, so sánh với ngưỡng mềm ±10% Target và hiển thị chênh lệch; vượt ngưỡng thì cảnh báo và cho Khách hàng xác nhận giữ món.

Không chặn chỉ vì vượt ±10%; vẫn kiểm tra dị ứng và các ràng buộc áp dụng khác.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

**FR-MNU-009** — Khi không còn món thay phù hợp, Hệ thống phải hiển thị "Không còn món thay phù hợp".

Khi không còn món thay nào phù hợp ràng buộc thì hiển thị thông báo Không còn món thay phù hợp trên WF-08 thay vì gợi ý sai chuẩn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

**FR-MNU-010** — Hệ thống phải khóa sửa món trực tiếp trên thực đơn đã đặt hàng; riêng gói tuần được đổi món của ngày giao qua luồng FR-ORD-013.

Đây là ngoại lệ trên ngày giao của gói tuần, không mở lại thực đơn đã đặt để sửa tùy ý và không mở swap đơn lẻ sau checkout.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

### **3.2.5 Danh mục và chi tiết món ăn (US-13, 14)**

**Câu chuyện báo cáo — khách chọn món lẻ ngoài thực đơn ở WF-10/WF-11.**

_Mục tiêu là giúp khách chọn món lẻ với đầy đủ thông tin dinh dưỡng và cảnh báo an toàn. Màn hình WF-10 là lưới card món gồm ảnh, tên, kcal, giá, nhãn mục tiêu, nhãn dị ứng, nút thêm giỏ và phân trang, kèm thanh tìm kiếm, lọc mục tiêu/khoảng calo, toggle loại trừ dị ứng của tôi bật mặc định và sắp xếp giá/calo. Màn hình WF-11 là trang chi tiết gồm ảnh 4:3, kcal, bảng P/C/F theo gram, giá, thành phần, dải cảnh báo trùng dị ứng, tồn kho còn lại, chọn số lượng, nút Thêm vào giỏ và link đánh giá._

_Sự kiện step-by-step: (1) khách mở danh mục, thấy lưới món đang bán và còn hàng; (2) nhập từ khóa, lọc, sắp xếp thì danh sách cập nhật có phân trang; (3) mở một món sang chi tiết để đọc bảng dinh dưỡng và tồn kho; (4) chọn số lượng rồi bấm Thêm vào giỏ. Dữ liệu nhập: từ khóa tìm kiếm, bộ lọc mục tiêu/dị ứng/khoảng calo, kiểu sắp xếp, số lượng. Ràng buộc chi tiết: tìm kiếm chuẩn hóa dấu tiếng Việt có dấu và không dấu đều ra; món trùng dị ứng của user thì gắn nhãn đỏ gồm icon và chữ ở cả lưới và banner đầu trang chi tiết, không bao giờ chỉ báo bằng màu; hết hàng thì nút thêm giỏ vô hiệu kèm nhãn Hết hàng; món bị Admin ẩn hoặc xóa khi đang xem thì thao tác tiếp theo báo Món không còn kinh doanh; ảnh lỗi thì hiện placeholder giữ layout; không khớp lọc thì hiện trạng thái trống thân thiện kèm nút xóa lọc._

**FR-CAT-001** — Hệ thống phải hiển thị danh mục món dạng lưới gồm ảnh, tên, kcal, giá, tag mục tiêu; chỉ liệt kê món đang bán và còn hàng.

Hiển thị danh mục món dạng lưới trên WF-10 gồm ảnh, tên, kcal, giá và tag mục tiêu, chỉ liệt kê món đang bán và còn hàng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-13; Xác minh: kiểm thử.

**FR-CAT-002** — Hệ thống phải hỗ trợ tìm kiếm món theo từ khóa, kể cả tiếng Việt không dấu.

Hỗ trợ tìm kiếm món theo từ khóa trên WF-10, chuẩn hóa tiếng Việt có dấu và không dấu để Khách hàng tìm nhanh.

- Ưu tiên: Must (bắt buộc); Nguồn: US-13; Xác minh: kiểm thử.

**FR-CAT-003** — Hệ thống phải hỗ trợ lọc món theo mục tiêu, dị ứng, calo; sắp xếp theo giá, calo; và phân trang.

Hỗ trợ lọc món theo mục tiêu, dị ứng và khoảng calo, sắp xếp theo giá và calo kèm phân trang trên WF-10.

- Ưu tiên: Must (bắt buộc); Nguồn: US-13; Xác minh: kiểm thử.

**FR-CAT-004** — Hệ thống phải gắn nhãn cảnh báo đỏ (icon + chữ) cho món chứa dị ứng của Khách hàng.

Gắn nhãn cảnh báo đỏ gồm icon kèm chữ cho món chứa dị ứng của Khách hàng ngay trên lưới WF-10, không báo bằng màu sắc đơn thuần.

- Ưu tiên: Must (bắt buộc); Nguồn: US-13; Xác minh: kiểm thử.

**FR-CAT-005** — Trang chi tiết món phải hiển thị ảnh, kcal, bảng P/C/F, danh sách nguyên liệu, dị ứng và số lượng còn.

Trang chi tiết WF-11 hiển thị ảnh, kcal, bảng P/C/F theo gram, thành phần, dị ứng, giá và số lượng còn để Khách hàng quyết định trước khi thêm vào giỏ.

- Ưu tiên: Must (bắt buộc); Nguồn: US-14; Xác minh: kiểm thử.

**FR-CAT-006** — Khi món hết hàng, Hệ thống phải vô hiệu hóa nút "Thêm vào giỏ".

Khi món hết hàng thì vô hiệu hóa nút Thêm vào giỏ trên WF-11 kèm nhãn Hết hàng để chặn đặt món không còn tồn kho.

- Ưu tiên: Must (bắt buộc); Nguồn: US-14; Xác minh: kiểm thử.

**FR-CAT-007** — Khi món chứa dị ứng của Khách hàng, Hệ thống phải hiển thị dải cảnh báo đỏ ở đầu trang chi tiết.

Khi món chứa dị ứng của Khách hàng thì hiển thị dải cảnh báo đỏ ở đầu trang chi tiết WF-11 để cảnh báo trước khi chọn số lượng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-14; Xác minh: kiểm thử.

**FR-CAT-008** — Khi món bị ẩn hoặc xóa, Hệ thống phải hiển thị "Không còn bán"; khi ảnh lỗi phải hiển thị ảnh giữ chỗ.

Khi món bị Admin ẩn hoặc xóa thì hiển thị Không còn bán cho thao tác tiếp theo, còn khi ảnh lỗi thì hiển thị ảnh giữ chỗ để giữ bố cục WF-11.

- Ưu tiên: Must (bắt buộc); Nguồn: US-14; Xác minh: kiểm thử.

### **3.2.6 Giỏ hàng, đặt hàng và combo tuần (US-17, 18, 30)**

**Câu chuyện báo cáo — giỏ hàng, đặt hàng và combo tuần chạy qua WF-14, WF-15, WF-26 thế nào.**

_WF-14 lưu giỏ server lẻ/tuần, món/bữa/ngày/số lượng/giá/ship tạm tính, dòng thiếu hàng chặn checkout. WF-15 tạo Pending, thanh toán hiển thị riêng với tiến trình sáu bước gồm Ready. WF-26 là một đơn gói bảy ngày, mỗi ngày bốn bữa, đúng 28 bữa khi mua; trạng thái riêng từng ngày. Ship gói thu một lần ngày đầu, các ngày sau miễn theo FR-ORD-012._

_Khách chọn món, xem lịch/chính sách rồi đặt với idempotency key; tạo Pending và xử lý kho trong ACID. Gói tuần đủ bảy ngày/bốn bữa mỗi ngày, báo thiếu món và lựa chọn thay trước thanh toán. Online IPN ghi Paid nhưng vẫn chờ Manager; COD cũng chờ Manager. Manager chuyển Confirmed để bếp tiếp nhận, không trực tiếp bắt đầu nấu. Hủy/đổi ngày theo FR-ORD-013/015/017/018._

_Online chưa trả có mốc chung 15 phút giữ kho/thanh toán; Pending đã Paid chờ Manager không bị job quá hạn hủy. Hủy thông thường phải chưa Cooking và trước cutoff: chưa trả tự hủy, đã trả Manager duyệt. Gói chỉ hủy cả ngày; sau cutoff không hủy nhưng đổi một lần trong ngày theo FR-ORD-013. Failed xử lý riêng; chỉ chuyển trạng thái theo bảng hợp lệ._

_Luồng chính Pending, Confirmed, Cooking, Ready, Delivering, Completed; Rejected kết thúc từ chối, Cancelled kết thúc hủy, Failed chờ xử lý. Checkout tranh hàng cuối/gửi lại phải chống vượt kho/trùng đơn. Hủy ngày hợp lệ hoàn tiền các bữa đã thu trong 3–5 ngày làm việc, không hoàn riêng ship; toàn gói trước giao ngày đầu hoàn cả ship. Ngày Completed mở review từng món/cộng calo ngay; trạng thái tổng gói phục vụ theo dõi/thống kê riêng._

**FR-ORD-001** — Hệ thống phải lưu giỏ hàng ở server (món, số lượng, ngày giao, đơn giá) và đồng bộ giữa các thiết bị.

Lưu giỏ hàng ở server gồm món, số lượng, ngày giao và đơn giá trên WF-14 để đồng bộ giữa các thiết bị của Khách hàng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-17; Xác minh: kiểm thử.

**FR-ORD-002** — Hệ thống phải cho phép thêm món vào giỏ từ trang món hoặc trang thực đơn ở chế độ lẻ hoặc chế độ tuần.

Cho phép thêm món vào giỏ từ trang chi tiết món hoặc trang thực đơn ở cả chế độ lẻ và chế độ tuần trên WF-14.

- Ưu tiên: Must (bắt buộc); Nguồn: US-17; Xác minh: kiểm thử.

**FR-ORD-003** — Hệ thống phải hiển thị tổng tiền cập nhật trực tiếp và phí ship tạm tính.

Hiển thị tổng tiền cập nhật trực tiếp và phí ship tạm tính trong giỏ WF-14 để Khách hàng thấy chi phí trước khi checkout.

- Ưu tiên: Must (bắt buộc); Nguồn: US-17; Xác minh: kiểm thử.

**FR-ORD-004** — Hệ thống phải gắn cờ dòng hết hàng trong giỏ và chặn đặt hàng cho đến khi dòng đó được xử lý.

Gắn cờ dòng hết hàng trong giỏ WF-14 và chặn đặt hàng cho đến khi Khách hàng xử lý dòng đó nhằm tránh chốt đơn thiếu hàng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-17; Xác minh: kiểm thử.

**FR-ORD-005** — Khi Khách hàng chốt địa chỉ và lịch giao, Hệ thống phải tạo đơn Pending và khóa tồn kho trong cùng một giao dịch ACID.

Khi Khách hàng chốt địa chỉ và lịch giao trên WF-15 thì tạo đơn Pending và khóa tồn kho trong cùng một giao dịch ACID để tránh mất đồng bộ kho và đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-006** — Hệ thống phải giữ tồn kho cho online chưa thanh toán trong 15 phút, trùng hạn thanh toán và hiển thị một mốc đếm ngược; quá hạn không có IPN thành công phải hủy/nhả kho theo FR-PAY-007. Đơn đã trả tiền còn Pending chờ Manager không được nhả kho hoặc tự hủy chỉ vì còn Pending.

IPN thành công xử lý kho theo FR-PAY-003; hủy/từ chối hợp lệ điều chỉnh phần kho liên quan đúng một lần. Hạn thanh toán online không áp dụng cho COD.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-007** — Khi nhiều đơn đặt song song cho hàng cuối, Hệ thống phải cho đơn đủ hàng trước thắng và báo thiếu hàng theo từng dòng cho đơn còn lại.

Khi nhiều đơn tranh suất hàng cuối song song thì đơn commit đủ hàng trước thắng, đơn còn lại báo thiếu hàng theo từng dòng trên WF-15.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-008** — Hệ thống phải dùng idempotency key để chặn tạo đơn trùng khi client gửi lại request.

Dùng idempotency key để chặn tạo đơn trùng khi client gửi lại request do mạng chập chờn trên WF-15.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-009** — Mục Đơn của tôi phải hiển thị tiến trình Pending → Confirmed → Cooking → Ready → Delivering → Completed kèm thời điểm và các nhánh Rejected, Cancelled, Failed; gói tuần hiển thị tiến trình riêng từng ngày dưới mã gói chung.

Thanh toán có nhãn riêng; đã trả tiền không có nghĩa Manager đã xác nhận. Timeline gồm Ready để khớp bàn giao bếp/shipper.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-010** — Hệ thống chỉ được thực hiện chuyển trạng thái trong bảng hợp lệ; chặn chuyển ngược tùy ý như Delivering → Pending. Failed → Ready là ngoại lệ giao lại do Manager thực hiện theo FR-ORD-023.

Không dùng cấm lùi tuyệt đối để chặn giao lại. Completed, Rejected, Cancelled không được mở lại qua luồng thường ngày.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, 28; Xác minh: kiểm thử.

**FR-ORD-011** — Khi Khách hàng chọn Đặt cả tuần, Hệ thống phải tạo một đơn gói, một mã theo dõi, gồm 7 ngày giao liên tiếp, mỗi ngày đủ 4 bữa sáng/trưa/tối/phụ, tổng cộng đúng 28 bữa khi đặt. Không cho checkout thiếu ngày/bữa, không tách thành một đơn mẹ và bảy đơn con.

Bảy dòng là bảy kỳ giao, mỗi kỳ chứa các món của bốn bữa, không phải bảy dòng món. Hủy ngày sau mua theo FR-ORD-015 không phải mua gói thiếu ngày.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-012** — Hệ thống phải thu phí ship cả gói một lần tại ngày 1 và hiển thị miễn phí ngày 2–7. Với COD, khi hủy hợp lệ ngày 1, miễn khoản ship ghi trên ngày đó; đã thu thì khoản ship được đưa vào yêu cầu hoàn. Không chuyển phí ship sang ngày khác. Hủy ngày 2–7 không phát sinh thêm khoản hoàn ship. Hủy toàn gói hợp lệ trước lần giao ngày đầu tiên hoàn cả phí ship đã thu.

Quyết định cập nhật ngày 20/10/2026 cho COD thay quy tắc giữ phí ship khi hủy riêng ngày đầu. Giữ giá/ship gốc để đối chiếu; ghi khoản giảm và số thực hoàn riêng. Khi hoàn toàn gói phải trừ phần đã hoàn hoặc đang chờ hoàn trước đó để không hoàn lặp. Phương thức online được đồng bộ ở bước thanh toán riêng.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-013** — Hệ thống phải cho đặt khung giờ giao cố định cho cả gói. Trước cutoff từng ngày được đổi món ngày đó; sau cutoff không tiếp nhận hủy thông thường và chỉ được đổi món một lần trong ngày giao đó, không thay đổi số tiền ngày/gói. Cutoff mặc định 20:00 hôm trước, Admin được cấu hình theo FR-ADM-015.

Không chuyển món sang ngày khác. Vẫn kiểm tra dị ứng, kho và cảnh báo calo. Thời điểm cuối được đổi sau cutoff so với Cooking/Ready/Delivering cần chốt tại CĐ-02. Cùng đơn giá và giờ giao mặc định 12:00 của weekly-orders.md chưa phải điều khoản SRS.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-014** — Khi một ngày trong combo thiếu món, Hệ thống phải gắn cờ kèm món thay thế trước khi thanh toán.

Khi một ngày trong combo thiếu món thì gắn cờ kèm món thay thế trên WF-26 trước khi thanh toán để Khách hàng chốt phương án.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-015** — Hệ thống chỉ hỗ trợ hủy toàn bộ một ngày giao trong gói tuần, không hủy lẻ món. Ngày hủy phải chưa Cooking và còn trước cutoff; chưa trả tự hủy theo FR-ORD-017, đã trả yêu cầu Manager duyệt theo FR-ORD-018. Hủy hợp lệ giảm 100% tiền các bữa của ngày đó; phần đã thu được hoàn trong 3–5 ngày làm việc. Ship theo FR-ORD-012.

Chưa thu thì giảm số phải trả, không tạo khoản hoàn giả. Hủy toàn gói phải thỏa điều kiện của các ngày liên quan; trước giao ngày đầu hoàn cả ship đã thu. Ngày hủy Cancelled, không cộng calo; hủy cả bảy ngày thì gói Cancelled. Hiển thị chính sách trước xác nhận. Sau cutoff chỉ đổi theo FR-ORD-013; Failed là ngoại lệ riêng theo FR-ORD-023.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-016** — Hệ thống phải hỗ trợ Pending → Confirmed → Cooking → Ready → Delivering → Completed; Pending có thể kết thúc Rejected; hủy hợp lệ kết thúc Cancelled. Delivering → Failed mở nhánh ngoại lệ FR-ORD-023, không phải kết thúc bất biến. Mỗi chuyển đổi phải ghi người thực hiện hoặc tác nhân hệ thống và thời điểm.

Thanh toán lưu riêng. Với gói tuần, chế biến/giao/hủy áp dụng từng ngày, trạng thái tổng theo FR-ORD-026 không thay lịch sử ngày.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-017** — Hệ thống phải cho Khách hàng tự hủy đơn/ngày giao của mình khi chưa trả tiền, đang Pending hoặc Confirmed, chưa Cooking và còn trước cutoff áp dụng; giải phóng/trả phần kho chưa chế biến đúng một lần và ghi lý do Khách tự hủy.

Các điều kiện phải đồng thời đúng; chưa thanh toán không tạo quyền hủy sau chốt hoặc sau bắt đầu nấu. Gói tuần chỉ hủy cả ngày; đúng thời điểm cutoff được tính là đã chốt.

Đơn COD lẻ dùng chung cấu hình cutoff chốt bếp với gói tuần, mặc định 20:00 hôm trước và cho Admin cấu hình. Khoản đã thu để phân biệt tự hủy/yêu cầu duyệt được xác định trên phần giao bị hủy; tiền đã thu của ngày khác không biến ngày chưa thu thành ngày đã thanh toán.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-018** — Với đơn/ngày giao đã trả tiền, còn Pending hoặc Confirmed, chưa Cooking và trước cutoff, Hệ thống phải cho gửi yêu cầu hủy chờ Manager duyệt. Duyệt hợp lệ thì hủy phần tương ứng, hoàn 100% khoản được hoàn theo chính sách áp dụng và trả kho chưa chế biến; từ chối thì đơn tiếp tục xử lý, thông báo lý do real-time.

Lưu yêu cầu/kết quả riêng, không thêm trạng thái đơn. Điều kiện chưa nấu và trước cutoff phải còn đúng khi duyệt. Gói tuần áp dụng tiền món/ship theo FR-ORD-012/015. Không nhận hủy thông thường từ Cooking trở đi; Failed và khiếu nại là ngoại lệ riêng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-019** — Hệ thống phải cho Manager từ chối Pending kèm lý do như hết nguyên liệu/quá tải/ngoài khu vực; chuyển Rejected, trả kho đã giữ/trừ chưa chế biến và không chuyển tiếp Cooking. Nếu đã trả tiền, Hệ thống phải tự động xử lý hoàn 100% khoản đã thu của phần bị từ chối, tránh hoàn trùng.

Từ chối toàn đơn hoàn toàn bộ khoản đã thu gồm ship. Luồng tự động phải tạo yêu cầu và thực hiện hoàn qua phương thức thanh toán tương ứng; yêu cầu Pending chưa đồng nghĩa tiền đã về. Lưu kết quả hoàn thực tế riêng trong Transaction và thông báo khách; lỗi hoàn phải được ghi nhận để đối soát, không đánh dấu đã hoàn chỉ từ thao tác từ chối.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-020** — Hệ thống phải tách bước bếp thành hai nhịp: bếp bấm bắt đầu nấu để chuyển Confirmed → Cooking, nấu xong bấm món sẵn sàng để chuyển Cooking → Ready; bếp không được sửa giá, tiền, không được tự hủy đơn và không thấy báo cáo tài chính.

Tách bước bếp thành hai nhịp bấm Bắt đầu nấu để chuyển Confirmed sang Cooking và bấm Món sẵn sàng để chuyển Cooking sang Ready trên WF-24; bếp không được sửa giá tiền, tự hủy đơn hay xem báo cáo tài chính.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-021** — Hệ thống phải cho phép Manager gán và đổi shipper cho đơn ở trạng thái Ready; shipper chỉ thấy đơn gán cho mình, bấm nhận hàng và xuất phát để chuyển Ready → Delivering.

Cho Manager gán và đổi shipper cho đơn ở trạng thái Ready trên WF-24; shipper chỉ thấy đơn gán cho mình và bấm nhận hàng xuất phát để chuyển Ready sang Delivering.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-022** — Hệ thống phải cho phép shipper ghi nhận kết quả giao: giao thành công (Delivering → Completed; đơn COD phải nhập số tiền thực thu) hoặc giao thất bại kèm lý do bắt buộc và ảnh minh chứng khi cần (khách vắng nhà, sai địa chỉ, món hỏng), chuyển đơn sang Failed.

Cho shipper ghi nhận kết quả giao trên WF-24, giao thành công thì chuyển Delivering sang Completed và đơn COD phải nhập số tiền thực thu, giao thất bại thì nhập lý do bắt buộc kèm ảnh minh chứng để chuyển sang Failed.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-023** — Khi đơn/ngày giao Failed, Hệ thống phải cho Manager chọn giao lại Failed → Ready rồi gán shipper, hoặc hủy/hoàn Failed → Cancelled; không cho Failed → Delivering trực tiếp. Nếu vẫn Failed chưa xử lý sau 24 giờ kể từ lần vào Failed đó, Hệ thống phải tự hủy phần thất bại, tự động xử lý hoàn 100% khoản đã thu thuộc phần đó, ghi audit log và thông báo.

Shipper nhận hàng/xuất phát từ Ready trước Delivering. Job và Manager chống xử lý/hoàn lặp; chưa thu không phát sinh hoàn. Yêu cầu hoàn và kết quả hoàn thực tế được ghi riêng như FR-ORD-019. Gói tuần chỉ xử lý ngày Failed; phí ship ngoại lệ cần chốt CĐ-03. Không tự trả món đã nấu/hỏng thành hàng bán được.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-024** — Hệ thống phải chặn chuyển ngoài bảng hợp lệ, gồm Delivering → Cooking hoặc mở lại Completed; ngoại lệ giao lại chỉ Failed → Ready theo FR-ORD-023. Chỉ phần giao Completed mới mở đánh giá món và tự ghi calo.

Ngày gói tuần Completed mở đánh giá từng món và ghi calo ngay, không chờ toàn gói. Ngày Cancelled/Rejected/Failed không tự ghi calo hoặc mở review. Tick đã ăn và nhập tay là nguồn độc lập theo FR-TRK-006.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-26; Xác minh: kiểm thử.

**FR-ORD-025** — Hệ thống phải cho Khách hàng gửi khiếu nại về phần giao trong vòng 24 giờ sau nhận hàng; xử lý qua luồng ngoại lệ có lý do/audit, không mở lại quyền hủy thông thường hoặc tự chuyển Completed sang trạng thái khác.

Gửi khiếu nại không tự tạo quyền hoàn 100%; tiền/hàng phải có quyết định theo phân quyền. Chi tiết bằng chứng, kết quả và hạn giải quyết cần chốt CĐ-07.

- Ưu tiên: Must (bắt buộc); Nguồn: phản hồi mục 4, US-28; Xác minh: kiểm thử.

**FR-ORD-026** — Hệ thống phải lưu tiến trình bảy ngày trong cùng một đơn gói. Cả bảy ngày Completed thì gói Completed; cả bảy ngày Cancelled thì gói Cancelled. Đánh giá và calo xét ngay theo từng ngày Completed, độc lập trạng thái tổng.

Gói có cả ngày Completed và Cancelled/Rejected cần chốt cách tổng hợp tại CĐ-04; không vì vậy trì hoãn review/calo ngày đã giao.

- Ưu tiên: Must (bắt buộc); Nguồn: phản hồi mục 3, 9, US-30; Xác minh: kiểm thử.

**Vận hành đơn trong ngày — từ lúc đặt tới lúc giao xong:**

1. Tạo Pending. Online có hạn 15 phút; IPN ghi Paid/chốt kho nhưng vẫn Pending. COD chưa thu và cũng chờ Manager.
2. Manager xác nhận Pending → Confirmed; online phải đã xác minh thanh toán. Từ chối chuyển Rejected, trả kho chưa chế biến, tự khởi tạo hoàn khoản đã thu của phần bị từ chối.
3. Bếp nhận Confirmed trong ca rồi bấm bắt đầu nấu → Cooking; nấu xong → Ready. Manager xác nhận không thay thao tác bắt đầu nấu.
4. Manager gán shipper cho Ready; shipper được gán nhận hàng/xuất phát → Delivering.
5. Giao thành công → Completed và ghi COD thực thu; thất bại → Failed kèm lý do/minh chứng.
6. Failed được Manager giao lại về Ready hoặc hủy/hoàn; nếu chưa xử lý sau 24 giờ, job hủy/hoàn phần đó. Với gói tuần áp dụng từng ngày, không tự hủy ngày khác.
7. Hủy thông thường chỉ khi chưa nấu và trước cutoff: chưa trả tự hủy, đã trả Manager duyệt. Khiếu nại trong 24 giờ sau nhận hàng là luồng ngoại lệ riêng.

**Bảng chuyển hợp lệ cho đơn lẻ hoặc từng ngày giao gói tuần:**

| Chuyển đổi | Tác nhân | Điều kiện / hệ quả |
| --- | --- | --- |
| Pending → Confirmed | Manager | Online đã IPN thành công hoặc COD; chưa bắt đầu nấu. |
| Pending → Rejected | Manager | Lý do; trả kho chưa chế biến; đã thu thì khởi tạo hoàn 100% phần bị từ chối. |
| Pending → Cancelled | Customer / Manager / job | Khách tự hủy hoặc Manager duyệt theo FR-ORD-017/018; job chỉ online quá hạn chưa có IPN thành công. |
| Confirmed → Cancelled | Customer / Manager | Chưa nấu, trước cutoff; chưa trả tự hủy, đã trả phải duyệt. |
| Confirmed → Cooking | Kitchen Staff | Thuộc ca; online đã xác minh thanh toán. |
| Cooking → Ready | Kitchen Staff | Hoàn tất chế biến; không mở hủy thông thường. |
| Ready → Delivering | Delivery Staff | Shipper được gán nhận hàng/xuất phát. |
| Delivering → Completed | Delivery Staff | Giao thành công; nhập COD thực thu. |
| Delivering → Failed | Delivery Staff | Lý do bắt buộc, minh chứng theo FR-ORD-022. |
| Failed → Ready | Manager | Chọn giao lại rồi gán shipper; không nhảy Delivering. |
| Failed → Cancelled | Manager / job | Manager hủy/hoàn hoặc job sau 24 giờ chưa xử lý; audit/thông báo, không hoàn lặp. |

Không có hủy thông thường từ Cooking/Ready/Delivering. Can thiệp khiếu nại/ngoại lệ phải theo FR-ADM-010/015 có lý do/audit, không mặc nhiên cấp API đổi mọi trạng thái sang Cancelled. Completed/Rejected/Cancelled không mở lại qua luồng chuẩn. Failed → Ready là ngoại lệ giao lại được phép.

### **3.2.7 Thanh toán và tự hủy (US-19, 20)**

**Câu chuyện báo cáo — tiền chạy qua màn hình WF-16 thế nào.**

_WF-16 hiển thị số tiền, VNPay/MoMo/COD và mốc 15 phút cho online chưa trả. Thanh toán thành công ghi rõ đã thanh toán, chờ Manager khi còn Pending; không hiển thị như đã xác nhận vận hành. Thanh toán thất bại được thử lại trong hạn; hủy quá hạn có nút Đặt lại._

_Khách redirect sang cổng; trang kết quả không đổi trạng thái. Server xác minh chữ ký, mã đơn, số tiền IPN; giao dịch hợp lệ ghi Paid, chốt kho, Transaction nhưng giữ Pending. Manager xác nhận rồi bếp mới tiếp nhận/bắt đầu nấu. COD cũng chờ Manager và chỉ thu khi giao. Job 15 phút chỉ xử lý online Pending chưa có IPN thành công; chữ ký sai bị từ chối/log. IPN/job tranh chấp phải khóa cập nhật, bên commit trước thắng, không thu/hoàn/nhả kho lặp; callback muộn không mở lại đơn hủy. COD không thuộc job này._

**FR-PAY-001** — Hệ thống phải hỗ trợ ba phương thức thanh toán: VNPay, MoMo (redirect + IPN) và COD.

Hỗ trợ ba phương thức thanh toán VNPay, MoMo theo redirect kèm IPN và COD trên WF-16 để Khách hàng lựa chọn khi chốt đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-002** — Trạng thái thanh toán online chỉ được xác định bởi IPN/webhook có chữ ký hợp lệ; trang redirect phía client không được làm thay đổi trạng thái đơn.

Trạng thái thanh toán online chỉ được xác định bởi IPN có chữ ký hợp lệ, trang redirect phía client không được làm thay đổi trạng thái đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-003** — Khi IPN hợp lệ xác nhận thanh toán thành công cho đơn còn hợp lệ, Hệ thống phải ghi Paid, chốt kho đang giữ thành trừ kho thật và ghi Transaction trong cùng giao dịch; không tự chuyển trạng thái vận hành Confirmed hoặc Cooking. Đơn vẫn Pending chờ Manager.

Giữ trách nhiệm chốt kho tại IPN của đặc tả trước nhưng tách xác nhận vận hành. Chỉ Manager chuyển Confirmed, sau đó bếp bắt đầu nấu. Job quá hạn không hủy Pending đã Paid; callback muộn/đơn kết thúc cần đối soát, không mở lại đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-004** — Với COD, Hệ thống phải tạo Pending với thanh toán chưa thu và chờ Manager chuyển Confirmed; chỉ thu lúc giao, Delivery Staff nhập số thực thu.

COD không tự Confirmed khi đặt và không thuộc job hết hạn online. Giữ/trừ kho khi COD chờ Manager cần chốt CĐ-01, không suy từ hạn online 15 phút.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-005** — Khi IPN có chữ ký không hợp lệ, Hệ thống phải từ chối và ghi log cảnh báo.

Khi IPN có chữ ký không hợp lệ thì từ chối, giữ nguyên đơn Pending và ghi log cảnh báo để chống giả mạo thanh toán.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-006** — Khi Khách hàng bỏ giữa chừng ở cổng thanh toán, Hệ thống phải giữ đơn ở Pending để thanh toán tiếp trong hạn 15 phút.

Khi Khách hàng bỏ giữa chừng ở cổng thanh toán thì giữ đơn ở Pending để thanh toán tiếp trong hạn 15 phút trên WF-16.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-007** — Hệ thống phải có job tự hủy đơn Pending thanh toán online quá 15 phút không có IPN thành công, ghi lý do "Quá hạn thanh toán" và nhả hàng.

Job tự hủy chuyển đơn online Pending quá 15 phút không có IPN thành công sang Cancelled với lý do Quá hạn thanh toán, đồng thời nhả hàng và hiện nút Đặt lại.

- Ưu tiên: Must (bắt buộc); Nguồn: US-20; Xác minh: kiểm thử.

**FR-PAY-008** — Hệ thống phải hiển thị nút "Đặt lại" một chạm trên chi tiết đơn đã bị tự hủy.

Hiển thị nút Đặt lại một chạm trên chi tiết đơn đã bị tự hủy để Khách hàng đặt lại nhanh mà không nhập lại giỏ.

- Ưu tiên: Must (bắt buộc); Nguồn: US-20; Xác minh: kiểm thử.

**FR-PAY-009** — Khi IPN và job tự hủy xử lý cùng một đơn đồng thời, Hệ thống phải khóa dòng dữ liệu để bên commit trước thắng.

Khi IPN và job tự hủy xử lý cùng một đơn đồng thời thì khóa dòng dữ liệu để bên commit trước thắng, tránh xung đột xác nhận và hủy.

- Ưu tiên: Must (bắt buộc); Nguồn: US-20; Xác minh: kiểm thử.

**FR-PAY-010** — Job tự hủy phải lũy đẳng và không được áp dụng cho đơn COD.

Job tự hủy phải lũy đẳng chống chạy trùng nhiều instance và không được áp dụng cho đơn COD.

- Ưu tiên: Must (bắt buộc); Nguồn: US-20; Xác minh: kiểm thử.

### **3.2.8 Theo dõi cân nặng và calo (US-22, 23)**

**Câu chuyện báo cáo — khách ghi cân và xem calo ngày trên WF-18/WF-19 thế nào.**

_Mục tiêu là khép kín vòng theo dõi để khách thấy tiến trình cân nặng đối chiếu trực tiếp với mục tiêu calo ngày. Màn hình WF-18 gồm dòng cân hiện tại và cân mục tiêu, ô nhập cân hôm nay kèm nút Lưu, biểu đồ đường theo thời gian với đường đứt nét thể hiện mốc mục tiêu, bộ lọc khoảng 30 ngày, 3 tháng và Tất cả, tooltip ngày cộng số ki-lô-gam khi di chuột cùng bảng số liệu văn bản đặt dưới biểu đồ. Màn hình WF-19 gồm tiêu đề Hôm nay với tỉ lệ đã nạp trên Target kèm phần trăm, thanh tiến trình đổi trạng thái khi vượt ngưỡng, dòng macro đã nạp theo đạm, bột và béo, hàng trạng thái từng bữa sáng, trưa, tối và phụ với dấu đã ăn hoặc chưa ăn, cùng nút thêm món ngoài hệ thống bằng tên và ki-lô-ca-lo ước lượng (FR-TRK-002, FR-TRK-004, FR-TRK-005)._

_Ghi cân trên WF-18 kiểm tra miền giá trị, giữ điểm mới nhất cùng ngày và đồng bộ hồ sơ/lịch sử. Biến động >5%/7 ngày hoặc >3 kg/tuần cảnh báo/xác nhận theo FR-HLT-012; >10 kg/tháng thuộc TBD-03, chưa chốt FR. WF-19 nhận calo từ phần giao Completed, tick đã ăn, nhập tay; ngày gói tuần giao xong ghi ngay. Nửa đêm sang ngày mới, giữ lịch sử; vượt Target cảnh báo icon/chữ._

**FR-TRK-001** — Hệ thống phải cho phép ghi cân nặng hằng ngày, tạo một điểm trên biểu đồ đường và đồng bộ vào hồ sơ; khi lệch lớn phải kích hoạt tính lại theo FR-HLT-011.

Cho phép Khách ghi cân nặng hằng ngày trên WF-18 để tạo một điểm mới trên biểu đồ đường và đồng bộ cân hiện tại sang hồ sơ; khi biến động vượt ngưỡng FR-HLT-012 phải xác nhận và tính lại theo FR-HLT-011; ngưỡng theo tháng chưa thuộc FR bắt buộc.

- Ưu tiên: Must (bắt buộc); Nguồn: US-22; Xác minh: kiểm thử.

**FR-TRK-002** — Từ 2 điểm dữ liệu trở lên, biểu đồ phải hiển thị đường xu hướng và mốc mục tiêu; khi chưa có dữ liệu phải hiển thị trang trống kèm lời gọi nhập lần đầu.

Từ 2 điểm dữ liệu trở lên, biểu đồ WF-18 hiển thị thêm đường xu hướng và mốc mục tiêu để Khách thấy tiến trình giảm/tăng cân; khi chưa có dữ liệu thì hiển thị trạng thái trống kèm lời gọi ghi cân lần đầu.

- Ưu tiên: Must (bắt buộc); Nguồn: US-22; Xác minh: kiểm thử.

**FR-TRK-003** — Hệ thống phải chặn giá trị cân nặng vô lý; khi trùng ngày phải giữ lần nhập mới nhất.

Chặn giá trị cân nặng phi lý kèm khoảng hợp lệ và giữ lần nhập mới nhất khi trùng ngày trên WF-18, nhằm tránh một bản ghi sai làm lệch toàn bộ đường xu hướng và tính lại dinh dưỡng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-22; Xác minh: kiểm thử.

**FR-TRK-004** — Biểu đồ cân nặng phải đi kèm bảng số tương ứng.

Biểu đồ cân nặng trên WF-18 phải đi kèm bảng số liệu văn bản tương ứng để hỗ trợ trợ năng và đối chiếu chính xác từng ngày.

- Ưu tiên: Must (bắt buộc); Nguồn: US-22; Xác minh: kiểm tra, rà soát.

**FR-TRK-005** — Hệ thống phải hiển thị thanh tiến độ calo ngày gồm lượng đã nạp so với Target (%) và macro từng bữa.

Hiển thị thanh tiến độ calo ngày trên WF-19 gồm lượng đã nạp so với Target kèm phần trăm và macro đạm/bột/béo từng bữa, giúp Khách đối chiếu trực tiếp việc ăn với mục tiêu ngày.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

**FR-TRK-006** — Calo đã nạp phải tính từ ba nguồn: phần giao Completed, tick đã ăn và nhập tay tên/kcal ước lượng. Gói tuần phải cộng ngay theo từng ngày Completed, không chờ toàn gói và không tự cộng ngày hủy/thất bại.

Không cộng trùng cùng suất do sự kiện Completed lặp hoặc tick đã ăn cùng suất. Ghi theo ngày giao, giữ snapshot dinh dưỡng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

**FR-TRK-007** — Khi lượng nạp vượt Target, Hệ thống phải hiển thị trạng thái cảnh báo (icon + chữ).

Khi lượng nạp vượt Target, thanh calo WF-19 chuyển trạng thái cảnh báo bằng biểu tượng kèm chữ chứ không chỉ đổi màu, để Khách nhận biết rõ việc vượt ngưỡng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

**FR-TRK-008** — Hệ thống phải đặt lại thanh calo ngày vào nửa đêm và giữ lịch sử các ngày trước.

Thanh calo WF-19 tự đặt lại vào nửa đêm và giữ lịch sử các ngày trước, nhằm chốt số liệu từng ngày mà vẫn tra cứu được tiến trình cũ.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

### **3.2.9 Thông báo real-time (US-25)**

**Câu chuyện báo cáo — thông báo real-time chạy qua chuông WF-21 thế nào.**

_WF-21 gồm chuông/badge và tab Tất cả, Khẩn, Thường, Tin. FR bắt buộc thông báo trong ứng dụng qua WebSocket, lưu DB, đồng bộ bù; sự kiện theo FR-NTF và FR vận hành liên quan. Email khẩn SendGrid được phản hồi dẫn từ EIR-SW-002/TBD-11, không tự suy thành yêu cầu bổ sung của FR-NTF; xem tham chiếu cuối tài liệu._

_Server lưu thông báo rồi đẩy WebSocket; UI dùng icon/chữ và badge. Offline được bù lúc đăng nhập; mất kết nối nối lại và đồng bộ phần lỡ. Chỉ được tắt tin, không tắt khẩn/thường. Kênh email khẩn cần đối chiếu yêu cầu giao diện ngoài và xác nhận phạm vi, không gán là bắt buộc theo FR-NTF._

**FR-NTF-001** — Hệ thống phải đẩy thông báo qua WebSocket cho các sự kiện: xác nhận đơn, IPN thành công, hủy đơn, khóa/mở tài khoản; và hiển thị huy hiệu chưa đọc.

Đẩy thông báo real-time qua WebSocket cho các sự kiện xác nhận đơn, IPN thành công/thất bại, hủy đơn, khóa/mở tài khoản và hiển thị huy hiệu chưa đọc trên chuông WF-21, để Khách và Manager không bỏ lỡ sự kiện quan trọng.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm thử.

**FR-NTF-002** — Thông báo phải có 3 mức ưu tiên (khẩn/thường/tin), phân biệt bằng icon và chữ, không chỉ bằng màu.

Mỗi thông báo trên WF-21 mang một trong 3 mức khẩn/thường/tin và phân biệt bằng biểu tượng kèm chữ chứ không chỉ bằng màu, nhằm bảo đảm trợ năng và nhận diện mức độ khẩn cấp.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm tra, rà soát.

**FR-NTF-003** — Hệ thống phải lưu thông báo trong DB và bù thông báo cho người dùng offline ở lần đăng nhập kế tiếp.

Mọi thông báo đều được lưu bền vững trong DB và bù đầy đủ cho người dùng offline ở lần đăng nhập kế tiếp trên WF-21, để không mất sự kiện khi vắng mặt.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm thử.

**FR-NTF-004** — Khi mất kết nối, Hệ thống phải tự nối lại và đồng bộ bù thông báo bị lỡ.

Khi mất kết nối giữa chừng, client WF-21 tự nối lại WebSocket và đồng bộ bù phần thông báo bị lỡ, nhằm giữ dòng sự kiện liên tục không đứt quãng.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm thử.

**FR-NTF-005** — Hệ thống phải cho phép người dùng tắt mức "tin" và không cho phép tắt mức "khẩn" và "thường".

Người dùng được tắt "tin" nhưng không tắt "khẩn"/"thường". Điều khoản này không tự bổ sung email; EIR-SW-002/TBD-11 được ghi riêng cuối tài liệu.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm thử.

### **3.2.10 Đánh giá món ăn đã xác minh mua hàng (US-26)**

**Câu chuyện báo cáo — khách đánh giá món đã mua thật ở WF-22 thế nào.**

_WF-22 liệt kê món đủ điều kiện theo phần giao Completed; gói tuần mở review ngay từng món ngày giao xong, không đợi cuối gói. Biểu mẫu sao/chữ/ảnh; danh sách lọc sao/ảnh và điểm trung bình theo món._

_Khách chọn món thuộc ngày đã giao; server kiểm tra chủ đơn, món thuộc ngày đó, trạng thái Completed; không đủ trả 403 và không lưu. Mỗi bộ đơn + ngày giao + món có một review, sửa trong 7 ngày từ lúc tạo. Admin ẩn vi phạm kèm lý do/audit/thông báo. Một món ở nhiều ngày được review riêng từng ngày; số lượng hoặc bữa lặp cùng ngày không nhân review._

**FR-REV-001** — Hệ thống chỉ cho đánh giá món bằng sao/chữ/ảnh khi xác minh món thuộc đơn của chính Khách hàng và phần giao chứa món đã Completed; gói tuần xét từng ngày, không yêu cầu toàn gói Completed.

WF-22 mở review ngay cho món ngày đã giao; món chỉ thuộc ngày chưa hoàn thành, Failed, Rejected, Cancelled không đủ điều kiện.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-002** — Khi API đánh giá được gọi mà chưa xác minh mua hàng, Hệ thống phải trả 403 và không lưu đánh giá.

Khi API đánh giá không xác minh được quyền sở hữu đơn và phần giao Completed chứa món theo FR-REV-001, server trả 403 và không lưu gì. Với gói tuần kiểm tra ngày giao tương ứng, không đòi toàn gói Completed.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-003** — Hệ thống phải giới hạn một đánh giá cho mỗi món trong mỗi ngày giao Completed của một đơn; cho tác giả sửa trong 7 ngày kể từ lúc tạo.

Khóa nghiệp vụ là đơn + kỳ giao/ngày giao + món. Cùng món ở hai ngày có review riêng; cùng món lặp trong một ngày không nhân review. Đơn lẻ có một kỳ giao áp dụng cùng quy tắc.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-004** — Hệ thống phải cho phép lọc danh sách đánh giá theo số sao và có ảnh, và hiển thị điểm trung bình ở trang món ăn.

Danh sách đánh giá trên WF-22 cho phép lọc theo số sao và có ảnh, đồng thời điểm trung bình được hiển thị lại ở trang món ăn để người đến sau kiểm chứng nhanh.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-005** — Hệ thống phải cho phép Admin ẩn đánh giá vi phạm và thông báo lý do cho tác giả.

Admin được ẩn đánh giá vi phạm trên WF-22 và tác giả nhận thông báo nêu rõ lý do, với thao tác ẩn ghi nhật ký kiểm toán để bảo đảm xử lý minh bạch.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

### **3.2.11 Quản trị món, đơn và người dùng (US-27, 28)**

**Câu chuyện báo cáo — đơn chạy qua ba góc nhìn WF-24 thế nào, Admin chỉ can thiệp ngoại lệ.**

_Mục tiêu là để món chuẩn trước khi bán và đơn trôi xuyên suốt từ bếp tới tay khách mà không ai lấn quyền ai. Màn hình WF-23 dành cho Admin tạo, sửa, ẩn món gồm tên, ảnh, giá, kcal, protein, carb, fat, nguyên liệu, dị ứng, tồn kho và nhãn mục tiêu (FR-ADM-001); màn hình WF-24 tách thành ba góc nhìn là WF-24A cho Manager điều phối toàn sàn, WF-24B cho bếp chỉ thấy việc nấu, WF-24C cho shipper chỉ thấy việc giao; ma trận hiển thị và chặn quyền chốt tại WF-04._

_Admin quản lý món WF-23; Manager WF-24A xác nhận/từ chối Pending, duyệt hủy trước cutoff/chưa Cooking, gán shipper Ready, xử lý Failed. Bếp WF-24B bắt đầu nấu/báo Ready trong ca; shipper WF-24C nhận phần được gán, xuất phát, ghi kết quả/COD. Online phải Paid trước Manager xác nhận; IPN không tự Confirmed. Failed chưa xử lý 24 giờ do job hủy/hoàn. Ghi lịch sử/thông báo theo FR._

_Dữ liệu gồm món/kho, lý do từ chối/duyệt hủy, shipper, lý do/minh chứng Failed, COD thực thu. Quyền chuyển theo FR-ADM-008 và bảng §3.2.6; Failed → Ready là ngoại lệ. Bảng đơn phân trang/lọc, bếp không nhận trường tiền, shipper không mở đơn người khác; sửa món đồng thời theo FR-ADM-006._

_Khách chưa trả chỉ tự hủy khi Pending/Confirmed, chưa nấu, trước cutoff; đã trả Manager duyệt cùng điều kiện. Sau chốt không hủy thông thường; đổi gói một lần không tạo quyền hủy. Bếp không tự rút Ready; shipper ghi đúng thiếu/thừa COD để đối soát. Admin chỉ ngoại lệ có lý do/audit; Manager không tạo tài khoản/sửa cấu hình; server chặn trái quyền._

**FR-ADM-001** — Hệ thống phải cho phép Admin thêm, sửa, ẩn món gồm tên, ảnh, giá, kcal, P/C/F, nguyên liệu, dị ứng, tồn kho và tag mục tiêu.

Cho phép Admin tạo, sửa và ẩn món trên WF-23 gồm tên, ảnh, giá, kcal, P/C/F, nguyên liệu, dị ứng, tồn kho và tag mục tiêu, nhằm chuẩn hóa dữ liệu món trước khi mở bán.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-002** — Khi kcal và macro của món không nhất quán, Hệ thống phải cảnh báo Admin trước khi lưu.

Khi kcal và macro của món không nhất quán, WF-23 cảnh báo Admin trước khi lưu để chặn số liệu dinh dưỡng sai lọt lên thực đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-003** — Việc sửa giá hoặc tồn kho không được làm thay đổi giá đã chụp của các đơn cũ.

Việc sửa giá hoặc tồn kho trên WF-23 không được làm thay đổi giá đã chụp của các đơn cũ, nhằm giữ nguyên cam kết thanh toán và đối soát.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-004** — Khi xóa món đã dính đơn cũ, Hệ thống phải yêu cầu xác nhận và ưu tiên ẩn mềm thay vì xóa cứng.

Khi xóa món đã dính đơn cũ, WF-23 yêu cầu xác nhận và ưu tiên ẩn mềm thay vì xóa cứng để bảo toàn lịch sử đơn và truy vết.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-005** — Khi tồn kho về 0, Hệ thống phải chuyển món sang trạng thái "Hết hàng" ngay.

Khi tồn kho về 0, món chuyển ngay sang trạng thái "Hết hàng" trên WF-23 để chặn đơn mới vượt quá khả năng bếp.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-006** — Khi hai Admin sửa cùng một món đồng thời, Hệ thống phải phát hiện xung đột bằng khóa lạc quan.

Khi hai Admin sửa cùng một món đồng thời trên WF-23, hệ thống phát hiện xung đột bằng khóa lạc quan để bên ghi sau không ghi đè lặng lẽ dữ liệu của bên trước.

- Ưu tiên: Must (bắt buộc); Nguồn: US-27; Xác minh: kiểm thử.

**FR-ADM-007** — Hệ thống phải hiển thị bảng đơn vận hành cho Manager với phân trang/lọc trạng thái, ngày, từ khóa; bếp/shipper nhận góc nhìn giới hạn FR-ADM-012/013; Admin xem giám sát và can thiệp ngoại lệ FR-ADM-015.

Quyền xem không cấp Admin quyền vận hành thường ngày.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-008** — Hệ thống phải phân quyền chuyển trạng thái theo công đoạn: Manager xác nhận/từ chối Pending; Kitchen Staff chuyển Confirmed → Cooking → Ready; Delivery Staff được gán chuyển Ready → Delivering và ghi kết quả. Thay đổi phải đồng bộ real-time cho khách.

Hủy/giao lại theo FR-ORD-017/018/023. Admin chỉ can thiệp ngoại lệ có lý do/audit theo FR-AUTH-022.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-009** — Hệ thống chỉ được cho phép đơn thanh toán online vào Cooking khi đã có IPN xác minh.

Đơn thanh toán online chỉ được vào Cooking khi đã có IPN xác minh, để bếp không nấu đơn chưa thu được tiền chắc chắn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-010** — Khi xử lý khiếu nại, Hệ thống phải cho Admin chỉnh tiền và hàng kèm log kiểm toán.

Khi xử lý khiếu nại, người có quyền được chỉnh tiền và hàng kèm log kiểm toán đầy đủ, nhằm bồi hoàn đúng mà vẫn truy vết được ai sửa gì.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-011** — Hệ thống phải cho Manager điều phối đơn trong ngày trên WF-24: xác nhận hoặc từ chối đơn Pending, duyệt yêu cầu hủy của khách, gán và đổi shipper cho đơn Ready, xử lý đơn Failed (hẹn giao lại hoặc hủy có hoàn tiền).

Manager điều phối đơn trong ngày trên WF-24A gồm xác nhận hoặc từ chối đơn Pending, duyệt yêu cầu hủy của khách, gán và đổi shipper cho đơn Ready, xử lý đơn Failed bằng hẹn giao lại hoặc hủy có hoàn tiền.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-012** — Hệ thống phải giới hạn góc nhìn bếp (Kitchen Staff) trên WF-24: chỉ thấy đơn Confirmed thuộc ca mình, chỉ được bấm bắt đầu nấu (Confirmed → Cooking) và món sẵn sàng (Cooking → Ready); không được sửa giá, tiền, không được tự hủy đơn.

Kitchen Staff trên WF-24B chỉ thấy đơn Confirmed thuộc ca mình và chỉ được bấm bắt đầu nấu (Confirmed → Cooking) rồi bấm món sẵn sàng (Cooking → Ready); không được sửa giá tiền và không được tự hủy đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-013** — Hệ thống phải giới hạn góc nhìn giao hàng (Delivery Staff) trên WF-24: chỉ thấy đơn Manager gán cho mình, chỉ được bấm nhận hàng và xuất phát (Ready → Delivering), giao thành công hoặc giao thất bại kèm lý do và ảnh minh chứng; đơn COD phải nhập số tiền thực thu.

Delivery Staff trên WF-24C chỉ thấy đơn Manager gán cho mình và chỉ được bấm nhận hàng xuất phát (Ready → Delivering) rồi chốt giao thành công hoặc giao thất bại kèm lý do và ảnh minh chứng; đơn COD bắt buộc nhập số tiền thực thu.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-014** — Hệ thống phải đối soát ngoại lệ cho Manager: mọi lần duyệt hủy, gán đổi shipper, xử lý Failed và chỉnh tiền hàng đều ghi audit log (người làm, thời điểm, lý do) và đẩy thông báo real-time cho Khách hàng.

Mọi lần Manager duyệt hủy, gán đổi shipper, xử lý Failed và chỉnh tiền hàng đều ghi audit log gồm người làm, thời điểm và lý do, đồng thời đẩy thông báo real-time cho Khách hàng để đối soát ngoại lệ minh bạch.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-015** — Hệ thống phải giới hạn Admin ở quản trị: tạo/phân quyền Manager, Kitchen Staff, Delivery Staff hoặc Admin; chỉnh cutoff và tham số nghiệp vụ. Cutoff mặc định 20:00 ngày trước giao, được cấu hình thay vì cố định trong code. Can thiệp đơn chỉ như ngoại lệ vượt quyền Manager có lý do/audit.

Customer tự đăng ký; Manager không tạo tài khoản/sửa cấu hình. Dùng cutoff nhất quán cho đổi/hủy và công bố chính sách; snapshot cutoff của đơn đang có được ghi ở mục lựa chọn triển khai.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

_Giữ mã FR-ADM-007..010 để truy vết nhưng đồng bộ chủ thể với phân quyền hiện hành: Manager vận hành, bếp nấu, shipper giao, Admin quản trị/giám sát và ngoại lệ. Không dùng chủ ngữ Admin của mô hình cũ để cấp quyền vận hành thường ngày._

### **3.2.12 Báo cáo tài chính và xuất Excel (US-29)**

**Câu chuyện báo cáo — tiền chốt qua màn hình WF-25 thế nào, lãi tính từ cost_price ở WF-23.**

_Mục tiêu là để Manager chốt được doanh thu, chi phí và lãi lỗ theo ngày mà không ai vừa đá bóng vừa thổi còi. Màn hình WF-25 gồm bộ chọn khoảng ngày, bốn thẻ tổng quan là doanh thu món ăn, số đơn Completed đã thanh toán, chi phí và lãi lỗ, một biểu đồ doanh thu theo ngày, một bảng đơn read-only phục vụ đối soát và nút xuất Excel; trường giá vốn cost_price do Admin nhập ở màn hình WF-23 là đầu vào gốc của mọi con số lãi (FR-FIN-001)._

_Sự kiện step-by-step: (1) Manager chọn khoảng ngày rồi bấm áp dụng, hệ thống đọc sổ Transaction chỉ tính đơn Completed đã thanh toán, cộng doanh thu theo giá đã chụp của từng đơn, cộng chi phí theo cost_price từng món rồi lấy doanh thu trừ chi phí ra lãi lỗ của món và toàn kỳ (FR-FIN-001); món nào Admin chưa nhập cost_price thì tạm tính chi phí bằng 60% giá bán và gắn cờ ước tính để khi kiểm tra biết số nào chưa chuẩn; (2) Manager mở bảng đơn bên dưới để đối chiếu từng mã đơn, khách hàng, tổng tiền, phương thức thanh toán và trạng thái, bảng này chỉ để xem, mọi nút đổi trạng thái đều ẩn vì quyền đó thuộc vận hành ở US-28 (FR-FIN-002); (3) Manager bấm xuất Excel, hệ thống đẩy việc vào hàng đợi bất đồng bộ, màn hình hiện trạng thái đang tạo, khi xong thì gửi thông báo và cho tải file định dạng xlsx về (FR-FIN-003)._

_Dữ liệu nhập chỉ gồm khoảng ngày bắt đầu và kết thúc cùng thao tác xuất file, không có nhập tiền tay nên không phát sinh sai lệch số học ở phía Manager. Ràng buộc chi tiết là số liệu luôn đọc từ sổ Transaction đã chốt, không đọc từ giỏ hay đơn treo; khoảng ngày không có dữ liệu thì hiển thị số 0 kèm gợi ý đổi khoảng chứ không báo lỗi (FR-FIN-004); file lớn thì xử lý nền qua hàng đợi để không treo trang._

_Trường hợp biên là đơn hủy có hoàn tiền thì sinh bản ghi hoàn trong sổ Transaction nên doanh thu kỳ đó giảm đúng phần đã hoàn, đơn giao thất bại chờ hẹn lại thì chưa tính vào báo cáo cho tới khi Completed; phân quyền giữ nguyên là Manager đối soát read-only hằng ngày mà không được tạo tài khoản hay sửa cấu hình, Admin chỉ xem giám sát và can thiệp ngoại lệ có lý do kèm audit log, bếp và shipper không thấy báo cáo tài chính và không chạm tới tiền, mọi truy cập trái vai trò ở WF-25 đều bị server trả 403._

**FR-FIN-001** — Hệ thống phải lập báo cáo món ăn theo khoảng ngày gồm doanh thu, số đơn Completed/paid, chi phí, lãi/lỗ (chi phí = cost_price do Admin nhập; trống thì = 60% giá bán kèm cờ ước tính).

Báo cáo món ăn trên WF-25 theo khoảng ngày gồm doanh thu, số đơn Completed đã thanh toán, chi phí và lãi/lỗ với công thức lãi bằng giá đã chụp trừ cost_price do Admin nhập ở WF-23; món trống cost_price thì tạm tính chi phí bằng 60% giá bán kèm cờ ước tính.

- Ưu tiên: Should (nên có); Nguồn: US-29; Xác minh: kiểm thử.

**FR-FIN-002** — Hệ thống phải hiển thị bảng đơn phục vụ đối soát ở chế độ read-only cho Manager (Manager không được đổi trạng thái đơn ở màn hình này — quyền đó thuộc vận hành WF-24 ở US-28).

Bảng đơn đối soát dưới báo cáo WF-25 ở chế độ read-only cho Manager chỉ để xem mã đơn, khách hàng, tổng tiền và phương thức thanh toán; mọi nút đổi trạng thái đều ẩn vì quyền đó thuộc vận hành WF-24 ở US-28.

- Ưu tiên: Should (nên có); Nguồn: US-29; Xác minh: kiểm thử.

**FR-FIN-003** — Hệ thống phải xuất Excel (.xlsx) bất đồng bộ qua hàng đợi: hiển thị "Đang tạo…", thông báo khi xong và cho tải về.

Nút xuất Excel trên WF-25 đẩy việc vào hàng đợi bất đồng bộ định dạng .xlsx, màn hình hiện "Đang tạo…" rồi gửi thông báo và cho tải file khi xong để không treo trang với file lớn.

- Ưu tiên: Should (nên có); Nguồn: US-29; Xác minh: kiểm thử.

**FR-FIN-004** — Khi khoảng ngày không có dữ liệu, Hệ thống phải hiển thị số 0 và gợi ý đổi khoảng.

Khi khoảng ngày không có dữ liệu, WF-25 hiển thị số 0 kèm gợi ý đổi khoảng chứ không báo lỗi, để Manager phân biệt kỳ trắng doanh thu với lỗi hệ thống.

- Ưu tiên: Should (nên có); Nguồn: US-29; Xác minh: kiểm thử.

### Đối chiếu 12 phản hồi và phạm vi áp dụng

| Mục phản hồi | Điều khoản | Quyết định / giới hạn |
| --- | --- | --- |
| 1. Hai bước | FR-PAY-003/004, FR-ORD-019 | Tiền riêng; Manager xác nhận; bếp bắt đầu nấu; từ chối đã thu thì hoàn. Giữ IPN chốt kho từ đặc tả trước. |
| 2. Hủy đã trả | FR-AUTH-016, FR-ORD-017/018 | Chưa trả tự hủy, đã trả duyệt; đồng thời chưa nấu/trước cutoff. |
| 3. Hủy ngày | FR-ORD-011/012/015/026 | Chỉ cả ngày. COD: hủy ngày đầu miễn/hoàn phí ship của ngày đó, không chuyển sang ngày khác (chốt 20/10/2026). Toàn gói hợp lệ trước giao ngày đầu hoàn ship, chống hoàn lặp. |
| 4. Sau cutoff | FR-ORD-013/015/017/018/025 | Không hủy thông thường; đổi một lần trong ngày; khiếu nại 24 giờ sau nhận. |
| 5. Failed | FR-ORD-010/016/023/024 | Giao lại qua Ready; 24 giờ chưa xử lý tự hủy/hoàn. |
| 6. Nội bộ | FR-PTL-001/002, FR-ADM-015 | Bốn vai trò nội bộ, Active ngay; danh sách đủ năm vai trò. |
| 7. Số bữa | FR-ORD-011, WF-26 | Mua đủ 7 × 4 = 28 bữa; hủy sau mua là luồng riêng. |
| 8. Cutoff | FR-ORD-013, FR-ADM-015 | 20:00 hôm trước là mặc định có cấu hình; cùng đơn giá/12:00 chưa phải SRS. |
| 9. Review/calo | FR-ORD-024/026, FR-TRK-006, FR-REV-001/003 | Theo ngày Completed, review riêng từng món như chủ yêu cầu xác nhận. |
| 10. Target | FR-HLT-013, FR-MNU-001/008/010 | ±10% mềm; mục tiêu áp dụng thực đơn từ tuần lịch kế tiếp. |
| 11. RememberMe | FR-AUTH-010, WF-03 | Không ghi nhớ 60 phút; ghi nhớ 7 ngày không hoạt động, thu hồi ngay vẫn hiệu lực. |
| 12. TBD | Diễn giải sức khỏe/tracking/thông báo | Tách nguồn, không tự biến thành FR bắt buộc. |

### Lựa chọn triển khai và tham chiếu ngoài

- weekly-orders.md ghi đổi món cùng đơn giá, giao mặc định 12:00, snapshot cutoff/chính sách theo đơn. Đây là lựa chọn triển khai đã ghi nhận, không tự trở thành SRS. Quy tắc sau cutoff không đổi số tiền không mặc nhiên đòi mọi món thay có cùng giá niêm yết.
- Theo phản hồi mục 12: xác nhận phụ huynh thuộc diễn giải/TBD-14; >10 kg/tháng thuộc diễn giải/TBD-03; email khẩn SendGrid được dẫn từ EIR-SW-002/TBD-11. Chưa có đầy đủ tài liệu nguồn trong tệp này; chưa đưa thành tiêu chí FR mới và không kết luận EIR vô hiệu chỉ vì không mang mã FR.
- Phụ lục API B và /auth/login được nhắc trong phản hồi không có trong tệp này. Khi đồng bộ API: chỉ Admin gọi liệt kê/tạo người dùng; danh sách trả đối tượng đủ năm vai trò, tạo cho gán bốn vai trò nội bộ; đăng nhập nhận rememberMe hoặc trường ánh xạ. Không nhầm vai trò đối tượng với quyền gọi API, không tự đổi URL backend.
- “Không ảnh hưởng code” ở phản hồi mục 6 chỉ mô tả ý định sửa câu chữ SRS. Backend còn phải đối chiếu enum, phân quyền, trạng thái và payload; cập nhật đặc tả chưa chứng minh code đã đáp ứng.
- Reset mã email FR-AUTH-014/015 giữ nguyên theo xác nhận trước; phản hồi mới không thay quyết định này.

### Điểm còn cần chốt trước phần code phụ thuộc

CĐ là vấn đề cần quyết định, không phải yêu cầu mới đã duyệt. Không suy thêm quyền hoặc chính sách tiền/kho từ các mục này.

| Mã | Cần chốt | Ảnh hưởng |
| --- | --- | --- |
| CĐ-01 — đã chốt cho COD | Trừ kho ngay khi đặt COD, không có hạn chờ Manager. Đơn COD lẻ dùng chung cấu hình cutoff chốt bếp với gói tuần (mặc định 20:00 hôm trước; chốt 20/10/2026). | Checkout, kho, xác nhận/hủy đơn lẻ. |
| CĐ-02 | Đổi sau cutoff kết thúc ở trạng thái nào; ai thực hiện/duyệt khi đã nấu; một lần được đổi bao nhiêu món? | Gói tuần, bếp, kho. |
| CĐ-03 | Hoàn ngày Failed/Rejected xử lý ship gói thế nào, có khác khách tự hủy ngày không? | Hoàn tự động/đối soát; không tự áp chính sách hủy thường vào ngoại lệ. |
| CĐ-04 | Gói lẫn Completed và Cancelled/Rejected tổng hợp trạng thái nào? Doanh thu/số đơn tính theo gói hay ngày, giá vốn/hoàn thuộc kỳ nào? | Trạng thái tổng, FR-FIN-001; không trì hoãn review/calo ngày. |
| CĐ-05 | Thao tác người dùng, request xác thực hay refresh gia hạn phiên? Request nền khi không sử dụng có tính hoạt động không? | Phiên trượt, tránh polling giữ phiên vô hạn. |
| CĐ-06 | Target đã tính nhưng chưa tới thứ Hai dùng thế nào trên thanh calo hiện tại và ngày chưa đặt? | Hồ sơ, thực đơn, tracking, snapshot. |
| CĐ-07 | Khiếu nại cần minh chứng gì, hạn giải quyết/kết quả bồi hoàn; mốc nhận hàng có đồng nhất Completed không? | FR-ORD-025, ngoại lệ, tài chính. |
