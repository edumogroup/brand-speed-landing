# Cài đặt Google Sheet + Email tự động cho BRAND SPEED

## Đã xây xong (tự động, không cần code thêm)

- [x] `google-apps-script/leads-sheet.gs` — script chạy trong Google Sheet, lưu mọi lead + trạng thái thanh toán
- [x] `lib/sheet.js` — gọi Google Sheet để lưu lead, cập nhật, tra cứu khi có tiền vào
- [x] `lib/email.js` — gửi 3 loại email qua Resend (nhắc thanh toán / đã thanh toán / hướng dẫn học tập)
- [x] Đổi cơ chế nhận diện khách: mỗi người có **1 số tiền lẻ riêng** (VD 4.950.037đ) thay vì số tròn chung — vì nội dung chuyển khoản thật của ngân hàng không giữ được mã định danh (đã kiểm chứng từ log giao dịch thật)
- [x] `api/save-lead.js` — khi khách điền Bước 1: lưu vào Sheet + hẹn giờ gửi email nhắc sau 30 phút (tự huỷ nếu thanh toán trước đó)
- [x] `api/sepay-webhook.js` — khi có tiền vào: tra cứu đúng khách theo số tiền, huỷ email nhắc, gửi email "đã thanh toán" + "hướng dẫn học tập", báo Telegram kèm tên/SĐT/email khách

## Việc anh/chị cần tự làm — 2 phần

### Phần 1 — Google Sheet (lưu danh sách khách)

1. Vào **sheets.google.com** (đăng nhập bằng edumogroup@gmail.com) → tạo Sheet mới, đặt tên "BRAND SPEED — Leads"
2. Vào menu **Extensions (Tiện ích mở rộng) → Apps Script**
3. Xoá hết code mẫu, dán toàn bộ nội dung file `google-apps-script/leads-sheet.gs` vào
4. Sửa dòng `const SHEET_SECRET = 'REPLACE_WITH_A_RANDOM_STRING';` — thay bằng 1 chuỗi ngẫu nhiên bất kỳ (VD: `bs2026xk9mQ`), **nhớ lại chuỗi này**
5. Bấm **Deploy (Triển khai) → New deployment (Triển khai mới)**
6. Chọn loại: **Web app**
7. Execute as: **Me** — Who has access: **Anyone**
8. Bấm **Deploy**, Google có thể yêu cầu cấp quyền — chọn tài khoản edumogroup@gmail.com, bấm "Advanced/Nâng cao" → "Go to (unsafe)" nếu có cảnh báo (bình thường vì đây là script tự viết)
9. Copy **Web app URL** hiện ra (dạng `https://script.google.com/macros/s/.../exec`)

→ Đây là `GOOGLE_SHEET_WEBHOOK_URL`. Chuỗi ngẫu nhiên ở bước 4 là `GOOGLE_SHEET_SECRET` — cả 2 dán vào Vercel Environment Variables.

### Phần 2 — Resend (gửi email)

1. Vào **resend.com** → đăng ký tài khoản (miễn phí, 3.000 email/tháng)
2. Vào **Domains → Add Domain** — nhập: **`send.brandspeed.hoanghuynh.vn`** (dùng subdomain riêng cho email, không phải domain chính đang chạy web, để tránh xung đột DNS)
3. Resend hiện ra 3 bản ghi DNS cần thêm (SPF, DKIM, MX) — vào nơi quản lý DNS của domain `hoanghuynh.vn` (nhà cung cấp domain anh/chị đã mua), thêm đúng 3 bản ghi Resend đưa ra
4. Chờ xác minh (thường vài phút đến vài giờ, tối đa 72 giờ) — quay lại Resend xem trạng thái domain chuyển thành "Verified"
5. Vào **API Keys → Create API Key** — copy lại (chỉ hiện 1 lần)

→ Đây là `RESEND_API_KEY`. Đặt thêm:
- `RESEND_FROM_EMAIL` = `hello@send.brandspeed.hoanghuynh.vn` (hoặc địa chỉ khác trên domain đã verify)
- `RESEND_FROM_NAME` = `Huynh - BRAND SPEED`

### Phần 3 — Dán tất cả vào Vercel

Vào **Vercel → Project → Settings → Environment Variables**, thêm đủ 6 biến mới (nhớ tick **Production**):

| Biến | Giá trị |
|---|---|
| `GOOGLE_SHEET_WEBHOOK_URL` | URL Web app ở Phần 1 bước 9 |
| `GOOGLE_SHEET_SECRET` | Chuỗi ngẫu nhiên ở Phần 1 bước 4 |
| `RESEND_API_KEY` | Key ở Phần 2 bước 5 |
| `RESEND_FROM_EMAIL` | `hello@send.brandspeed.hoanghuynh.vn` |
| `RESEND_FROM_NAME` | `Huynh - BRAND SPEED` |

Redeploy sau khi lưu (báo em, em kích hoạt qua git như mọi lần).

## Nội dung email "hướng dẫn học tập" — cần anh/chị điền

File `lib/email.js`, hàm `onboardingEmail()` đang để khung mẫu với các chỗ trống:
- Link nhóm coaching (Zoom/Telegram)
- Lịch coaching nhóm hàng tuần
- Link khóa video quy trình AI
- Link tải bộ 50+ prompt

Khi có link/lịch thật, báo em, em điền thẳng vào code.

## Cách test không cần chuyển khoản thật

Em có thể gửi 1 lead giả tới `/api/save-lead` để kiểm tra toàn bộ chuỗi (lưu Sheet + hẹn email nhắc) mà không cần chờ 30 phút hay chuyển khoản — báo em bất cứ lúc nào muốn test lại.

## Nếu bị kẹt

| Vấn đề | Cách xử lý |
|---|---|
| Sheet không có dữ liệu | Kiểm tra `GOOGLE_SHEET_WEBHOOK_URL`/`GOOGLE_SHEET_SECRET` đã đúng và đã redeploy chưa |
| Email không gửi được | Domain Resend chưa "Verified", hoặc `RESEND_API_KEY` sai |
| Email vào Spam | DNS records (SPF/DKIM) chưa đúng — kiểm tra lại trong Resend dashboard, tab Records |
| Webhook không tìm ra đúng khách | Khách đã làm tròn số tiền lẻ khi chuyển — không tránh được 100%, đây là lý do vẫn cần Huynh xác nhận qua Zalo trước khi bắt đầu coaching thật |

## Trạng thái

- [x] Google Sheet + Apps Script deploy xong, nhận dữ liệu đúng
- [x] Resend domain verified, gửi + hẹn giờ email thành công
- [x] **Test thật thành công 2026-07-18** — lead giả lưu đúng vào Sheet, email nhắc thanh toán hẹn giờ và gửi đúng
- [ ] Email "đã thanh toán" + "hướng dẫn học tập" — chưa test bằng giao dịch thật (sẽ tự xác nhận ở lần chuyển khoản thật tiếp theo)
- [ ] Nội dung "hướng dẫn học tập" vẫn là khung mẫu — cần anh/chị cung cấp link Zoom/tài liệu/lịch thật
