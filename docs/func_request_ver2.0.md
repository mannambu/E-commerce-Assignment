## **3.2 Yêu cầu chức năng**

### **3.2.1 Xác thực và phân quyền (US-01, 03, 04, 05)**

**Câu chuyện báo cáo — người dùng đi qua các màn hình thế nào.**

_Mục tiêu của cụm này là cho người mới tạo được tài khoản Customer trong 1 phút, người cũ vào đúng khu vực làm việc theo vai trò, kẻ gian không đoán được email tồn tại và không cày được mật khẩu. Ba màn hình chính là WF-01 (đăng ký), WF-03 (đăng nhập) và WF-04 (quên mật khẩu + ma trận quyền)._

**_Màn hình WF-01 đăng ký._** _Khách mở trang công khai, thấy logo, tiêu đề Đăng ký tài khoản, 4 ô nhập họ tên, email, mật khẩu, xác nhận mật khẩu, icon mắt bật tắt, checkbox điều khoản bắt buộc và nút Đăng ký full-width. Sự kiện step-by-step: (1) khách nhập họ tên, email hợp lệ, mật khẩu từ 8 ký tự, xác nhận khớp, tick điều khoản rồi bấm Đăng ký; (2) client validate trước rồi server validate lại, kiểm tra email trùng không phân biệt hoa thường; (3) ổn thì mã hóa Bcrypt, tạo tài khoản role Customer duy nhất, chuyển sang WF-03 kèm banner thành công. Dữ liệu nhập: name, email, password, confirm, acceptTos. Ràng buộc chi tiết: mật khẩu tối thiểu 8 ký tự và phải khớp ô xác nhận, lỗi báo inline từng ô ở cả client và server; email trùng thì báo đúng câu Email đã tồn tại và không tạo gì; chặn double-submit bằng disable nút + spinner; không bao giờ cho tự chọn role nội bộ ở form này, Manager/Kitchen/Delivery chỉ do Admin tạo ở WF-05. Trường hợp biên: bấm Back sau đăng ký xong không tạo trùng; mất mạng giữa chừng thì giữ nguyên dữ liệu đã nhập._

**_Màn hình WF-03 đăng nhập._** _Người dùng thấy ô email, ô mật khẩu, checkbox ghi nhớ, link quên mật khẩu sang WF-04 và nút Đăng nhập. Sự kiện: (1) nhập email + mật khẩu rồi bấm Đăng nhập; (2) server verify Bcrypt, kiểm tra trạng thái khóa, cấp JWT access 60 phút + refresh 7 ngày mang role rồi điều hướng theo vai trò — Customer về trang chủ/thực đơn, Manager về WF-24 góc vận hành, Kitchen về WF-24 góc bếp, Delivery về WF-24 góc giao, Admin về WF-05; (3) mọi request sau đó kèm header Authorization Bearer JWT, server verify chữ ký ở mọi API. Dữ liệu nhập: email, password, rememberMe. Ràng buộc chi tiết: sai thì báo một câu chung Email hoặc mật khẩu chưa đúng, tuyệt đối không tiết lộ email có tồn tại; sai liên tiếp 5 lần thì khóa tạm 15 phút và hiện đếm ngược, tái phạm trong 1 giờ thì nhân đôi tối đa 2 giờ; tài khoản bị Admin khóa thì báo Đã bị khóa, liên hệ Admin; JWT hết hạn giữa chừng thì đá về WF-03, giữ giỏ hàng lưu server; đổi quyền hoặc khóa giữa phiên thì có hiệu lực từ API call kế tiếp, phiên cũ mất hiệu lực ngay._

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

**FR-AUTH-010** — Khi JWT access hết hạn (60 phút, refresh 7 ngày), Hệ thống phải chuyển người dùng về trang đăng nhập và giữ nguyên giỏ hàng.

Chuyển người dùng về trang đăng nhập WF-03 khi JWT access hết hạn sau 60 phút với refresh 7 ngày và giữ nguyên giỏ hàng lưu server để không mất dữ liệu đang chọn.

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

**FR-AUTH-016** — Hệ thống phải giới hạn quyền theo 5 vai trò: Customer chỉ đặt món, xem và hủy đơn của chính mình khi còn đủ điều kiện, gửi yêu cầu hủy khi đã Confirmed, theo dõi calo và cân nặng, đánh giá món đã mua; Manager điều phối đơn trong ngày gồm confirm hoặc reject đơn Pending, duyệt yêu cầu hủy, gán và đổi shipper, xử lý giao thất bại và đối soát ngoại lệ; Kitchen Staff chỉ xem đơn Confirmed của ca mình, bấm bắt đầu nấu và báo món sẵn sàng; Delivery Staff chỉ xem đơn được gán cho mình, bấm nhận hàng, xuất phát, giao thành công hoặc thất bại và ghi nhận COD thực thu; Admin quản trị tài khoản, phân quyền, danh mục món và cấu hình, được xem báo cáo tài chính để giám sát nhưng mọi can thiệp vào đơn đang vận hành đều là ngoại lệ có lý do và audit log.

Giới hạn quyền theo 5 vai trò Customer, Manager, Kitchen, Delivery và Admin để mỗi vai trò chỉ chạm đúng nghiệp vụ của mình từ đặt món, điều phối đơn WF-24, nấu, giao đến quản trị; Admin được xem báo cáo tài chính để giám sát nhưng mọi can thiệp vào đơn đang vận hành đều là ngoại lệ có lý do và audit log.

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

_Chi tiết luồng phân quyền của FR-AUTH-016 đến FR-AUTH-022 diễn ra như sau. Trước hết, khách tự đăng ký ở WF-01 nên mặc định mang vai Customer; không có đường nào để khách tự nâng mình thành Manager, bếp, shipper hay Admin vì FR-AUTH-005 đã chặn ở cả client và server. Sau đó Admin vào WF-05, nhập email, chọn một trong bốn vai trò nội bộ là Manager, Kitchen Staff, Delivery Staff hoặc Admin, rồi bấm tạo; dữ liệu nhập gồm email hợp lệ và vai trò, ràng buộc là email chưa tồn tại và vai trò phải thuộc danh sách cho phép. Mỗi vai trò đăng nhập ở WF-03 sẽ rơi đúng về màn hình của mình theo FR-AUTH-007 nên không ai đi lạc sang màn hình của người khác. Trong ngày vận hành, Manager mở WF-24 là thấy toàn bộ đơn Pending để bấm confirm khi còn hàng và IPN đã hợp lệ, hoặc bấm reject kèm lý do khi hết hàng; với đơn khách xin hủy, Manager mở chi tiết đơn, xem lý do khách nhập và bấm duyệt hoặc từ chối; với món bếp đã báo sẵn sàng, Manager chọn shipper trong danh sách đang rảnh rồi bấm gán, khi cần thì đổi shipper khác; với đơn shipper báo giao thất bại, Manager xem lý do và ảnh minh chứng rồi chọn hẹn giao lại trong ngày hoặc hủy có hoàn tiền. Ở khâu bếp, Kitchen Staff mở WF-24 ở chế độ bếp nên chỉ thấy đơn Confirmed của ca mình theo thứ tự giờ giao; sự kiện của bếp rất gọn là bấm bắt đầu nấu khi nhận nguyên liệu và bấm món sẵn sàng khi nấu xong, dữ liệu nhập gần như không có ngoài nút bấm, ràng buộc là không thấy trường tiền và không có nút hủy. Ở khâu giao, Delivery Staff mở WF-24 ở chế độ giao hàng nên chỉ thấy đơn gán cho mình kèm địa chỉ, số điện thoại khách và số COD phải thu; sự kiện của shipper là bấm nhận hàng và xuất phát khi rời quán, tới nơi thì bấm giao thành công và nhập tiền thực thu nếu là COD, hoặc bấm giao thất bại kèm lý do và ảnh; ràng buộc là shipper không mở được đơn của người khác và không sửa được món hay giá. Admin hằng ngày chỉ quanh quẩn ở WF-04 và WF-05 để quản trị, không trực tiếp bấm confirm hay gán shipper; chỉ khi có ngoại lệ vượt quyền Manager thì Admin mới can thiệp vào đơn, lúc đó màn hình bắt nhập lý do và hệ thống ghi audit log theo FR-AUTH-022, nên thầy vẫn hậu kiểm được ai đã đụng vào đơn nào._

### **3.2.2 Quản trị người dùng (US-06)**

**Câu chuyện báo cáo — Admin quản trị người dùng trên màn hình WF-05 thế nào.**

_Mục tiêu của cụm này là để Admin kiểm soát truy cập của cả 5 vai trò trên một màn hình WF-05 duy nhất mà vẫn giữ tách bạch vận hành và quản trị. Màn hình gồm tiêu đề Quản lý người dùng, bộ lọc theo vai trò và trạng thái, ô tìm kiếm theo email và tên, bảng người dùng có phân trang và các nút tạo tài khoản nội bộ, khóa và mở khóa (FR-PTL-001, FR-PTL-002)._

_Sự kiện step-by-step: (1) Admin mở WF-05 xem danh sách rồi lọc theo vai trò, trạng thái hoặc tìm theo email, tên; (2) bấm tạo, nhập email và chọn đúng một vai trò nội bộ rồi bấm lưu, hệ thống kiểm tra định dạng và trùng email rồi tạo tài khoản và ghi audit log, Customer không do Admin tạo mà tự đăng ký ở WF-01; (3) mở hồ sơ, chọn khóa hoặc mở, nhập lý do bắt buộc rồi xác nhận, khi khóa hệ thống kết thúc mọi phiên đang mở và lần đăng nhập sau người bị khóa thấy đúng lý do (FR-PTL-001, FR-PTL-003, FR-PTL-005). Dữ liệu nhập gồm email, vai trò, từ khóa và lý do. Ràng buộc là Admin cuối cùng không được tự khóa hay tự hạ cấp, Admin chỉ xem báo cáo để giám sát mà không đổi trạng thái đơn trong luồng thường ngày, mọi can thiệp vào đơn đều là ngoại lệ phải nhập lý do và ghi audit log (FR-PTL-004, FR-PTL-006)._

_Trường hợp biên: Admin cuối cùng cố tự khóa thì nút xác nhận bị chặn để hệ thống không mất người quản trị; tài khoản đang mở phiên ở thiết bị khác thì phiên cũ mất hiệu lực ngay từ API call kế tiếp và người đó bị chuyển về trang đăng nhập._

**FR-PTL-001** — Hệ thống phải cho phép Admin tạo tài khoản nội bộ gồm Manager, Kitchen Staff và Delivery Staff bằng email và gán đúng một vai trò trong bốn vai trò nội bộ; Customer không do Admin tạo mà tự đăng ký ở WF-01.

Cho phép Admin tạo tài khoản nội bộ gồm Manager, Kitchen Staff và Delivery Staff bằng email và gán đúng một vai trò trên WF-05 để kiểm soát truy cập nội bộ; Customer không do Admin tạo mà tự đăng ký trên WF-01.

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

_Chi tiết luồng quản trị của FR-PTL-001 đến FR-PTL-006 diễn ra như sau. Màn hình WF-05 là bàn làm việc của Admin, gồm bộ lọc theo vai trò và ô tìm kiếm, bảng người dùng có phân trang và các nút tạo, khóa, mở khóa. Luồng tạo người chạy từng bước như sau: Admin bấm tạo, nhập email và chọn vai trò là Manager, Kitchen Staff, Delivery Staff hoặc Admin, rồi bấm lưu; hệ thống kiểm tra email đúng định dạng và chưa tồn tại, vai trò thuộc danh sách cho phép, sau đó tạo tài khoản ở trạng thái chờ kích hoạt và ghi audit log ai đã tạo ai. Manager không có nút này nên không thể tự tạo đàn em cho mình, đúng tinh thần SoD. Luồng khóa và mở khóa cũng tương tự: Admin mở hồ sơ người dùng, chọn khóa, nhập lý do cụ thể (ví dụ nghỉ việc, vi phạm đối soát), rồi bấm xác nhận; hệ thống đá hết phiên đang mở của người đó ra, lần đăng nhập sau người đó thấy đúng lý do bị khóa. Ràng buộc an toàn là Admin cuối cùng không được tự khóa hay tự hạ cấp chính mình để hệ thống không rơi vào cảnh không còn ai quản trị. Riêng FR-PTL-006 cần đọc kỹ vì đây là chỗ sửa sai của mô hình cũ: trước đây Admin bị chặn hẳn khỏi báo cáo tài chính, còn Manager bị chặn hẳn khỏi đơn hàng, khiến người cần số thì không có đơn để đối chiếu còn người cần xử lý đơn thì không có quyền. Mô hình mới cho Admin được xem báo cáo để giám sát, nhưng khóa quyền đổi trạng thái đơn trong ngày thường; ngược lại Manager được toàn quyền điều phối đơn nhưng không được tạo tài khoản hay sửa cấu hình. Khi Admin buộc phải đụng vào đơn thì màn hình bắt nhập lý do và hệ thống ghi đủ audit log, nên vừa linh hoạt xử lý ngoại lệ vừa giữ được kiểm soát._

### **3.2.3 Hồ sơ sức khỏe và chỉ số BMR/TDEE/Target (US-07, 08, 09)**

**Câu chuyện báo cáo — khách khai hồ sơ và nhận chỉ số BMR/TDEE/Target trên WF-06 và WF-07 thế nào.**

_Mục tiêu của cụm này là biến số đo cơ thể thành Target calo đáng tin để mọi gợi ý sau đó có chuẩn để bám. Màn hình WF-06 là khảo sát ba bước gồm bước một nhập chiều cao, cân nặng, tuổi và giới tính, bước hai chọn mức vận động trong năm mức và mục tiêu giảm, tăng hoặc giữ, bước ba tick dị ứng và ghi chú kiêng kỵ, cuối trang là nút Quay lại và nút Lưu và tính chỉ số (FR-HLT-001, FR-HLT-003). Khách chưa có hồ sơ mà mở thực đơn thì hệ thống chuyển về trang khảo sát này (FR-HLT-004)._

_Sự kiện step-by-step: (1) khách nhập đủ trường rồi bấm Lưu và tính chỉ số, hệ thống kiểm tra miền giá trị rồi lưu hồ sơ và gắn dị ứng để lọc mọi gợi ý sau đó; (2) hệ thống tính BMR theo Mifflin-St Jeor, nhân với hệ số vận động 1,2–1,9 ra TDEE, rồi điều chỉnh theo mục tiêu ra Target với mặc định giảm −15%, tăng +10% và giữ nguyên 0%; (3) mở WF-07 thấy ba thẻ BMR, TDEE và Target kèm giải thích dễ hiểu, số hiển thị làm tròn kcal nguyên, rồi bấm Xem thực đơn gợi ý để sang WF-08 (FR-HLT-005, FR-HLT-006, FR-HLT-007, FR-HLT-009). Khi Target tính ra thấp hơn BMR thì hệ thống nâng Target bằng đúng BMR và hiện cảnh báo an toàn, khi thiếu trường thì báo chưa đủ dữ liệu chứ không tự suy số (FR-HLT-008, FR-HLT-010)._

_Khi khách sửa cân nặng, mức vận động hoặc mục tiêu ở WF-07 thì hệ thống tính lại ngay và lưu dòng lịch sử, đổi mục tiêu giữa tuần thì số mới áp dụng từ chu kỳ thực đơn kế tiếp (FR-HLT-011, FR-HLT-013). Ràng buộc tuổi là giảm cân từ 16 tuổi, 10–15 tuổi chỉ Duy trì kèm xác nhận phụ huynh và dưới 10 tuổi từ chối gợi ý giảm cân (FR-HLT-002). Trường hợp biên: cân đổi quá 5% trong 7 ngày hoặc quá 3 kg một tuần hoặc quá 10 kg một tháng thì hiện cảnh báo và bắt tick xác nhận mới cho lưu; nhập số phi lý ngoài miền 100–250 cm, 25–300 kg, 10–100 tuổi thì chặn kèm lỗi từng trường (FR-HLT-002, FR-HLT-012)._

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

**FR-HLT-013** — Khi Khách hàng đổi mục tiêu giữa tuần, Hệ thống phải áp dụng chỉ số mới từ chu kỳ thực đơn kế tiếp.

Áp dụng chỉ số mới từ chu kỳ thực đơn kế tiếp trên WF-08 khi Customer đổi mục tiêu giữa tuần để giữ ổn định thực đơn tuần hiện tại.

- Ưu tiên: Must (bắt buộc); Nguồn: US-09; Xác minh: kiểm thử.

### **3.2.4 Gợi ý thực đơn (US-10, 11)**

**Câu chuyện báo cáo — engine gợi ý chạy thế nào trên màn hình WF-08.**

_Mục tiêu là khách mở Thực đơn hôm nay là ăn được ngay đúng mục tiêu mà không phải tự tính calo hay tự nhớ dị ứng. Màn hình WF-08 gồm header Target và phần trăm bám sát, tab Hôm nay/Cả tuần, nhãn Đã lọc dị ứng, 3 thanh macro ngày, 4 bữa sáng/trưa/tối/phụ kèm calo và nút Đổi món, nút Thêm cả ngày vào giỏ và Đặt cả tuần._

_Sự kiện step-by-step: (1) khách có Target và danh sách dị ứng mở WF-08; (2) engine chạy greedy rule-based: lọc tuyệt đối mọi món chứa nguyên liệu dị ứng trước, rồi ghép 4 bữa sao cho tổng ngày trong ±10% Target và macro gần 30/40/30 với dung sai ±5 điểm %; (3) hiển thị 4 bữa kèm tổng calo, phần trăm và cờ xanh khi đạt chuẩn; (4) ở tab Cả tuần engine ráp 7 ngày với quy tắc một món lặp tối đa 2 lần; (5) khách bấm Đổi món ở một bữa thì popover hiện 3–5 món tương đương calo ±15% so với món gốc, đã lọc dị ứng, xếp theo độ tương đồng calo và macro, chọn xong thì tổng ngày và macro tính lại ngay kèm chênh lệch. Dữ liệu vào: Target, allergies\[\], catalog món kèm kcal/P/C/F từ Admin, lịch sử món đã gợi ý trong tuần. Dữ liệu ra: menu ngày/tuần kèm totalKcal, pct, macro và allergyFilter. Ràng buộc chi tiết: sai số tổng ngày ±10% là cứng; lọc dị ứng là tuyệt đối, món dính là loại không thương lượng; macro 30/40/30 dung sai ±5 điểm %; kho món mỏng không ráp đủ chuẩn thì gắn cờ Thực đơn gần đúng có ghi rõ nới gì thay vì trang trắng; dị ứng quá nhiều thì báo Quá ít món phù hợp kèm nút liên hệ; swap xong mà tổng ngày lệch khỏi ±10% thì hiện cảnh báo nhưng vẫn cho giữ; món trong đơn đã checkout thì khóa swap, trong gói tuần thì sau giờ chốt bếp 20h hôm trước của ngày đó thì khóa._

**FR-MNU-001** — Hệ thống phải gợi ý thực đơn ngày gồm bữa sáng, trưa, tối, phụ với tổng năng lượng trong khoảng ±10% Target.

Gợi ý thực đơn ngày gồm 4 bữa sáng, trưa, tối, phụ trên WF-08 bằng engine greedy rule-based sao cho tổng năng lượng nằm trong ±10% Target của Khách hàng.

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

**FR-MNU-008** — Sau khi đổi món, Hệ thống phải kiểm tra lại tổng ngày trong ±10% Target và hiển thị chênh lệch.

Sau khi đổi món phải tính lại tổng ngày và macro, kiểm tra lại ngưỡng ±10% Target và hiển thị chênh lệch cho Khách hàng trên WF-08.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

**FR-MNU-009** — Khi không còn món thay phù hợp, Hệ thống phải hiển thị "Không còn món thay phù hợp".

Khi không còn món thay nào phù hợp ràng buộc thì hiển thị thông báo Không còn món thay phù hợp trên WF-08 thay vì gợi ý sai chuẩn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-11; Xác minh: kiểm thử.

**FR-MNU-010** — Hệ thống phải khóa chức năng đổi món sau khi thực đơn đã được đặt hàng.

Khóa chức năng đổi món trên WF-08 sau khi thực đơn đã được đặt hàng nhằm giữ nhất quán giữa món đã chốt và tồn kho đơn hàng.

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

_Mục tiêu là chốt đơn chắc mà không giữ hàng ảo. WF-14 là giỏ lưu server với hai tab lẻ và tuần, mỗi dòng hiện món, số lượng, ngày giao, đơn giá, tổng và ship tạm tính, dòng hết hàng gắn cờ và chặn checkout (FR-ORD-001, FR-ORD-003, FR-ORD-004). WF-15 gồm cụm checkout với địa chỉ, giờ giao, nút Đặt hàng, một mốc đếm ngược và dòng thời gian năm bước kèm thời điểm (FR-ORD-005, FR-ORD-006, FR-ORD-009). WF-26 là gói bảy ngày một mã chung, mỗi ngày ba bữa kèm nút Đổi, giờ giao cố định, ship chỉ tính ngày đầu và miễn sáu ngày còn lại (FR-ORD-011, FR-ORD-012)._

_Sự kiện step-by-step: (1) khách thêm món lẻ hoặc tuần rồi sửa, xóa trong giỏ (FR-ORD-002); (2) chốt địa chỉ và giờ giao rồi bấm Đặt hàng, hệ thống sinh idempotency key chống trùng và trong một giao dịch ACID tạo đơn Pending đồng thời khóa kho (FR-ORD-005, FR-ORD-008); (3) bấm Đặt cả tuần để sinh bảy dòng theo ngày, ngày thiếu món được gắn cờ kèm món thay thế trước thanh toán (FR-ORD-011, FR-ORD-014); (4) đơn online nằm Pending chờ IPN verify, đơn COD chờ Manager xác nhận như §3.2.7 (FR-PAY-002, FR-PAY-004); (5) khách hủy, gửi yêu cầu hủy hoặc đổi món từng ngày tùy trạng thái._

_Ràng buộc: một mốc 15 phút chung cho giữ hàng và thanh toán, hết giờ hoặc hủy thì nhả kho (FR-ORD-006); đơn online chưa IPN verify không vào Cooking; khách tự hủy ngay chỉ khi Pending hoặc Confirmed chưa nấu với online chưa IPN và COD chưa gán shipper, từ Cooking trở đi phải gửi yêu cầu chờ Manager duyệt real-time (FR-ORD-017, FR-ORD-018); combo khóa đổi sau chốt bếp 20h hôm trước (FR-ORD-013); cấm mọi chuyển lùi (FR-ORD-010, FR-ORD-024)._

_Luồng đi Pending, Confirmed, Cooking, Ready, Delivering tới Completed, rẽ nhánh Cancelled khi khách tự hủy, job quá hạn thanh toán hủy, Manager duyệt hủy hoặc Rejected, và rẽ Failed khi giao thất bại để Manager hẹn lại hoặc hủy hoàn tiền (FR-ORD-016, FR-ORD-019, FR-ORD-023). Trường hợp biên: hai đơn tranh suất cuối thì bên commit trước thắng, đơn còn lại báo thiếu theo dòng (FR-ORD-007); bấm trùng do mạng chỉ tạo một đơn nhờ key; hủy ngày combo trước chốt hoàn trong 3–5 ngày, sau chốt chỉ đổi một lần; chỉ Completed mở đánh giá và ghi calo (FR-ORD-015, FR-ORD-024)._

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

**FR-ORD-006** — Hệ thống phải giữ tồn kho 15 phút khớp hạn thanh toán, hiển thị một mốc đếm ngược, và nhả tồn kho khi hết giờ hoặc khi đơn bị hủy.

Giữ tồn kho và hạn thanh toán dùng chung một mốc 15 phút để tránh giữ hàng ảo; hết giờ hoặc hủy thì nhả kho.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-007** — Khi nhiều đơn đặt song song cho hàng cuối, Hệ thống phải cho đơn đủ hàng trước thắng và báo thiếu hàng theo từng dòng cho đơn còn lại.

Khi nhiều đơn tranh suất hàng cuối song song thì đơn commit đủ hàng trước thắng, đơn còn lại báo thiếu hàng theo từng dòng trên WF-15.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-008** — Hệ thống phải dùng idempotency key để chặn tạo đơn trùng khi client gửi lại request.

Dùng idempotency key để chặn tạo đơn trùng khi client gửi lại request do mạng chập chờn trên WF-15.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-009** — Mục "Đơn của tôi" phải hiển thị dòng thời gian 5 bước (Pending → Confirmed → Cooking → Delivering → Completed) kèm thời điểm từng bước.

Mục Đơn của tôi trên WF-15 hiển thị dòng thời gian 5 bước Pending tới Completed kèm thời điểm từng bước để Khách hàng theo dõi tiến độ.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18; Xác minh: kiểm thử.

**FR-ORD-010** — Hệ thống chỉ được chuyển trạng thái đơn theo chiều tiến; các chuyển ngược (ví dụ Delivering → Pending) phải bị chặn.

Chỉ cho chuyển trạng thái đơn theo chiều tiến và chặn mọi chuyển ngược như Delivering về Pending nhằm giữ toàn vẹn luồng đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, 28; Xác minh: kiểm thử.

**FR-ORD-011** — Khi Khách hàng chọn "Đặt cả tuần" từ thực đơn 7 ngày, Hệ thống phải sinh 7 dòng theo ngày dưới một mã gói theo dõi chung.

Khi Khách hàng chọn Đặt cả tuần từ thực đơn 7 ngày thì sinh 7 dòng theo ngày dưới một mã gói theo dõi chung trên WF-26.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-012** — Với combo tuần, Hệ thống phải chỉ tính phí ship của ngày 1 và hiển thị rõ từng khoản được miễn.

Với combo tuần trên WF-26 chỉ tính phí ship của ngày 1 và hiển thị rõ từng khoản được miễn cho 6 ngày còn lại.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-013** — Hệ thống phải cho đặt khung giờ giao cố định một lần cho cả combo, cho phép đổi món từng ngày trước giờ chốt bếp 20h hôm trước và khóa việc đổi sau giờ chốt.

Cho đặt khung giờ giao cố định một lần cho cả combo trên WF-26, cho đổi món từng ngày trước giờ chốt bếp 20h hôm trước và khóa đổi sau giờ chốt.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-014** — Khi một ngày trong combo thiếu món, Hệ thống phải gắn cờ kèm món thay thế trước khi thanh toán.

Khi một ngày trong combo thiếu món thì gắn cờ kèm món thay thế trên WF-26 trước khi thanh toán để Khách hàng chốt phương án.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-015** — Khi Khách hàng hủy lẻ một ngày trong combo, Hệ thống phải hoàn tiền ngày đó (trước chốt hoàn 100% trong 3–5 ngày, sau chốt đổi món 1 lần) theo chính sách đã hiển thị trước khi xác nhận.

Khi Khách hàng hủy lẻ một ngày trong combo thì hoàn tiền ngày đó theo chính sách đã hiển thị trước xác nhận, trước chốt hoàn 100% trong 3–5 ngày còn sau chốt chỉ đổi món 1 lần.

- Ưu tiên: Should (nên có); Nguồn: US-30; Xác minh: kiểm thử.

**FR-ORD-016** — Hệ thống phải hỗ trợ trạng thái đơn đầy đủ: Pending → Confirmed/Rejected → Cooking → Ready → Delivering → Completed, cùng hai nhánh kết thúc sớm là Cancelled và Failed; mọi chuyển đổi phải ghi người thực hiện và thời điểm.

Hỗ trợ máy trạng thái đơn đầy đủ từ Pending tới Completed cùng hai nhánh kết thúc sớm Cancelled và Failed, mọi chuyển đổi đều ghi người thực hiện và thời điểm trên WF-24.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-017** — Hệ thống phải cho phép Khách hàng tự hủy đơn ở trạng thái Pending, và ở trạng thái Confirmed khi bếp chưa bấm bắt đầu nấu (chưa vào Cooking) kèm điều kiện: đơn online chưa có IPN thành công, đơn COD chưa được gán shipper; khi tự hủy phải nhả tồn kho và ghi lý do "Khách tự hủy".

Cho Khách hàng tự hủy ngay ở Pending và ở Confirmed khi bếp chưa bấm bắt đầu nấu, với điều kiện đơn online chưa có IPN thành công và đơn COD chưa gán shipper; khi hủy phải nhả kho và ghi lý do Khách tự hủy.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-018** — Khi đơn đã vào Cooking trở đi và Khách hàng muốn hủy, Hệ thống phải chuyển yêu cầu sang dạng "yêu cầu hủy chờ Manager duyệt" thay vì hủy ngay; Manager duyệt hoặc từ chối kèm lý do, Khách hàng nhận thông báo real-time.

Khi đơn đã vào Cooking trở đi thì yêu cầu hủy của Khách hàng chuyển thành yêu cầu chờ Manager duyệt kèm lý do, Khách hàng nhận thông báo real-time trên WF-15 và WF-24.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-28; Xác minh: kiểm thử.

**FR-ORD-019** — Hệ thống phải cho phép Manager từ chối (Reject) đơn Pending kèm lý do (hết nguyên liệu, quá tải bếp, ngoài khu vực giao); đơn Rejected phải nhả tồn kho và không được chuyển tiếp sang Cooking.

Cho Manager từ chối đơn Pending kèm lý do bắt buộc như hết nguyên liệu hay quá tải bếp trên WF-24; đơn Rejected phải nhả kho và không được chuyển tiếp sang Cooking.

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

**FR-ORD-023** — Khi đơn ở Failed, Hệ thống phải giữ đơn lại để Manager xử lý trong ngày: hẹn giao lại (Failed → Ready/Delivering) hoặc hủy có hoàn tiền (Failed → Cancelled); mọi xử lý phải ghi audit log và thông báo cho Khách hàng.

Khi đơn ở Failed thì giữ lại để Manager xử lý trong ngày trên WF-24, hẹn giao lại về Ready hoặc hủy có hoàn tiền về Cancelled, mọi xử lý đều ghi audit log và thông báo cho Khách hàng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ORD-024** — Hệ thống phải cấm mọi chuyển trạng thái đi lùi (ví dụ Delivering → Cooking, Completed → bất kỳ); chỉ Completed mới mở khóa đánh giá Verified Purchase và ghi nhận calo thực tế.

Cấm mọi chuyển trạng thái đi lùi; chỉ đơn Completed mới mở khóa đánh giá Verified Purchase và ghi nhận calo thực tế.

- Ưu tiên: Must (bắt buộc); Nguồn: US-18, US-26; Xác minh: kiểm thử.

**Vận hành đơn trong ngày — từ lúc khách đặt tới lúc giao xong:**

_Buổi sáng khách mở WF-15 bấm ĐẶT HÀNG, đơn sinh ra ở Pending kèm một mốc đếm ngược giữ hàng + thanh toán 15 phút (FR-ORD-005, FR-ORD-006). Nếu khách trả online thì đơn nằm chờ IPN, nếu chọn COD thì đơn chờ Manager xác nhận, đây là điểm khác nhau duy nhất ở cửa vào. Trong lúc đơn còn Pending, hoặc vừa Confirmed mà bếp chưa bấm nấu, khách đổi ý thì mở chính WF-15 bấm Hủy đơn là xong ngay, hàng tự nhả, không cần ai duyệt (FR-ORD-017). Hết 15 phút chưa có IPN thì job tự hủy theo FR-PAY-007; hủy của khách và hủy của job không đè nhau nhờ khóa dòng._

_B1, Manager mở WF-24 ở góc nhìn điều phối, thấy hàng đợi Pending xếp theo giờ giao. Manager bấm Xác nhận thì đơn Pending → Confirmed (online bắt buộc đã có IPN verify, COD thì xác nhận ngay), bấm Từ chối kèm lý do thì đơn Pending → Rejected, hàng nhả, khách nhận thông báo. Không có đường nào khác rời khỏi Pending ngoài ba cửa Confirmed, Rejected và Cancelled (khách tự hủy hoặc job tự hủy)._

_B2, bếp mở WF-24 ở góc nhìn bếp, danh sách chỉ hiện đơn Confirmed thuộc ca mình theo thứ tự giờ giao. Bếp nhận nguyên liệu thì bấm Bắt đầu nấu, đơn Confirmed → Cooking. Từ thời điểm này khách không còn nút tự hủy, muốn hủy phải bấm Gửi yêu cầu hủy kèm lý do, yêu cầu nằm chờ ở hàng đợi của Manager (FR-ORD-018). Bếp nấu xong bấm Món sẵn sàng, đơn Cooking → Ready, Manager nhìn thấy để điều shipper._

_B3, Manager ở WF-24 góc nhìn điều phối gán shipper cho đơn Ready, giờ cao điểm có thể đổi shipper cho nhau. Shipper mở WF-24 ở góc nhìn giao hàng, chỉ thấy đơn gán cho mình kèm địa chỉ, số điện thoại khách và số COD phải thu. Tới quán shipper bấm Nhận hàng và xuất phát, đơn Ready → Delivering._

_B4, shipper tới nơi thì chốt một trong hai cửa. Giao được thì bấm Giao thành công, đơn Delivering → Completed, với COD thì nhập số tiền thực thu ngay tại màn hình này để cuối ca đối soát (FR-ORD-022). Giao không được thì bấm Giao thất bại, nhập lý do bắt buộc và đính kèm ảnh khi cần, đơn Delivering → Failed, khách nhận thông báo real-time._

_B5, đơn Failed không tự trôi đi đâu mà nằm lại hàng đợi ngoại lệ của Manager. Manager mở chi tiết đơn, gọi xác minh rồi chọn hẹn giao lại (đơn quay về Ready để gán lại shipper) hoặc hủy có hoàn tiền (đơn Failed → Cancelled, sinh bản ghi hoàn ở sổ Transaction). Mọi lần duyệt hủy, gán shipper, xử lý Failed và đối soát ngoại lệ tiền hàng đều ghi audit log người làm và thời điểm (FR-ORD-023, NFR-AUD-001). Chỉ đơn đi tới Completed mới mở khóa đánh giá và cộng calo ngày (FR-ORD-024)._

**Chuyển trạng thái đơn hàng hợp lệ (máy trạng thái đầy đủ, thay thế bảng 5 bước cũ):**

- **Pending → Confirmed**: Manager, WF-24 điều phối — IPN hợp lệ đã verify với đơn online, hoặc đơn COD; bấm Xác nhận..
- **Pending → Rejected**: Manager, WF-24 điều phối — Nhập lý do bắt buộc (hết nguyên liệu, quá tải, ngoài khu vực); nhả tồn kho..
- **Pending → Cancelled**: Khách tự bấm ở WF-15, hoặc job tự hủy, hoặc Manager duyệt hủy — Khách tự hủy khi đủ điều kiện FR-ORD-017; đơn online quá 15 phút không IPN thì job hủy lý do "Quá hạn thanh toán"; nhả tồn kho..
- **Confirmed → Cooking**: Bếp, WF-24 bếp — Bếp bấm Bắt đầu nấu khi nhận nguyên liệu; đơn online phải có IPN đã xác minh..
- **Confirmed → Cancelled**: Khách + Manager duyệt, WF-15 và WF-24 điều phối — Khách tự hủy khi bếp chưa nấu và đủ điều kiện FR-ORD-017 thì hủy ngay; đã quá điều kiện thì chuyển thành yêu cầu hủy chờ Manager duyệt..
- **Cooking → Ready**: Bếp, WF-24 bếp — Bếp bấm Món sẵn sàng khi nấu xong..
- **Cooking → Cancelled**: Manager duyệt yêu cầu hủy, WF-24 điều phối — Khách gửi yêu cầu hủy từ WF-15, Manager duyệt kèm lý do; điều chỉnh kho và tiền theo chính sách..
- **Ready → Delivering**: Shipper, WF-24 giao hàng — Shipper bấm Nhận hàng và xuất phát cho đơn được gán cho mình..
- **Ready → Cancelled**: Manager duyệt yêu cầu hủy, WF-24 điều phối — Tương tự Cooking; hủy ở Ready phải kiểm tra món đã nấu để xử lý hao hụt..
- **Delivering → Completed**: Shipper, WF-24 giao hàng — Bấm Giao thành công; đơn COD nhập số tiền thực thu bắt buộc..
- **Delivering → Failed**: Shipper, WF-24 giao hàng — Bấm Giao thất bại, nhập lý do bắt buộc và ảnh minh chứng khi cần..
- **Failed → Ready**: Manager, WF-24 điều phối — Hẹn giao lại trong ngày, gán lại shipper..
- **Failed → Cancelled**: Manager, WF-24 điều phối — Hủy có hoàn tiền, sinh bản ghi hoàn ở sổ Transaction, ghi audit log..
- **Bất kỳ trừ Completed/Rejected/Cancelled → Cancelled**: Manager xử lý ngoại lệ, WF-24 điều phối — Chỉ khi có yêu cầu hủy được duyệt hoặc khiếu nại hợp lệ, kèm lý do và audit log..

_Ràng buộc chốt T2: cấm đi lùi (FR-ORD-010, FR-ORD-024); đơn online chưa có IPN verify không bao giờ vào Cooking; chỉ Completed mới mở đánh giá và ghi calo; giữ hàng và hạn thanh toán cùng một mốc 15 phút._

### **3.2.7 Thanh toán và tự hủy (US-19, 20)**

**Câu chuyện báo cáo — tiền chạy qua màn hình WF-16 thế nào.**

_Mục tiêu là thu được tiền chắc chắn qua webhook đã verify, không bao giờ tin redirect, và dọn sạch đơn treo để không giữ hàng ảo. Màn hình WF-16 gồm tổng tiền, radio VNPay/MoMo/COD, một mốc đếm ngược 15 phút duy nhất, nút Thanh toán và 3 trạng thái kết quả là thành công đã xác nhận, thất bại thử lại, đã hủy do quá hạn kèm nút Đặt lại._

_Sự kiện step-by-step: (1) khách chọn VNPay hoặc MoMo rồi bấm Thanh toán, hệ thống chuyển sang cổng; (2) khách trả tiền ở cổng rồi được đưa về trang kết quả chỉ để xem, trang này không đổi trạng thái đơn; (3) cổng gọi IPN về server mang mã đơn, số tiền, thời gian và chữ ký; (4) server verify chữ ký, khớp số tiền và mã đơn, rồi trong một transaction chuyển đơn sang Confirmed/paid, biến giữ hàng tạm thành trừ thật, ghi sổ Transaction và bắn WebSocket cho khách, Manager và bếp; (5) chọn COD thì đơn chuyển Confirmed ngay không qua cổng, thu tiền khi giao, shipper nhập số thực thu ở WF-24C; (6) job quét chạy định kỳ: đơn online Pending quá 15 phút chưa có IPN thành công thì chuyển Cancelled lý do Quá hạn thanh toán, nhả hàng và hiện nút Đặt lại một chạm. Dữ liệu nhập: method, redirect payload, IPN payload gồm orderId, amount, signature, timestamp. Ràng buộc chi tiết: chữ ký sai thì từ chối, giữ nguyên đơn và ghi log cảnh báo; bỏ giữa chừng ở cổng thì đơn vẫn Pending để trả tiếp trong 15 phút; IPN về sát phút 15 đúng lúc job chạy thì khóa dòng, bên commit trước thắng; job lũy đẳng chống chạy trùng 2 instance; COD không thuộc diện tự hủy; mọi lần hủy ghi log đối soát; múi giờ chuẩn Asia/Ho_Chi_Minh._

**FR-PAY-001** — Hệ thống phải hỗ trợ ba phương thức thanh toán: VNPay, MoMo (redirect + IPN) và COD.

Hỗ trợ ba phương thức thanh toán VNPay, MoMo theo redirect kèm IPN và COD trên WF-16 để Khách hàng lựa chọn khi chốt đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-002** — Trạng thái thanh toán online chỉ được xác định bởi IPN/webhook có chữ ký hợp lệ; trang redirect phía client không được làm thay đổi trạng thái đơn.

Trạng thái thanh toán online chỉ được xác định bởi IPN có chữ ký hợp lệ, trang redirect phía client không được làm thay đổi trạng thái đơn.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-003** — Khi nhận IPN hợp lệ, Hệ thống phải chuyển đơn sang Confirmed/đã thanh toán và biến giữ hàng tạm thành trừ kho thật.

Khi nhận IPN hợp lệ thì chuyển đơn sang Confirmed đã thanh toán, biến giữ hàng tạm thành trừ kho thật và bắn WebSocket cho Khách hàng, Manager và bếp.

- Ưu tiên: Must (bắt buộc); Nguồn: US-19; Xác minh: kiểm thử.

**FR-PAY-004** — Với COD, Hệ thống phải chuyển đơn sang Confirmed ngay và thu tiền lúc giao.

Với COD thì chuyển đơn sang Confirmed ngay trên WF-16 và thu tiền lúc giao, shipper nhập số thực thu tại WF-24.

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

_Sự kiện step-by-step: (1) khách mở WF-18, nhập cân hôm nay rồi bấm Lưu thì một điểm mới xuất hiện trên biểu đồ đường và cân hiện tại đồng bộ sang hồ sơ, đồng thời kích hoạt tính lại chỉ số theo FR-HLT-011 khi chênh lệch đáng kể; (2) từ hai điểm trở lên biểu đồ vẽ thêm đường xu hướng và mốc mục tiêu, chưa có dữ liệu thì hiện trạng thái trống kèm lời gọi ghi cân lần đầu; (3) khách sang WF-19 xem thanh calo ngày được cộng từ đơn Completed, tick đã ăn và nhập tay nhanh, vượt Target thì thanh chuyển trạng thái cảnh báo bằng biểu tượng kèm chữ; (4) qua nửa đêm thanh tự đặt lại và ngày cũ lùi vào lịch sử. Dữ liệu nhập: cân nặng ngày, tick đã ăn, tên và ki-lô-ca-lo ước lượng của món ngoài. Ràng buộc chi tiết: giá trị phi lý bị chặn kèm khoảng hợp lệ, trùng ngày thì giữ lần nhập mới nhất; biến động trên 5% trong 7 ngày hoặc trên 3 kg mỗi tuần hoặc trên 10 kg mỗi tháng thì hiện cảnh báo và yêu cầu tick xác nhận trước khi lưu nhưng vẫn cho lưu (FR-TRK-001, FR-TRK-003, FR-TRK-006, FR-TRK-007, FR-TRK-008, FR-HLT-012)._

**FR-TRK-001** — Hệ thống phải cho phép ghi cân nặng hằng ngày, tạo một điểm trên biểu đồ đường và đồng bộ vào hồ sơ; khi lệch lớn phải kích hoạt tính lại theo FR-HLT-011.

Cho phép Khách ghi cân nặng hằng ngày trên WF-18 để tạo một điểm mới trên biểu đồ đường và đồng bộ cân hiện tại sang hồ sơ; khi biến động vượt ngưỡng (trên 5% trong 7 ngày, trên 3 kg mỗi tuần hoặc trên 10 kg mỗi tháng) thì kích hoạt tính lại chỉ số theo FR-HLT-011.

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

**FR-TRK-006** — Lượng calo đã nạp phải được tính từ ba nguồn: đơn Completed, tick "đã ăn" và nhập tay nhanh (tên + kcal ước).

Lượng calo đã nạp trên WF-19 được cộng từ ba nguồn là đơn Completed, tick "đã ăn" từng bữa và nhập tay nhanh món ngoài bằng tên cộng kcal ước, nhằm khép kín vòng theo dõi cả món trong và ngoài hệ thống.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

**FR-TRK-007** — Khi lượng nạp vượt Target, Hệ thống phải hiển thị trạng thái cảnh báo (icon + chữ).

Khi lượng nạp vượt Target, thanh calo WF-19 chuyển trạng thái cảnh báo bằng biểu tượng kèm chữ chứ không chỉ đổi màu, để Khách nhận biết rõ việc vượt ngưỡng.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

**FR-TRK-008** — Hệ thống phải đặt lại thanh calo ngày vào nửa đêm và giữ lịch sử các ngày trước.

Thanh calo WF-19 tự đặt lại vào nửa đêm và giữ lịch sử các ngày trước, nhằm chốt số liệu từng ngày mà vẫn tra cứu được tiến trình cũ.

- Ưu tiên: Must (bắt buộc); Nguồn: US-23; Xác minh: kiểm thử.

### **3.2.9 Thông báo real-time (US-25)**

**Câu chuyện báo cáo — thông báo real-time chạy qua chuông WF-21 thế nào.**

_Mục tiêu là bảo đảm khách không bỏ lỡ sự kiện quan trọng nhờ đẩy tức thì trong ứng dụng và gửi thêm email cho sự kiện khẩn. Màn hình WF-21 gồm biểu tượng chuông trên thanh điều hướng với huy hiệu chưa đọc và trang Thông báo với các tab Tất cả, Khẩn, Thường và Tin; mỗi dòng thông báo mang biểu tượng và chữ phân biệt mức, ví dụ đơn quá hạn thanh toán, đơn chuyển sang giai đoạn nấu và thực đơn tuần mới đã sẵn sàng. Các sự kiện bắt buộc đẩy gồm xác nhận đơn, IPN thành công, hủy đơn, khóa và mở tài khoản cùng IPN thất bại, trong đó nhóm khẩn như hủy đơn, khóa tài khoản và IPN thất bại được gửi song song qua ứng dụng và email bằng nhà cung cấp SendGrid (FR-NTF-001, FR-NTF-002)._

_Sự kiện step-by-step: (1) sự kiện phát sinh ở server thì hệ thống lưu thông báo vào cơ sở dữ liệu rồi đẩy ngay qua WebSocket tới phiên đang mở, huy hiệu chưa đọc tăng lên; (2) khách mở tab tương ứng để đọc chi tiết, sự kiện khẩn luôn nổi bật bằng biểu tượng kèm chữ chứ không bao giờ chỉ báo bằng màu; (3) khách ngoại tuyến thì toàn bộ thông báo chờ được bù đầy đủ ở lần đăng nhập kế tiếp, mất kết nối giữa chừng thì client tự nối lại và đồng bộ bù phần bị lỡ. Dữ liệu nhập: mã sự kiện, mức ưu tiên và nội dung đính kèm đơn hoặc tài khoản. Ràng buộc chi tiết: người dùng được tắt mức tin nhưng không được tắt mức khẩn và mức thường; mọi thông báo đều lưu trữ bền vững để đối soát và bù, sự kiện khẩn bắt buộc đi cả hai kênh ứng dụng và email (FR-NTF-003, FR-NTF-004, FR-NTF-005)._

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

Người dùng trên WF-21 được tắt mức "tin" nhưng không được tắt mức "khẩn" và "thường", đồng thời sự kiện khẩn bắt buộc đi song song qua ứng dụng và email bằng SendGrid để không bị chặn nhầm.

- Ưu tiên: Should (nên có); Nguồn: US-25; Xác minh: kiểm thử.

### **3.2.10 Đánh giá món ăn đã xác minh mua hàng (US-26)**

**Câu chuyện báo cáo — khách đánh giá món đã mua thật ở WF-22 thế nào.**

_Mục tiêu là chỉ giữ lại trải nghiệm của người đã ăn thật để điểm số đáng tin cho người đến sau. Màn hình WF-22 gồm khu vực chờ đánh giá liệt kê từng món thuộc đơn Completed kèm nút Đánh giá, biểu mẫu gửi gồm thang sao, ô nhận xét, đính kèm ảnh và nút Gửi, cùng khu vực đã đánh giá với bộ lọc theo số sao và có ảnh kèm điểm trung bình hiển thị ở trang món ăn. Chỉ đơn đi tới Completed mới mở khóa nút này; đơn ở bất kỳ trạng thái nào khác đều không thấy cửa đánh giá (FR-REV-001, FR-REV-004)._

_Sự kiện step-by-step: (1) khách mở WF-22, chọn một món trong đơn Completed rồi gửi thang sao kèm nhận xét và ảnh; (2) server xác minh mua hàng trước khi lưu, lời gọi thiếu đơn Completed cho món đó bị trả lỗi 403 và không lưu gì; (3) mỗi đơn chỉ gửi một đánh giá cho một món và được sửa trong 7 ngày thay vì gửi thêm bản mới; (4) đánh giá vi phạm thì Admin ẩn đi và tác giả nhận thông báo nêu rõ lý do, thao tác ẩn được ghi nhật ký kiểm toán. Dữ liệu nhập: mã đơn Completed, mã món, số sao, nội dung chữ và ảnh đính kèm. Ràng buộc chi tiết: một cặp đơn và món đúng một đánh giá, hết 7 ngày thì khóa sửa; lọc theo sao và có ảnh giúp người đọc kiểm chứng nhanh, điểm trung bình nuôi lại trang danh mục và chi tiết (FR-REV-002, FR-REV-003, FR-REV-005)._

**FR-REV-001** — Hệ thống phải chỉ cho phép gửi đánh giá món ăn (sao, chữ, ảnh) khi đã xác minh mua hàng: có đơn món ăn ở trạng thái Completed.

Chỉ đơn Completed mới mở khóa nút đánh giá sao/chữ/ảnh trên WF-22 cho từng món đã mua, để điểm số phản ánh trải nghiệm ăn thật; các trạng thái khác không thấy cửa đánh giá.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-002** — Khi API đánh giá được gọi mà chưa xác minh mua hàng, Hệ thống phải trả 403 và không lưu đánh giá.

Khi API đánh giá được gọi mà chưa xác minh được đơn Completed cho món đó, server trả 403 và không lưu gì trên WF-22, nhằm chặn spam và gọi API trái phép.

- Ưu tiên: Should (nên có); Nguồn: US-26; Xác minh: kiểm thử.

**FR-REV-003** — Hệ thống phải giới hạn mỗi đơn một đánh giá và cho phép sửa trong 7 ngày.

Mỗi cặp đơn-món chỉ có đúng một đánh giá và được sửa trong 7 ngày thay vì gửi thêm bản mới trên WF-22, để chống nhân bản điểm mà vẫn cho Khách hiệu chỉnh trải nghiệm.

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

_Sự kiện step-by-step: (1) Admin nhập món ở WF-23, hệ thống cảnh báo khi kcal và macro không nhất quán rồi mới cho lưu (FR-ADM-002), sửa giá hoặc tồn kho không làm đổi giá đã chụp của đơn cũ (FR-ADM-003), xóa món đã dính đơn cũ thì ưu tiên ẩn mềm kèm xác nhận (FR-ADM-004), tồn kho về 0 thì chuyển ngay sang Hết hàng (FR-ADM-005); (2) đầu ca Manager mở WF-24A, hàng Pending xếp theo giờ giao, bấm xác nhận để chuyển Pending thành Confirmed hoặc từ chối kèm lý do để chuyển thành Rejected, đơn online chỉ được xác nhận khi đã có IPN xác minh (FR-ADM-011, FR-ADM-009); (3) khách đã vào Cooking trở đi muốn hủy thì gửi yêu cầu hủy, Manager duyệt để chuyển thành Cancelled kèm điều chỉnh kho và tiền hoặc từ chối duyệt kèm lý do; (4) đơn sang Ready thì Manager gán và đổi shipper ngay trên WF-24A; (5) bếp mở WF-24B chỉ thấy đơn Confirmed thuộc ca mình, bấm bắt đầu nấu để chuyển Confirmed thành Cooking rồi bấm món sẵn sàng để chuyển Cooking thành Ready, không sửa giá tiền và không tự hủy đơn (FR-ADM-012); (6) shipper mở WF-24C chỉ thấy đơn Manager gán cho mình, bấm nhận hàng và xuất phát để chuyển Ready thành Delivering, sau đó chốt giao thành công để chuyển thành Completed với đơn COD bắt buộc nhập số tiền thực thu, hoặc chốt giao thất bại kèm lý do và ảnh minh chứng để chuyển thành Failed (FR-ADM-013); (7) đơn Failed nằm lại hàng đợi ngoại lệ của Manager để hẹn giao lại thành Ready hoặc hủy có hoàn tiền thành Cancelled._

_Dữ liệu nhập gồm thông tin món và tồn kho ở WF-23, nút xác nhận và lý do từ chối bắt buộc, mã shipper được gán, yêu cầu hủy của khách, lý do thất bại và ảnh minh chứng, số COD thực thu ở WF-24C. Ràng buộc chi tiết là chỉ cho chuyển trạng thái theo chiều tiến và đồng bộ real-time cho khách hàng (FR-ADM-008), đơn online chưa verify IPN không bao giờ vào Cooking, bảng đơn có phân trang và lọc theo trạng thái, ngày, từ khóa (FR-ADM-007), hai Admin sửa cùng món thì phát hiện xung đột bằng khóa lạc quan (FR-ADM-006)._

_Trường hợp biên là khách tự hủy ở WF-15 khi đơn còn Pending hoặc Confirmed chưa nấu và đủ điều kiện thì hủy ngay không cần duyệt, đã vào Cooking thì nút tự hủy ẩn đi; bấm nhầm món sẵn sàng thì bếp không tự rút lại được mà gọi Manager xử lý; chênh lệch COD thiếu hoặc thừa thì ghi đúng số thực thu để Manager đối soát cuối ca. Admin không trực đơn hằng ngày mà giữ vai quản trị là tạo và phân quyền tài khoản Manager, Kitchen, Delivery cùng cấu hình giờ chốt bếp, chỉ can thiệp đơn đang vận hành khi vượt quyền Manager với lý do bắt buộc (FR-ADM-015); mọi lần duyệt hủy, gán đổi shipper, xử lý Failed và chỉnh tiền hàng đều ghi audit log gồm người làm, việc làm, mã đơn, thời điểm, lý do và đẩy thông báo real-time cho khách hàng (FR-ADM-014). Ma trận WF-04 chỉ ẩn menu ở giao diện, mọi gọi API trái vai trò như Manager tạo tài khoản hay sửa cấu hình, bếp xem báo cáo hay chạm tiền, shipper tự hủy đơn đều bị server trả 403._

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

**FR-ADM-007** — Hệ thống phải hiển thị bảng đơn cho Admin, phân trang, lọc theo trạng thái, ngày và từ khóa.

Bảng đơn vận hành hiển thị phân trang kèm lọc theo trạng thái, ngày và từ khóa, giúp người trực tìm nhanh đơn cần xử lý trong ngày cao điểm.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

**FR-ADM-008** — Hệ thống phải cho Admin chuyển trạng thái đơn theo chiều tiến (Confirmed → Cooking → Delivering → Completed) và đồng bộ real-time cho Khách hàng.

Đơn chỉ được chuyển trạng thái theo chiều tiến (Confirmed → Cooking → Delivering → Completed) và đồng bộ real-time cho Khách hàng, nhằm giữ dòng vận hành một chiều không đi lùi.

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

**FR-ADM-015** — Hệ thống phải giới hạn Admin ở vai quản trị: tạo và phân quyền tài khoản Manager, Kitchen Staff, Delivery Staff, chỉnh cấu hình giờ chốt bếp và tham số nghiệp vụ; Admin chỉ can thiệp đơn đang vận hành trong trường hợp ngoại lệ vượt quyền Manager, bắt buộc nhập lý do và ghi audit log.

Admin giữ vai quản trị là tạo và phân quyền tài khoản Manager/Kitchen/Delivery cùng chỉnh cấu hình giờ chốt bếp và tham số nghiệp vụ, chỉ can thiệp đơn đang vận hành trong ngoại lệ vượt quyền Manager với lý do bắt buộc và audit log; mọi gọi API trái vai trò như Manager tạo tài khoản hay sửa cấu hình đều bị server trả 403 theo ma trận WF-04.

- Ưu tiên: Must (bắt buộc); Nguồn: US-28; Xác minh: kiểm thử.

_Về quan hệ giữa FR-ADM-007..010 cũ và FR-ADM-011..015 mới: bốn yêu cầu cũ giữ nguyên để không vỡ truy vết, trong đó chủ ngữ "Admin" được hiểu là người trực vận hành trước đây. Từ bản này, việc trực đơn hằng ngày chuyển sang Manager (FR-ADM-011, FR-ADM-014), bếp và shipper mỗi bên chỉ thao tác đúng khâu của mình (FR-ADM-012, FR-ADM-013), còn Admin lùi về quản trị tài khoản, phân quyền, cấu hình và can thiệp ngoại lệ có lý do (FR-ADM-015). Ma trận quyền chi tiết xem WF-04 ở tài liệu wireframe, bảng đơn ba góc nhìn xem WF-24._

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