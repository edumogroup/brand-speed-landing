# Cài đặt SePay cho BRAND SPEED — Founding Cohort

## Đã xong (tự động)

- [x] Checkout 2 bước trong `index.html`: **Bước 1** — form Họ tên/SĐT/Email → **Bước 2** — hiện mã QR (chuyển tab bằng JS thuần, không cần thư viện)
- [x] Mã QR thật — MBBank · 888888393988 · HOANG QUOC HUYNH — không cần API key để hiển thị, khách quét là chuyển khoản được ngay. Nội dung CK giờ tự sinh riêng cho từng khách (`BRANDSPEED` + số điện thoại) thay vì dùng chung 1 mã cho tất cả
- [x] `api/save-lead.js` — nhận thông tin khách ngay khi qua Bước 2, báo Telegram tức thì **trước cả khi họ chuyển khoản** (có tên/SĐT/email dù họ bỏ dở không thanh toán)
- [x] `api/sepay-webhook.js` — đã cập nhật để tách SĐT ra từ nội dung CK, hiện cạnh tin nhắn để khớp với lead đã báo ở Bước 1
- [x] `.env.example` — template biến môi trường, không chứa key thật

## Việc anh/chị tự làm (em không thể làm thay)

### 1. Deploy trang trước (nếu chưa)
Webhook cần một URL thật để SePay gọi tới — chạy `/deploy` để đưa `output/brand-speed/` lên Vercel trước. Sau khi deploy, cấu trúc `api/sepay-webhook.js` sẽ tự động thành endpoint `https://<domain-của-anh-chị>/api/sepay-webhook`.

### 2. Lấy API Key từ SePay
1. Đăng nhập **my.sepay.vn**
2. Vào **Cấu hình / Tích hợp → API** (hoặc mục tương đương — giao diện SePay có thể đổi theo thời gian)
3. Tạo API Key mới, copy lại (chỉ hiện 1 lần)

### 3. Dán API Key vào Vercel (không dán vào chat với em)
1. Vào **Vercel Dashboard → Project → Settings → Environment Variables**
2. Thêm biến: `SEPAY_API_KEY` = *(dán key vừa copy)*
3. Redeploy để biến môi trường có hiệu lực

### 4. Cấu hình Webhook trong SePay dashboard
1. Vào **my.sepay.vn → Webhooks**
2. Loại sự kiện: chọn **tiền vào (money in)**
3. URL endpoint: `https://<domain-của-anh-chị>/api/sepay-webhook`
4. Phương thức xác thực: chọn **API Key**, dùng đúng key ở bước 2
5. Lưu lại

### 5. Tạo bot Telegram để nhận thông báo tự động
1. Mở Telegram, tìm **@BotFather**, gửi `/newbot`
2. Đặt tên bot (VD: `BrandSpeed Notify`) và username (phải kết thúc bằng `bot`, VD: `brandspeed_notify_bot`)
3. BotFather trả về **bot token** dạng `123456789:ABCdefGHI...` — copy lại
4. Mở đoạn chat với bot vừa tạo, nhắn bất kỳ tin gì (VD: "hi") để bot ghi nhận anh/chị
5. Mở trình duyệt, truy cập: `https://api.telegram.org/bot<TOKEN_VỪA_COPY>/getUpdates`
6. Tìm số trong `"chat":{"id": ...}` — đó là **chat ID** của anh/chị

### 6. Dán 2 biến Telegram vào Vercel
Vào **Vercel → Settings → Environment Variables**, thêm:
- `TELEGRAM_BOT_TOKEN` = token ở bước 5.3
- `TELEGRAM_CHAT_ID` = chat ID ở bước 5.6

Redeploy để có hiệu lực.

### 7. Test bằng giao dịch nhỏ
Tự chuyển khoản 2.000đ vào chính tài khoản MBBank 888888393988 với nội dung `BRANDSPEED` → trong vài giây, tin nhắn Telegram sẽ tự động báo có tiền vào. Không thấy tin nhắn → xem log Vercel (Project → Deployments → Functions → Logs).

## Nếu bị kẹt

| Vấn đề | Cách xử lý |
|---|---|
| QR không hiện | Kiểm tra lại tham số `acc`/`bank` trong URL ảnh — báo em để chỉnh |
| Webhook không nhận được gì | Chưa deploy, hoặc URL dán sai — xác nhận site đã live chưa |
| Lỗi "Unauthorized" | Kiểm tra 2 việc: (1) `SEPAY_API_KEY` trong Vercel khớp key trong dashboard SePay, và (2) **quan trọng** — mục "Phương thức xác thực" trong SePay Webhooks phải để **API Key**, không phải HMAC-SHA256 (2 kiểu gửi header khác nhau, không tương thích với code hiện tại) |
| Không thấy tin nhắn Telegram dù tiền đã vào | Kiểm tra `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` đã dán đúng và đã redeploy chưa; xem log Vercel để biết lỗi cụ thể |
| Tiền vào nhưng không biết ai chuyển | Bot chỉ báo "có tiền vào" (số tiền, giờ, nội dung CK) — Huynh tự vào lịch sử giao dịch MBBank xem tên/SĐT người chuyển rồi nhắn Zalo xác nhận, phù hợp quy mô 9 người |

## Tự động xác nhận qua Telegram — đã cài đặt

Webhook (`api/sepay-webhook.js`) giờ tự động gửi tin nhắn Telegram cho Huynh ngay khi có giao dịch khớp (tiền vào, đúng tài khoản, nội dung có "BRANDSPEED") — không cần mở dashboard SePay hay check log Vercel thủ công nữa. Chỉ cần hoàn thành bước 5-6 ở trên (tạo bot + dán biến môi trường) là chạy được.

## Trạng thái

- [x] Đã lấy SEPAY_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID và lưu vào Vercel
- [x] Redeploy để nạp biến môi trường mới
- [x] **Test thật thành công 2026-07-18** — chuyển 5.000đ, webhook nhận đúng, xác thực đúng, Telegram đã gửi. Hệ thống thanh toán tự động đã hoạt động đầy đủ.
